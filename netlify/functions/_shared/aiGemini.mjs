import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import { estimateGeminiCostMicroUsd, withTimeout } from "./aiLimits.mjs";
import { AI_OBSERVATION_OUTPUT_JSON_SCHEMA, parseAiObservationOutput } from "./aiOutputSchema.mjs";
import { SYSTEM_INSTRUCTION, buildObservationPrompt } from "./aiPrompt.mjs";

const FILE_PROCESSING_POLL_MS = 5000;
const FILE_PROCESSING_MAX_MS = 60000;
const SAFE_EXTENSIONS_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["video/mp4", ".mp4"],
  ["video/quicktime", ".mov"],
  ["video/webm", ".webm"],
]);

export function createGeminiClient(config) {
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

function getLocalExtension(mimeType, storagePath) {
  return SAFE_EXTENSIONS_BY_MIME.get(mimeType) ?? extname(storagePath).slice(0, 8) ?? ".bin";
}

async function blobToBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

function getUsageTokens(interaction) {
  const usage = interaction?.usageMetadata ?? interaction?.usage ?? {};
  const inputTokens = Number(
    usage.inputTokenCount ??
      usage.promptTokenCount ??
      usage.input_tokens ??
      usage.prompt_tokens,
  );
  const outputTokens = Number(
    usage.outputTokenCount ??
      usage.candidatesTokenCount ??
      usage.output_tokens ??
      usage.completion_tokens,
  );
  const totalTokens = Number(
    usage.totalTokenCount ??
      usage.total_tokens ??
      (Number.isFinite(inputTokens) && Number.isFinite(outputTokens) ? inputTokens + outputTokens : NaN),
  );

  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    !Number.isSafeInteger(totalTokens) ||
    inputTokens < 0 ||
    outputTokens < 0 ||
    totalTokens < inputTokens + outputTokens
  ) {
    throw aiHttpError(422, AI_ERROR.AI_OUTPUT_INVALID);
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function bufferMatchesMimeType(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }

  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }

  if (mimeType === "video/webm") {
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }

  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }

  return false;
}

function mapProviderError(error) {
  if (error?.name === "AbortError") {
    return aiHttpError(503, AI_ERROR.GEMINI_TIMEOUT);
  }

  const status = Number(error?.status ?? error?.code);

  if (status === 429) {
    return aiHttpError(429, AI_ERROR.GEMINI_RATE_LIMITED);
  }

  if (status >= 500 && status <= 599) {
    return aiHttpError(503, AI_ERROR.MEDIA_UNAVAILABLE);
  }

  return aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
}

async function waitForGeminiFileActive({ client, file, timeoutMs }) {
  const startedAt = Date.now();
  let currentFile = file;

  while (currentFile?.state === "PROCESSING") {
    if (Date.now() - startedAt > Math.min(timeoutMs, FILE_PROCESSING_MAX_MS)) {
      throw aiHttpError(503, AI_ERROR.GEMINI_TIMEOUT);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, FILE_PROCESSING_POLL_MS);
    });
    currentFile = await client.files.get({ name: currentFile.name });
  }

  if (currentFile?.state === "FAILED") {
    throw aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
  }

  return currentFile;
}

async function downloadStorageFile({ supabase, requirement }) {
  const { data, error } = await supabase.storage.from(requirement.bucket).download(requirement.storagePath);

  if (error || !data) {
    throw aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
  }

  const buffer = await blobToBuffer(data);

  if (buffer.length !== requirement.sizeBytes) {
    throw aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
  }

  if (data.type && data.type.toLowerCase() !== requirement.mimeType) {
    throw aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
  }

  if (!bufferMatchesMimeType(buffer, requirement.mimeType)) {
    throw aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
  }

  return buffer;
}

async function uploadMediaFiles({ client, supabase, storageRequirements, timeoutMs }) {
  const uploadedFiles = [];
  const localPaths = [];

  try {
    for (const requirement of storageRequirements) {
      const buffer = await downloadStorageFile({ supabase, requirement });
      const extension = getLocalExtension(requirement.mimeType, requirement.storagePath);
      const localPath = join(tmpdir(), `hoshizora-ai-${randomUUID()}${extension}`);
      localPaths.push(localPath);
      await writeFile(localPath, buffer);
      const uploadedFile = await client.files.upload({
        file: localPath,
        config: { mimeType: requirement.mimeType },
      });
      const activeFile = requirement.mimeType.startsWith("video/")
        ? await waitForGeminiFileActive({ client, file: uploadedFile, timeoutMs })
        : uploadedFile;
      uploadedFiles.push({
        type: requirement.mimeType.startsWith("video/") ? "video" : "image",
        name: activeFile.name,
        uri: activeFile.uri,
        mimeType: activeFile.mimeType ?? requirement.mimeType,
      });
    }

    return {
      uploadedFiles,
      async cleanup() {
        await cleanupGeminiFiles(client, uploadedFiles);
        await cleanupLocalFiles(localPaths);
      },
    };
  } catch (error) {
    await cleanupGeminiFiles(client, uploadedFiles);
    await cleanupLocalFiles(localPaths);

    if (error?.status) {
      throw error;
    }

    throw aiHttpError(503, AI_ERROR.GEMINI_UPLOAD_FAILED);
  }
}

async function cleanupGeminiFiles(client, uploadedFiles) {
  await Promise.allSettled(
    uploadedFiles
      .filter((file) => file.name)
      .map((file) => client.files.delete({ name: file.name })),
  );
}

async function cleanupLocalFiles(localPaths) {
  await Promise.allSettled(localPaths.map((path) => unlink(path)));
}

function buildGeminiInput({ post, mediaRows, uploadedFiles }) {
  const prompt = buildObservationPrompt({ post, mediaRows });
  const input = [{ type: "text", text: prompt }];

  if (post.type === "youtube") {
    input.push({
      type: "video",
      uri: post.youtube_url,
    });
    return input;
  }

  for (const file of uploadedFiles) {
    input.push({
      type: file.type,
      uri: file.uri,
      mime_type: file.mimeType,
    });
  }

  return input;
}

export async function runGeminiObservation({
  client,
  config,
  post,
  mediaRows,
  storageRequirements,
  supabase,
}) {
  const mediaUpload = await uploadMediaFiles({
    client,
    supabase,
    storageRequirements,
    timeoutMs: config.observationTimeoutMs,
  });

  try {
    const interaction = await withTimeout(
      () => client.interactions.create({
        model: config.model,
        system_instruction: SYSTEM_INSTRUCTION,
        input: buildGeminiInput({ post, mediaRows, uploadedFiles: mediaUpload.uploadedFiles }),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: AI_OBSERVATION_OUTPUT_JSON_SCHEMA,
        },
        tools: [],
        store: false,
      }),
      config.observationTimeoutMs,
    );
    const parsed = parseAiObservationOutput(interaction?.output_text ?? interaction?.outputText);

    if (!parsed.ok) {
      throw aiHttpError(422, AI_ERROR.AI_OUTPUT_INVALID);
    }

    const usage = getUsageTokens(interaction);
    const actualCostMicroUsd = estimateGeminiCostMicroUsd({
      model: config.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return {
      output: parsed.value,
      usage: {
        ...usage,
        actualCostMicroUsd,
      },
    };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw mapProviderError(error);
  } finally {
    await mediaUpload.cleanup();
  }
}

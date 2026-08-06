import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { AI_ERROR, AiHttpError, aiHttpError } from "./aiErrors.mjs";
import { estimateGeminiCostMicroUsd, withTimeout } from "./aiLimits.mjs";
import { AI_OBSERVATION_OUTPUT_JSON_SCHEMA, parseAiObservationOutput } from "./aiOutputSchema.mjs";
import { SYSTEM_INSTRUCTION, buildObservationPrompt } from "./aiPrompt.mjs";

const FILE_PROCESSING_POLL_MS = 5000;
const FILE_PROCESSING_MAX_MS = 60000;
const MAX_VIDEO_DURATION_SECONDS = 35;
const VIDEO_DURATION_TOLERANCE_SECONDS = 0.75;
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

function readRequiredUsageInteger(usage, key) {
  const value = usage?.[key];

  if (!Number.isSafeInteger(value) || value < 0) {
    throw aiHttpError(422, AI_ERROR.AI_OUTPUT_INVALID);
  }

  return value;
}

function readOptionalUsageInteger(usage, key) {
  const value = usage?.[key];

  if (value === undefined || value === null) {
    return 0;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw aiHttpError(422, AI_ERROR.AI_OUTPUT_INVALID);
  }

  return value;
}

function addUsageIntegers(...values) {
  let total = 0;

  for (const value of values) {
    if (value > Number.MAX_SAFE_INTEGER - total) {
      throw aiHttpError(422, AI_ERROR.AI_OUTPUT_INVALID);
    }
    total += value;
  }

  return total;
}

export function getUsageTokens(interaction) {
  const usage = interaction?.usage ?? interaction?.usageMetadata;
  const inputTokens = readRequiredUsageInteger(usage, "total_input_tokens");
  const visibleOutputTokens = readRequiredUsageInteger(usage, "total_output_tokens");
  const thoughtTokens = readOptionalUsageInteger(usage, "total_thought_tokens");
  const cachedTokens = readOptionalUsageInteger(usage, "total_cached_tokens");
  const toolUseTokens = readOptionalUsageInteger(usage, "total_tool_use_tokens");
  const totalTokens = readRequiredUsageInteger(usage, "total_tokens");
  // Gemini 3.5 Flash Standard bills generated output and thinking tokens at
  // the output rate. The Interactions Usage fields are separate, so persist the
  // billable output sum while keeping provider total_tokens as returned.
  const outputTokens = addUsageIntegers(visibleOutputTokens, thoughtTokens);
  const minimumTotalTokens = addUsageIntegers(inputTokens, visibleOutputTokens, thoughtTokens);

  if (
    totalTokens < minimumTotalTokens ||
    cachedTokens > inputTokens ||
    toolUseTokens > totalTokens
  ) {
    throw aiHttpError(422, AI_ERROR.AI_OUTPUT_INVALID);
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function getGenerateContentUsageTokens(response) {
  const usage = response?.usageMetadata;
  const inputTokens = readRequiredUsageInteger(usage, "promptTokenCount");
  const visibleOutputTokens = readRequiredUsageInteger(usage, "candidatesTokenCount");
  const thoughtTokens = readOptionalUsageInteger(usage, "thoughtsTokenCount");
  const cachedTokens = readOptionalUsageInteger(usage, "cachedContentTokenCount");
  const toolUseTokens = readOptionalUsageInteger(usage, "toolUsePromptTokenCount");
  const totalTokens = readRequiredUsageInteger(usage, "totalTokenCount");
  const outputTokens = addUsageIntegers(visibleOutputTokens, thoughtTokens);
  const minimumTotalTokens = addUsageIntegers(
    inputTokens,
    visibleOutputTokens,
    thoughtTokens,
    toolUseTokens,
  );

  if (totalTokens < minimumTotalTokens || cachedTokens > inputTokens) {
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
  if (error instanceof AiHttpError) {
    return error;
  }

  if (error?.name === "AbortError" || Number(error?.status) === 408) {
    return aiHttpError(503, AI_ERROR.GEMINI_TIMEOUT);
  }

  const status = Number(error?.status ?? error?.code);

  if (status === 429) {
    return aiHttpError(429, AI_ERROR.GEMINI_RATE_LIMITED);
  }

  if (status >= 500 && status <= 599) {
    return aiHttpError(503, AI_ERROR.GEMINI_SERVICE_UNAVAILABLE);
  }

  if (status >= 400 && status <= 499) {
    return aiHttpError(422, AI_ERROR.GEMINI_REQUEST_FAILED);
  }

  if (
    error?.name === "TypeError" ||
    ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ENOTFOUND", "ETIMEDOUT"].includes(error?.code)
  ) {
    return aiHttpError(503, AI_ERROR.GEMINI_CONNECTION_FAILED);
  }

  return aiHttpError(503, AI_ERROR.INTERNAL);
}

function toGenerateContentJsonSchema(value) {
  if (Array.isArray(value)) {
    return value.map(toGenerateContentJsonSchema);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};

  for (const [key, child] of Object.entries(value)) {
    // GenerateContent's JSON Schema subset does not document string length
    // constraints. Runtime validation below still enforces them after parsing.
    if (key === "minLength" || key === "maxLength") {
      continue;
    }
    result[key] = toGenerateContentJsonSchema(child);
  }

  return result;
}

async function runFirstPostTextGenerateContent({
  client,
  config,
  post,
  mediaRows,
  observationContext,
  authorProfile,
  signal,
}) {
  const prompt = buildObservationPrompt({
    post,
    mediaRows,
    observationContext,
    authorProfile,
    isFirstPostWelcome: true,
  });
  const createResponse = (requestSignal) => client.models.generateContent({
    model: config.model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: toGenerateContentJsonSchema(AI_OBSERVATION_OUTPUT_JSON_SCHEMA),
      abortSignal: requestSignal,
      httpOptions: {
        timeout: config.observationTimeoutMs,
        retryOptions: {
          attempts: 1,
        },
      },
    },
  });

  try {
    const response = signal
      ? await createResponse(signal)
      : await withTimeout(createResponse, config.observationTimeoutMs);
    const parsed = parseAiObservationOutput(response?.text, {
      expectedMediaType: post.type,
    });

    if (!parsed.ok) {
      throw aiHttpError(422, AI_ERROR.AI_OUTPUT_INVALID);
    }

    const usage = getGenerateContentUsageTokens(response);
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
    if (error instanceof AiHttpError) {
      throw error;
    }

    throw mapProviderError(error);
  }
}

async function waitForGeminiFileActive({ client, file, timeoutMs }) {
  const startedAt = Date.now();
  let currentFile = file;

  while (currentFile?.state === "PROCESSING") {
    const maxWaitMs = Math.min(timeoutMs, FILE_PROCESSING_MAX_MS);
    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= maxWaitMs) {
      throw aiHttpError(503, AI_ERROR.GEMINI_TIMEOUT);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, Math.min(FILE_PROCESSING_POLL_MS, Math.max(1, maxWaitMs - elapsedMs)));
    });
    currentFile = await client.files.get({ name: currentFile.name });
  }

  if (currentFile?.state === "FAILED") {
    throw aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
  }

  return currentFile;
}

export async function readVideoDurationSeconds(buffer, mimeType) {
  if (!mimeType.startsWith("video/")) {
    return null;
  }

  const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(new Blob([buffer], { type: mimeType })),
  });

  return input.computeDuration();
}

export function assertVideoDurationMatches({ actualDurationSeconds, expectedDurationSeconds }) {
  const actual = Number(actualDurationSeconds);
  const expected = Number(expectedDurationSeconds);

  if (
    !Number.isFinite(actual) ||
    actual <= 0 ||
    actual > MAX_VIDEO_DURATION_SECONDS + 0.05 ||
    !Number.isFinite(expected) ||
    expected <= 0 ||
    Math.abs(actual - expected) > VIDEO_DURATION_TOLERANCE_SECONDS
  ) {
    throw aiHttpError(422, AI_ERROR.MEDIA_UNAVAILABLE);
  }
}

async function downloadStorageFile({ readVideoDuration = readVideoDurationSeconds, requirement, supabase }) {
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

  if (requirement.mimeType.startsWith("video/")) {
    const actualDurationSeconds = await readVideoDuration(buffer, requirement.mimeType);
    assertVideoDurationMatches({
      actualDurationSeconds,
      expectedDurationSeconds: requirement.durationSeconds,
    });
  }

  return buffer;
}

export async function uploadMediaFiles({ client, readVideoDuration, storageRequirements, supabase, timeoutMs }) {
  const uploadedFiles = [];
  const localPaths = [];

  try {
    for (const requirement of storageRequirements) {
      const buffer = await downloadStorageFile({ readVideoDuration, supabase, requirement });
      const extension = getLocalExtension(requirement.mimeType, requirement.storagePath);
      const localPath = join(tmpdir(), `hoshizora-ai-${randomUUID()}${extension}`);
      localPaths.push(localPath);
      await writeFile(localPath, buffer);
      const uploadedFile = await client.files.upload({
        file: localPath,
        config: { mimeType: requirement.mimeType },
      });
      const uploadedRecord = {
        type: requirement.mimeType.startsWith("video/") ? "video" : "image",
        name: uploadedFile.name,
        uri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType ?? requirement.mimeType,
      };
      uploadedFiles.push(uploadedRecord);
      const activeFile = requirement.mimeType.startsWith("video/")
        ? await waitForGeminiFileActive({ client, file: uploadedFile, timeoutMs })
        : uploadedFile;
      uploadedRecord.name = activeFile.name ?? uploadedRecord.name;
      uploadedRecord.uri = activeFile.uri ?? uploadedRecord.uri;
      uploadedRecord.mimeType = activeFile.mimeType ?? uploadedRecord.mimeType;
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

    if (error instanceof AiHttpError) {
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

function buildGeminiInput({
  post,
  mediaRows,
  uploadedFiles,
  observationContext,
  authorProfile,
  isFirstPostWelcome,
}) {
  const prompt = buildObservationPrompt({
    post,
    mediaRows,
    observationContext,
    authorProfile,
    isFirstPostWelcome,
  });
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
  observationContext,
  authorProfile,
  isFirstPostWelcome,
  signal,
}) {
  if (isFirstPostWelcome === true && post.type === "text" && storageRequirements.length === 0) {
    return runFirstPostTextGenerateContent({
      client,
      config,
      post,
      mediaRows,
      observationContext,
      authorProfile,
      signal,
    });
  }

  const mediaUpload = await uploadMediaFiles({
    client,
    supabase,
    storageRequirements,
    timeoutMs: config.observationTimeoutMs,
  });

  try {
    const createInteraction = (requestSignal) => client.interactions.create(
      {
        model: config.model,
        system_instruction: SYSTEM_INSTRUCTION,
        input: buildGeminiInput({
          post,
          mediaRows,
          uploadedFiles: mediaUpload.uploadedFiles,
          observationContext,
          authorProfile,
          isFirstPostWelcome,
        }),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: AI_OBSERVATION_OUTPUT_JSON_SCHEMA,
        },
        tools: [],
        store: false,
      },
      {
        retries: { strategy: "none" },
        timeout_ms: config.observationTimeoutMs,
        signal: requestSignal,
      },
    );
    const interaction = signal
      ? await createInteraction(signal)
      : await withTimeout(createInteraction, config.observationTimeoutMs);
    const parsed = parseAiObservationOutput(interaction?.output_text ?? interaction?.outputText, {
      expectedMediaType: post.type,
    });

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
    if (error instanceof AiHttpError) {
      throw error;
    }

    throw mapProviderError(error);
  } finally {
    await mediaUpload.cleanup();
  }
}

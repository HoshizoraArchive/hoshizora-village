import { timingSafeEqual } from "node:crypto";
import { readAiObservationConfig, UUID_PATTERN } from "./_shared/aiConfig.mjs";
import {
  AI_ERROR,
  AiHttpError,
  aiHttpError,
  errorResponse,
  jsonResponse,
  logAiEvent,
} from "./_shared/aiErrors.mjs";
import { createGeminiClient } from "./_shared/aiGemini.mjs";
import { runAiObservationJob } from "./_shared/aiObservationWorker.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";
import { assertJsonRequest, readStrictJsonBody } from "./_shared/aiValidation.mjs";

function getRequestId(context) {
  return context?.requestId ?? crypto.randomUUID();
}

function isValidWorkerSecret(receivedSecret, expectedSecret) {
  if (typeof receivedSecret !== "string" || typeof expectedSecret !== "string") {
    return false;
  }

  const received = Buffer.from(receivedSecret);
  const expected = Buffer.from(expectedSecret);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

function validateWorkerPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  const keys = Object.keys(payload);

  if (keys.length !== 1 || keys[0] !== "jobId" || typeof payload.jobId !== "string" || !UUID_PATTERN.test(payload.jobId)) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  return {
    jobId: payload.jobId.toLowerCase(),
  };
}

export default async function handler(request, context) {
  const requestId = getRequestId(context);
  const startedAt = Date.now();

  try {
    if (request.method !== "POST") {
      throw aiHttpError(405, AI_ERROR.METHOD_NOT_ALLOWED);
    }

    assertJsonRequest(request);
    let config;

    try {
      config = readAiObservationConfig();
    } catch {
      throw aiHttpError(503, AI_ERROR.CONFIGURATION_ERROR);
    }

    if (!config.enabled) {
      throw aiHttpError(503, AI_ERROR.DISABLED);
    }

    const receivedSecret = request.headers.get("x-ai-worker-secret") ?? "";

    if (!isValidWorkerSecret(receivedSecret, config.workerSharedSecret)) {
      throw aiHttpError(403, AI_ERROR.FORBIDDEN);
    }

    const payload = validateWorkerPayload(await readStrictJsonBody(request));
    const supabase = createSupabaseAdminClient(config);
    const geminiClient = createGeminiClient(config);
    const result = await runAiObservationJob({
      jobId: payload.jobId,
      requestId,
      supabase,
      config,
      geminiClient,
    });

    logAiEvent("info", "ai_observation_worker_accepted", {
      requestId,
      jobId: payload.jobId,
      operation: "ai_observation_worker",
      status: 202,
      code: result?.outcome ?? "accepted",
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(202, {
      accepted: true,
      requestId,
    });
  } catch (error) {
    const safeError = error instanceof AiHttpError ? error : aiHttpError(503, AI_ERROR.INTERNAL);

    logAiEvent(safeError.status >= 500 ? "error" : "warn", "ai_observation_worker_request_failed", {
      requestId,
      operation: "ai_observation_worker",
      status: safeError.status,
      code: safeError.code,
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(safeError, requestId);
  }
}

export const config = {
  path: "/api/ai-observation-worker",
  method: ["POST"],
  background: true,
};

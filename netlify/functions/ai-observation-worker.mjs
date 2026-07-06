import { readAiObservationConfig } from "./_shared/aiConfig.mjs";
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
import { getClientIp, assertRateLimit, readAiRateLimitConfig } from "./_shared/aiRateLimit.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";
import { assertJsonRequest, readStrictJsonBody } from "./_shared/aiValidation.mjs";
import { verifyWorkerDispatchPayload } from "./_shared/aiWorkerDispatch.mjs";

function getRequestId(context) {
  return context?.requestId ?? crypto.randomUUID();
}

function toSafeError(error) {
  if (error instanceof AiHttpError) {
    return error;
  }

  if (error instanceof Error && error.message.startsWith("invalid_env:")) {
    return aiHttpError(503, AI_ERROR.CONFIGURATION_ERROR);
  }

  return aiHttpError(503, AI_ERROR.INTERNAL);
}

export default async function handler(request, context) {
  const requestId = getRequestId(context);
  const startedAt = Date.now();
  const clientIp = getClientIp(request, context);

  try {
    const rateLimits = readAiRateLimitConfig();

    if (request.method !== "POST") {
      throw aiHttpError(405, AI_ERROR.METHOD_NOT_ALLOWED);
    }

    assertRateLimit({
      scope: "ai-worker-ip",
      key: clientIp,
      limit: rateLimits.workerIpLimit,
      windowSeconds: rateLimits.windowSeconds,
    });
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

    const payload = verifyWorkerDispatchPayload(await readStrictJsonBody(request), {
      secret: config.workerSharedSecret,
      ttlSeconds: config.workerDispatchTtlSeconds,
    });
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
    const safeError = toSafeError(error);

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

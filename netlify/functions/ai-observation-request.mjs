import { readAiObservationConfig } from "./_shared/aiConfig.mjs";
import { requireAiOperator } from "./_shared/aiAuth.mjs";
import {
  AI_ERROR,
  AiHttpError,
  aiHttpError,
  errorResponse,
  jsonResponse,
  logAiEvent,
} from "./_shared/aiErrors.mjs";
import { reserveAiObservationJob } from "./_shared/aiJobReservation.mjs";
import { cancelAiObservationJob } from "./_shared/aiJobState.mjs";
import { validateCurrentPostInput } from "./_shared/aiObservationData.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";
import {
  assertJsonRequest,
  readStrictJsonBody,
  validateObservationRequestPayload,
} from "./_shared/aiValidation.mjs";

function getRequestId(context) {
  return context?.requestId ?? crypto.randomUUID();
}

async function readConfigOrThrow() {
  try {
    const config = readAiObservationConfig();

    if (!config.enabled) {
      throw aiHttpError(503, AI_ERROR.DISABLED);
    }

    return config;
  } catch (error) {
    if (error instanceof AiHttpError) {
      throw error;
    }

    throw aiHttpError(503, AI_ERROR.CONFIGURATION_ERROR);
  }
}

async function dispatchWorker({ request, config, jobId }) {
  const workerUrl = new URL("/api/ai-observation-worker", request.url);
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-worker-secret": config.workerSharedSecret,
    },
    body: JSON.stringify({ jobId }),
  });

  if (!response.ok) {
    throw aiHttpError(503, AI_ERROR.WORKER_DISPATCH_FAILED);
  }
}

async function handleGet(request, requestId, startedAt) {
  const config = await readConfigOrThrow();
  const supabase = createSupabaseAdminClient(config);
  await requireAiOperator({ request, supabase, config });

  logAiEvent("info", "ai_observation_operator_allowed", {
    requestId,
    operation: "ai_observation_request_get",
    status: 200,
    code: "allowed",
    durationMs: Date.now() - startedAt,
  });

  return jsonResponse(200, {
    allowed: true,
    enabled: true,
    requestId,
  });
}

async function handlePost(request, requestId, startedAt) {
  assertJsonRequest(request);
  const payload = validateObservationRequestPayload(await readStrictJsonBody(request));
  const config = await readConfigOrThrow();
  const supabase = createSupabaseAdminClient(config);
  const operator = await requireAiOperator({ request, supabase, config });
  const { post, mediaRows, mediaSummary } = await validateCurrentPostInput({ supabase, postId: payload.postId });
  const job = await reserveAiObservationJob({
    supabase,
    operatorUserId: operator.id,
    payload,
    post,
    mediaRows,
    mediaSummary,
    config,
  });

  try {
    await dispatchWorker({ request, config, jobId: job.jobId });
  } catch (error) {
    await cancelAiObservationJob({
      supabase,
      jobId: job.jobId,
      publicErrorCode: AI_ERROR.WORKER_DISPATCH_FAILED[0],
    });
    throw error;
  }

  logAiEvent("info", "ai_observation_job_reserved", {
    requestId,
    jobId: job.jobId,
    operation: "reserve_ai_observation_job",
    status: 202,
    code: "queued",
    durationMs: Date.now() - startedAt,
  });

  return jsonResponse(202, {
    jobId: job.jobId,
    status: job.status,
    requestId,
  });
}

export default async function handler(request, context) {
  const requestId = getRequestId(context);
  const startedAt = Date.now();

  try {
    if (request.method === "GET") {
      return await handleGet(request, requestId, startedAt);
    }

    if (request.method !== "POST") {
      throw aiHttpError(405, AI_ERROR.METHOD_NOT_ALLOWED);
    }

    return await handlePost(request, requestId, startedAt);
  } catch (error) {
    const safeError = error instanceof AiHttpError ? error : aiHttpError(503, AI_ERROR.INTERNAL);

    logAiEvent(safeError.status >= 500 ? "error" : "warn", "ai_observation_request_failed", {
      requestId,
      operation: "ai_observation_request",
      status: safeError.status,
      code: safeError.code,
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(safeError, requestId);
  }
}

export const config = {
  path: "/api/ai-observation-request",
  method: ["GET", "POST"],
};

import { readAiObservationConfig } from "./_shared/aiConfig.mjs";
import { requireAuthenticatedUser } from "./_shared/aiAuth.mjs";
import { getAutomaticChiaObservationEligibility } from "./_shared/aiAutoObservation.mjs";
import { dispatchAiObservationWorker } from "./_shared/aiDispatch.mjs";
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
import { loadPostAndMedia } from "./_shared/aiObservationData.mjs";
import { recoverStaleProcessingJobs } from "./_shared/aiStaleJobs.mjs";
import {
  getClientIp,
  assertGlobalProcessingCapacity,
  assertRateLimit,
  readAiRateLimitConfig,
} from "./_shared/aiRateLimit.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";
import {
  assertJsonRequest,
  readStrictJsonBody,
  validatePostMedia,
  validateObservationRequestPayload,
} from "./_shared/aiValidation.mjs";

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

function readConfigOrThrow() {
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

async function loadRequesterProfile({ supabase, userId }) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  return data;
}

function skippedResponse(requestId) {
  return jsonResponse(202, {
    status: "skipped",
    requestId,
  });
}

async function handlePost(request, requestId, startedAt) {
  assertJsonRequest(request);
  const payload = validateObservationRequestPayload(await readStrictJsonBody(request));
  const config = readConfigOrThrow();
  const supabase = createSupabaseAdminClient(config);
  const user = await requireAuthenticatedUser({ request, supabase });

  assertRateLimit({
    scope: "ai-auto-post-user",
    key: user.id,
    limit: config.rateLimits.operatorPostLimit,
    windowSeconds: config.rateLimits.windowSeconds,
  });
  await recoverStaleProcessingJobs({
    supabase,
    config,
    requestId,
    operation: "ai_observation_auto_request",
  });

  const { post, mediaRows } = await loadPostAndMedia(supabase, payload.postId);
  const profile = await loadRequesterProfile({ supabase, userId: user.id });
  const eligibility = getAutomaticChiaObservationEligibility({
    userId: user.id,
    post,
    profile,
    operatorUserIds: config.operatorUserIds,
  });

  if (!eligibility.eligible) {
    logAiEvent("info", "ai_observation_auto_skipped", {
      requestId,
      operation: "ai_observation_auto_request",
      status: 202,
      code: `AUTO_${eligibility.reason.toUpperCase()}`,
      durationMs: Date.now() - startedAt,
    });
    return skippedResponse(requestId);
  }

  const mediaSummary = validatePostMedia(post, mediaRows);

  await assertGlobalProcessingCapacity({
    supabase,
    limit: config.rateLimits.globalProcessingLimit,
    reservedSlots: 1,
  });
  const job = await reserveAiObservationJob({
    supabase,
    operatorUserId: user.id,
    payload,
    post,
    mediaRows,
    mediaSummary,
    config,
  });

  try {
    await dispatchAiObservationWorker({ request, config, jobId: job.jobId });
  } catch (error) {
    await cancelAiObservationJob({
      supabase,
      jobId: job.jobId,
      publicErrorCode: AI_ERROR.WORKER_DISPATCH_FAILED[0],
    });
    throw error;
  }

  logAiEvent("info", "ai_observation_auto_reserved", {
    requestId,
    jobId: job.jobId,
    operation: "ai_observation_auto_request",
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
  const clientIp = getClientIp(request, context);

  try {
    const rateLimits = readAiRateLimitConfig();

    if (request.method !== "POST") {
      throw aiHttpError(405, AI_ERROR.METHOD_NOT_ALLOWED);
    }

    assertRateLimit({
      scope: "ai-auto-post-ip",
      key: clientIp,
      limit: rateLimits.requestPostIpLimit,
      windowSeconds: rateLimits.windowSeconds,
    });
    return await handlePost(request, requestId, startedAt);
  } catch (error) {
    const safeError = toSafeError(error);

    logAiEvent(safeError.status >= 500 ? "error" : "warn", "ai_observation_auto_failed", {
      requestId,
      operation: "ai_observation_auto_request",
      status: safeError.status,
      code: safeError.code,
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(safeError, requestId);
  }
}

export const config = {
  path: "/api/ai-observation-auto-request",
  method: ["POST"],
};

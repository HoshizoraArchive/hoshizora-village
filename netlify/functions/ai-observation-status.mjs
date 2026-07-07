import { readAiObservationConfig, UUID_PATTERN } from "./_shared/aiConfig.mjs";
import { requireAiOperator } from "./_shared/aiAuth.mjs";
import {
  AI_ERROR,
  AiHttpError,
  aiHttpError,
  errorResponse,
  jsonResponse,
  logAiEvent,
} from "./_shared/aiErrors.mjs";
import { getClientIp, assertRateLimit, readAiRateLimitConfig } from "./_shared/aiRateLimit.mjs";
import { recoverStaleProcessingJobs } from "./_shared/aiStaleJobs.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

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

function readJobId(request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId") ?? "";

  if (!UUID_PATTERN.test(jobId)) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  return jobId.toLowerCase();
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

export default async function handler(request, context) {
  const requestId = getRequestId(context);
  const startedAt = Date.now();
  const clientIp = getClientIp(request, context);

  try {
    const rateLimits = readAiRateLimitConfig();

    if (request.method !== "GET") {
      throw aiHttpError(405, AI_ERROR.METHOD_NOT_ALLOWED);
    }

    assertRateLimit({
      scope: "ai-status-ip",
      key: clientIp,
      limit: rateLimits.statusIpLimit,
      windowSeconds: rateLimits.windowSeconds,
    });
    const jobId = readJobId(request);
    const config = readConfigOrThrow();
    const supabase = createSupabaseAdminClient(config);
    const operator = await requireAiOperator({ request, supabase, config });
    assertRateLimit({
      scope: "ai-status-operator",
      key: operator.id,
      limit: config.rateLimits.operatorStatusLimit,
      windowSeconds: config.rateLimits.windowSeconds,
    });
    await recoverStaleProcessingJobs({
      supabase,
      config,
      requestId,
      operation: "ai_observation_status",
    });
    const { data, error } = await supabase
      .from("ai_observation_jobs")
      .select("id, status, public_error_code, observation_id, star_letter_id, created_at, started_at, completed_at, requested_by")
      .eq("id", jobId)
      .eq("requested_by", operator.id)
      .maybeSingle();

    if (error) {
      throw aiHttpError(503, AI_ERROR.INTERNAL);
    }

    if (!data) {
      throw aiHttpError(404, AI_ERROR.NOT_FOUND);
    }

    logAiEvent("info", "ai_observation_status_read", {
      requestId,
      jobId,
      operation: "ai_observation_status",
      status: 200,
      code: data.status,
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(200, {
      jobId: data.id,
      status: data.status,
      publicErrorCode: data.public_error_code,
      observationId: data.observation_id,
      starLetterId: data.star_letter_id,
      createdAt: data.created_at,
      startedAt: data.started_at,
      completedAt: data.completed_at,
      requestId,
    });
  } catch (error) {
    const safeError = toSafeError(error);

    logAiEvent(safeError.status >= 500 ? "error" : "warn", "ai_observation_status_failed", {
      requestId,
      operation: "ai_observation_status",
      status: safeError.status,
      code: safeError.code,
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(safeError, requestId);
  }
}

export const config = {
  path: "/api/ai-observation-status",
  method: ["GET"],
};

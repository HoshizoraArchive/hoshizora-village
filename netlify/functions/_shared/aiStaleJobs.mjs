import { AI_ERROR, logAiEvent } from "./aiErrors.mjs";
import { recoverStaleAiObservationJobs } from "./aiJobState.mjs";

export const STALE_PROCESSING_GRACE_MS = 60 * 1000;
export const STALE_PROCESSING_RECOVERY_LIMIT = 20;

export function getStaleProcessingCutoffIso({
  observationTimeoutMs,
  now = Date.now(),
  graceMs = STALE_PROCESSING_GRACE_MS,
} = {}) {
  if (
    !Number.isSafeInteger(observationTimeoutMs) ||
    observationTimeoutMs <= 0 ||
    !Number.isSafeInteger(graceMs) ||
    graceMs < 0
  ) {
    throw new TypeError("invalid stale processing timeout");
  }

  return new Date(now - observationTimeoutMs - graceMs).toISOString();
}

export async function recoverStaleProcessingJobs({
  supabase,
  config,
  requestId,
  operation,
  now = Date.now(),
  limit = STALE_PROCESSING_RECOVERY_LIMIT,
}) {
  const staleBefore = getStaleProcessingCutoffIso({
    observationTimeoutMs: config.observationTimeoutMs,
    now,
  });
  const recoveredCount = await recoverStaleAiObservationJobs({
    supabase,
    staleBefore,
    publicErrorCode: AI_ERROR.WORKER_STALE[0],
    limit,
  });

  if (recoveredCount > 0) {
    logAiEvent("warn", "ai_observation_stale_jobs_recovered", {
      requestId,
      operation,
      status: 200,
      code: AI_ERROR.WORKER_STALE[0],
      recoveredCount,
    });
  }

  return recoveredCount;
}

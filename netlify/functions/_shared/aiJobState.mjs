import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function throwInternalOnError(error) {
  if (error) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }
}

const OUTCOME_ERROR_MAP = new Map([
  ["invalid_payload", AI_ERROR.AI_OUTPUT_INVALID],
  ["chia_profile_mismatch", AI_ERROR.CHIA_PROFILE_MISMATCH],
  ["post_changed", AI_ERROR.POST_CHANGED],
  ["invalid_status", AI_ERROR.CONFLICT],
  ["max_attempts_exceeded", AI_ERROR.CONFLICT],
  ["invalid_request", AI_ERROR.BAD_REQUEST],
  ["not_found", AI_ERROR.NOT_FOUND],
]);

function assertKnownOutcome(row, allowedOutcomes) {
  const outcome = row?.outcome;

  if (allowedOutcomes.has(outcome)) {
    return row;
  }

  const mappedError = OUTCOME_ERROR_MAP.get(outcome);

  if (mappedError) {
    const status = outcome === "not_found" ? 404 : outcome === "invalid_payload" ? 422 : 409;
    throw aiHttpError(status, mappedError);
  }

  throw aiHttpError(503, AI_ERROR.INTERNAL);
}

export async function cancelAiObservationJob({ supabase, jobId, publicErrorCode = "WORKER_DISPATCH_FAILED" }) {
  const { data, error } = await supabase.rpc("cancel_ai_observation_job", {
    p_job_id: jobId,
    p_public_error_code: publicErrorCode,
  });

  throwInternalOnError(error);
  return assertKnownOutcome(firstRpcRow(data), new Set(["cancelled", "invalid_status"]));
}

export async function claimAiObservationJob({ supabase, jobId }) {
  const { data, error } = await supabase.rpc("claim_ai_observation_job", {
    p_job_id: jobId,
  });

  throwInternalOnError(error);
  return assertKnownOutcome(firstRpcRow(data), new Set([
    "claimed",
    "already_processing",
    "already_succeeded",
    "already_failed",
    "already_cancelled",
  ]));
}

export async function startAiObservationAttempt({ supabase, jobId }) {
  const { data, error } = await supabase.rpc("start_ai_observation_attempt", {
    p_job_id: jobId,
  });

  throwInternalOnError(error);
  return assertKnownOutcome(firstRpcRow(data), new Set(["attempt_started"]));
}

export async function completeAiObservationJob({ supabase, jobId, chiaProfileId, expectedRequestFingerprint, observation, usage }) {
  const { data, error } = await supabase.rpc("complete_ai_observation_job", {
    p_job_id: jobId,
    p_chia_profile_id: chiaProfileId,
    p_expected_request_fingerprint: expectedRequestFingerprint,
    p_observed_points: observation.observedPoints,
    p_analysis_summary: observation.analysisSummary,
    p_should_post: observation.shouldPost,
    p_star_letter_body: observation.starLetter,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens,
    p_total_tokens: usage.totalTokens,
    p_actual_cost_micro_usd: usage.actualCostMicroUsd,
  });

  throwInternalOnError(error);
  return assertKnownOutcome(firstRpcRow(data), new Set(["completed", "already_succeeded"]));
}

export async function failAiObservationJob({ supabase, jobId, publicErrorCode, usage = {} }) {
  const { data, error } = await supabase.rpc("fail_ai_observation_job", {
    p_job_id: jobId,
    p_public_error_code: publicErrorCode,
    p_input_tokens: usage.inputTokens ?? null,
    p_output_tokens: usage.outputTokens ?? null,
    p_total_tokens: usage.totalTokens ?? null,
    p_actual_cost_micro_usd: usage.actualCostMicroUsd ?? null,
  });

  throwInternalOnError(error);
  return assertKnownOutcome(firstRpcRow(data), new Set(["failed", "already_succeeded", "already_failed", "already_cancelled"]));
}

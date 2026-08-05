import { AI_ERROR, AiHttpError, logAiEvent } from "./aiErrors.mjs";
import {
  buildFirstPostFallbackObservation,
  buildFirstPostWelcomeFallback,
} from "./aiFirstPostWelcome.mjs";
import { createRequestFingerprint } from "./aiJobReservation.mjs";
import {
  completeAiObservationJob,
  failAiObservationJob,
  recoverStaleAiObservationJobs,
} from "./aiJobState.mjs";
import {
  loadAuthorProfile,
  validateCurrentPostDatabaseInput,
} from "./aiObservationData.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

export const STALE_PROCESSING_GRACE_MS = 60 * 1000;
export const STALE_PROCESSING_RECOVERY_LIMIT = 20;

const FIRST_POST_FALLBACK_USAGE = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  actualCostMicroUsd: 0,
});

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

async function listStaleFirstPostWelcomeJobs({ supabase, staleBefore, limit }) {
  const { data, error } = await supabase
    .from("ai_observation_jobs")
    .select("id, post_id, request_fingerprint")
    .eq("status", "processing")
    .eq("observation_context", AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME)
    .is("completed_at", null)
    .not("started_at", "is", null)
    .lt("started_at", staleBefore)
    .order("started_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error("stale_first_post_welcome_lookup_failed");
  }

  return data ?? [];
}

function isPostNoLongerRecoverable(error) {
  return error instanceof AiHttpError && (
    error.code === AI_ERROR.POST_CHANGED[0] ||
    error.code === AI_ERROR.NOT_FOUND[0]
  );
}

export async function recoverStaleFirstPostWelcomeJobs({
  supabase,
  config,
  staleBefore,
  limit = STALE_PROCESSING_RECOVERY_LIMIT,
  listJobs = listStaleFirstPostWelcomeJobs,
  validatePost = validateCurrentPostDatabaseInput,
  loadAuthor = loadAuthorProfile,
  createFingerprint = createRequestFingerprint,
  complete = completeAiObservationJob,
  fail = failAiObservationJob,
}) {
  const jobs = await listJobs({ supabase, staleBefore, limit });
  let settledCount = 0;

  for (const job of jobs) {
    try {
      const latest = await validatePost({
        supabase,
        postId: job.post_id,
      });
      const latestFingerprint = createFingerprint({
        post: latest.post,
        mediaRows: latest.mediaRows,
        mediaSummary: latest.mediaSummary,
      });

      if (latestFingerprint !== job.request_fingerprint) {
        await fail({
          supabase,
          jobId: job.id,
          publicErrorCode: AI_ERROR.POST_CHANGED[0],
        });
        settledCount += 1;
        continue;
      }

      const authorProfile = await loadAuthor({
        supabase,
        profileId: latest.post.author_id,
      });
      const firstPostFallbackStarLetterBody = buildFirstPostWelcomeFallback(
        authorProfile,
        latest.post,
      );
      const completion = await complete({
        supabase,
        jobId: job.id,
        chiaProfileId: config.hoshizoraChiaProfileId,
        expectedRequestFingerprint: latestFingerprint,
        observation: buildFirstPostFallbackObservation(),
        usage: FIRST_POST_FALLBACK_USAGE,
        autoStarLetterDailyLimit: config.autoObservation?.starLetterDailyLimit ?? 20,
        autoStarLetterAuthorCooldownSeconds:
          config.autoObservation?.starLetterAuthorCooldownSeconds ?? 21600,
        firstPostFallbackStarLetterBody,
        isFirstPostFallback: true,
      });

      if (["completed", "already_succeeded", "cancelled"].includes(completion?.outcome)) {
        settledCount += 1;
        continue;
      }

      // An unknown completion outcome must not fall through into the generic
      // stale reaper. Keep the welcome eligible for a later safe recovery.
      throw new Error("stale_first_post_welcome_completion_unexpected");
    } catch (error) {
      if (isPostNoLongerRecoverable(error)) {
        await fail({
          supabase,
          jobId: job.id,
          publicErrorCode: AI_ERROR.POST_CHANGED[0],
        });
        settledCount += 1;
        continue;
      }

      if (error instanceof AiHttpError && error.code === AI_ERROR.CONFLICT[0]) {
        continue;
      }

      // Do not let the generic stale reaper cancel a first-post welcome when
      // its contextual deterministic fallback could not be safely finalized.
      // Keeping the job processing allows the next scheduled recovery to try
      // again without ever resending Gemini generation.
      throw error;
    }
  }

  return settledCount;
}

export async function recoverStaleProcessingJobs({
  supabase,
  config,
  requestId,
  operation,
  now = Date.now(),
  limit = STALE_PROCESSING_RECOVERY_LIMIT,
  recoverFirstPostWelcomes = recoverStaleFirstPostWelcomeJobs,
}) {
  const staleBefore = getStaleProcessingCutoffIso({
    observationTimeoutMs: config.observationTimeoutMs,
    now,
  });
  const rescuedFirstPostCount = await recoverFirstPostWelcomes({
    supabase,
    config,
    staleBefore,
    limit,
  });

  if (rescuedFirstPostCount > 0) {
    logAiEvent("warn", "ai_observation_stale_first_post_welcomes_rescued", {
      requestId,
      operation,
      status: 200,
      code: "FIRST_POST_WELCOME_FALLBACK",
      recoveredCount: rescuedFirstPostCount,
    });
  }

  // When the specialized rescue filled the whole batch, more stale welcomes
  // may still exist just beyond the query limit. Skip the generic reaper for
  // this cycle so it cannot cancel those remaining first-post welcomes. The
  // next five-minute sweep will rescue the next batch first.
  if (rescuedFirstPostCount >= limit) {
    return rescuedFirstPostCount;
  }

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

  return rescuedFirstPostCount + recoveredCount;
}

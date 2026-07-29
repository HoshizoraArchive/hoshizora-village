import { AI_ERROR, AiHttpError, aiHttpError, logAiEvent } from "./aiErrors.mjs";
import { runGeminiObservation } from "./aiGemini.mjs";
import { createRequestFingerprint } from "./aiJobReservation.mjs";
import {
  cancelAiObservationJob,
  claimAiObservationJob,
  completeAiObservationJob,
  failAiObservationJob,
  startAiObservationAttempt,
} from "./aiJobState.mjs";
import {
  loadAuthorProfile,
  loadChiaProfile,
  validateCurrentPostDatabaseInput,
  validateCurrentPostInput,
  validateCurrentPostStorageInput,
} from "./aiObservationData.mjs";
import { assertGlobalProcessingCapacity } from "./aiRateLimit.mjs";
import { AI_OBSERVATION_CONTEXT, normalizeAiObservationContext } from "./aiObservationContext.mjs";
import {
  buildFirstPostFallbackObservation,
  buildFirstPostWelcomeFallback,
  getFirstPostWelcomeCandidate,
} from "./aiFirstPostWelcome.mjs";
import { applyAutoStarLetterGate } from "./aiStarLetterGate.mjs";
import { withTimeout } from "./aiLimits.mjs";

const OBSERVATION_SUMMARY_MAX_LENGTH = 1200;
const FALLBACK_USAGE = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  actualCostMicroUsd: 0,
});

function compactObservation(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeObservationForDb(output) {
  const observedPoints = [];
  const textObservation = compactObservation(output.text_observation);
  const visualObservation = compactObservation(output.visual_observation);
  const audioObservation = compactObservation(output.audio_observation);
  const lyricObservation = compactObservation(output.lyric_observation);

  if (textObservation) {
    observedPoints.push({ kind: "text", observation: textObservation });
  }

  if (visualObservation) {
    observedPoints.push({ kind: "visual", observation: visualObservation });
  }

  if (audioObservation) {
    observedPoints.push({ kind: "audio", observation: audioObservation });
  }

  if (lyricObservation) {
    observedPoints.push({ kind: "lyric", observation: lyricObservation });
  }

  for (const moment of output.key_moments ?? []) {
    observedPoints.push({
      kind: "moment",
      timestamp: moment.timestamp.trim(),
      observation: moment.observation.trim(),
    });
  }

  observedPoints.push({
    kind: "confidence",
    value: output.confidence,
  });

  const analysisSummary = [textObservation, visualObservation, audioObservation, lyricObservation]
    .filter(Boolean)
    .join("\n")
    .slice(0, OBSERVATION_SUMMARY_MAX_LENGTH);

  return {
    observedPoints,
    analysisSummary,
    shouldPost: output.should_post,
    starLetter: output.star_letter,
    confidence: output.confidence,
  };
}

function mapSafeErrorCode(error) {
  if (error instanceof AiHttpError) {
    return error.code;
  }

  return AI_ERROR.INTERNAL[0];
}

function mapSafeErrorToStatus(error) {
  if (error instanceof AiHttpError) {
    return error.status;
  }

  return 503;
}

async function runProviderWithDeadline({ runProvider, timeoutMs, providerArgs }) {
  try {
    return await withTimeout(
      (signal) => runProvider({
        ...providerArgs,
        signal,
      }),
      timeoutMs,
    );
  } catch (error) {
    if (error?.name === "AbortError" || Number(error?.status) === 408) {
      throw aiHttpError(503, AI_ERROR.GEMINI_TIMEOUT);
    }

    throw error;
  }
}

function canSafelyRetryProvider(error) {
  // The Files upload phase happens before interactions.create. Do not blindly
  // resend a generation after a timeout, connection loss, rate limit, or an
  // unknown provider result because it can duplicate provider work and cost.
  return error instanceof AiHttpError && error.code === AI_ERROR.GEMINI_UPLOAD_FAILED[0];
}

async function runFirstPostProvider({ firstPostWelcome, run }) {
  try {
    return await run();
  } catch (error) {
    if (!firstPostWelcome || !canSafelyRetryProvider(error)) {
      throw error;
    }

    return run();
  }
}

async function completeFirstPostObservation({
  complete,
  firstPostWelcome,
  normalArgs,
  fallbackArgs,
}) {
  if (!firstPostWelcome) {
    return complete(normalArgs);
  }

  try {
    return await complete(normalArgs);
  } catch (firstError) {
    try {
      // Retrying this RPC is safe: the job row remains locked by the RPC and
      // completed jobs return already_succeeded without creating another letter.
      return await complete(normalArgs);
    } catch {
      return complete(fallbackArgs);
    }
  }
}

export async function runAiObservationJob({
  jobId,
  requestId,
  supabase,
  config,
  geminiClient,
  observationContext,
  runProvider = runGeminiObservation,
}) {
  const startedAt = Date.now();
  try {
    await assertGlobalProcessingCapacity({
      supabase,
      limit: config.rateLimits?.globalProcessingLimit ?? 2,
      reservedSlots: 1,
    });
  } catch (error) {
    if (error instanceof AiHttpError && error.status === 429) {
      logAiEvent("warn", "ai_observation_worker_capacity_limited", {
        requestId,
        jobId,
        operation: "ai_observation_worker_capacity",
        status: 429,
        code: error.code,
        durationMs: Date.now() - startedAt,
      });
    }

    throw error;
  }

  const claim = await claimAiObservationJob({ supabase, jobId });

  if (claim?.outcome !== "claimed") {
    logAiEvent("info", "ai_observation_worker_skipped", {
      requestId,
      jobId,
      operation: "claim_ai_observation_job",
      status: 200,
      code: claim?.outcome ?? "not_claimed",
      durationMs: Date.now() - startedAt,
    });
    return {
      outcome: claim?.outcome ?? "not_claimed",
      status: claim?.job_status,
    };
  }

  let providerUsage = null;
  const effectiveObservationContext = normalizeAiObservationContext(
    claim.observation_context ?? observationContext,
  );

  try {
    await loadChiaProfile({ supabase, chiaProfileId: config.hoshizoraChiaProfileId });
    const isAutomaticObservation =
      effectiveObservationContext === AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST ||
      effectiveObservationContext === AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME;
    const firstPostWelcome = isAutomaticObservation
      ? await getFirstPostWelcomeCandidate({
        supabase,
        postId: claim.post_id,
      })
      : { isFirstPostWelcome: false, migrationAvailable: true };

    if (
      effectiveObservationContext === AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME &&
      !firstPostWelcome.isFirstPostWelcome
    ) {
      await cancelAiObservationJob({
        supabase,
        jobId,
        publicErrorCode: "FIRST_POST_NOT_ELIGIBLE",
      });
      return {
        outcome: "cancelled",
        publicErrorCode: "FIRST_POST_NOT_ELIGIBLE",
      };
    }

    const { post, mediaRows, mediaSummary, storageRequirements } =
      await validateCurrentPostDatabaseInput({
        supabase,
        postId: claim.post_id,
      });
    const currentFingerprint = createRequestFingerprint({ post, mediaRows, mediaSummary });

    if (currentFingerprint !== claim.request_fingerprint) {
      throw aiHttpError(422, AI_ERROR.POST_CHANGED);
    }

    const authorProfile = await loadAuthorProfile({ supabase, profileId: post.author_id });
    const firstPostFallbackStarLetterBody = buildFirstPostWelcomeFallback(authorProfile);

    let normalizedObservation;
    let isFirstPostFallback = false;

    try {
      await validateCurrentPostStorageInput({
        supabase,
        storageRequirements,
      });
      await startAiObservationAttempt({ supabase, jobId });
      const { output, usage } = await runFirstPostProvider({
        firstPostWelcome: firstPostWelcome.isFirstPostWelcome,
        run: () => runProviderWithDeadline({
          runProvider,
          timeoutMs: config.observationTimeoutMs,
          providerArgs: {
            client: geminiClient,
            config,
            post,
            mediaRows,
            storageRequirements,
            supabase,
            observationContext: effectiveObservationContext,
            authorProfile,
            isFirstPostWelcome: firstPostWelcome.isFirstPostWelcome,
          },
        }),
      });
      providerUsage = usage;
      normalizedObservation = applyAutoStarLetterGate({
        observation: normalizeObservationForDb(output),
        observationContext: effectiveObservationContext,
        jobId,
        requestFingerprint: claim.request_fingerprint,
        config,
        firstPostWelcomeFallback: firstPostFallbackStarLetterBody,
        isFirstPostWelcome: firstPostWelcome.isFirstPostWelcome,
      });
    } catch (error) {
      if (!firstPostWelcome.isFirstPostWelcome) {
        throw error;
      }

      // A result-unknown generation is never resent. The DB completion RPC
      // records a conservative reserved-cost estimate for this fallback path.
      providerUsage = FALLBACK_USAGE;
      normalizedObservation = buildFirstPostFallbackObservation();
      isFirstPostFallback = true;
    }

    const latest = isFirstPostFallback
      ? await validateCurrentPostDatabaseInput({
        supabase,
        postId: claim.post_id,
      })
      : await validateCurrentPostInput({
        supabase,
        postId: claim.post_id,
      });
    const latestFingerprint = createRequestFingerprint({
      post: latest.post,
      mediaRows: latest.mediaRows,
      mediaSummary: latest.mediaSummary,
    });

    if (latestFingerprint !== claim.request_fingerprint) {
      throw aiHttpError(422, AI_ERROR.POST_CHANGED);
    }

    const normalCompletionArgs = {
      supabase,
      jobId,
      chiaProfileId: config.hoshizoraChiaProfileId,
      expectedRequestFingerprint: latestFingerprint,
      observation: normalizedObservation,
      usage: providerUsage,
      autoStarLetterDailyLimit: config.autoObservation?.starLetterDailyLimit ?? 20,
      autoStarLetterAuthorCooldownSeconds: config.autoObservation?.starLetterAuthorCooldownSeconds ?? 21600,
      firstPostFallbackStarLetterBody,
      isFirstPostFallback,
    };
    const fallbackCompletionArgs = {
      ...normalCompletionArgs,
      observation: buildFirstPostFallbackObservation(),
      usage: providerUsage ?? FALLBACK_USAGE,
      isFirstPostFallback: true,
    };
    const completion = await completeFirstPostObservation({
      complete: completeAiObservationJob,
      firstPostWelcome: firstPostWelcome.isFirstPostWelcome,
      normalArgs: normalCompletionArgs,
      fallbackArgs: fallbackCompletionArgs,
    });

    if (completion?.outcome === "cancelled") {
      logAiEvent("info", "ai_observation_worker_cancelled", {
        requestId,
        jobId,
        operation: "complete_ai_observation_job",
        status: 200,
        code: "FIRST_POST_NOT_ELIGIBLE",
        durationMs: Date.now() - startedAt,
      });
      return completion;
    }

    logAiEvent("info", "ai_observation_worker_completed", {
      requestId,
      jobId,
      operation: "complete_ai_observation_job",
      status: 200,
      code: completion?.outcome ?? "completed",
      durationMs: Date.now() - startedAt,
    });

    return completion;
  } catch (error) {
    const status = mapSafeErrorToStatus(error);
    const code = mapSafeErrorCode(error);

    await failAiObservationJob({
      supabase,
      jobId,
      publicErrorCode: code,
      usage: providerUsage ?? {},
    });

    logAiEvent(status >= 500 ? "error" : "warn", "ai_observation_worker_failed", {
      requestId,
      jobId,
      operation: "ai_observation_worker",
      status,
      code,
      durationMs: Date.now() - startedAt,
    });

    return {
      outcome: "failed",
      publicErrorCode: code,
    };
  }
}

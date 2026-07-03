import { AI_ERROR, AiHttpError, aiHttpError, logAiEvent } from "./aiErrors.mjs";
import { runGeminiObservation } from "./aiGemini.mjs";
import { createRequestFingerprint } from "./aiJobReservation.mjs";
import {
  claimAiObservationJob,
  completeAiObservationJob,
  failAiObservationJob,
  startAiObservationAttempt,
} from "./aiJobState.mjs";
import { loadChiaProfile, validateCurrentPostInput } from "./aiObservationData.mjs";

const OBSERVATION_SUMMARY_MAX_LENGTH = 1200;

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

export async function runAiObservationJob({
  jobId,
  requestId,
  supabase,
  config,
  geminiClient,
  runProvider = runGeminiObservation,
}) {
  const startedAt = Date.now();
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

  try {
    await loadChiaProfile({ supabase, chiaProfileId: config.hoshizoraChiaProfileId });
    const { post, mediaRows, mediaSummary, storageRequirements } = await validateCurrentPostInput({
      supabase,
      postId: claim.post_id,
    });
    const currentFingerprint = createRequestFingerprint({ post, mediaSummary });

    if (currentFingerprint !== claim.request_fingerprint) {
      throw aiHttpError(422, AI_ERROR.POST_CHANGED);
    }

    await startAiObservationAttempt({ supabase, jobId });

    const { output, usage } = await runProvider({
      client: geminiClient,
      config,
      post,
      mediaRows,
      storageRequirements,
      supabase,
    });
    providerUsage = usage;

    const latest = await validateCurrentPostInput({
      supabase,
      postId: claim.post_id,
    });
    const latestFingerprint = createRequestFingerprint({
      post: latest.post,
      mediaSummary: latest.mediaSummary,
    });

    if (latestFingerprint !== claim.request_fingerprint) {
      throw aiHttpError(422, AI_ERROR.POST_CHANGED);
    }

    const observation = normalizeObservationForDb(output);
    const completion = await completeAiObservationJob({
      supabase,
      jobId,
      chiaProfileId: config.hoshizoraChiaProfileId,
      expectedRequestFingerprint: latestFingerprint,
      observation,
      usage,
    });

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

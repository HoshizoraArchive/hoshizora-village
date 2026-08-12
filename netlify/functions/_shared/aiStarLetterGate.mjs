import { createHash } from "node:crypto";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

function deterministicPercent(seed) {
  const digest = createHash("sha256").update(seed).digest();
  const value = digest.readUInt32BE(0);

  return value % 100;
}

function hasMediaObservation(observation) {
  return (observation?.observedPoints ?? []).some((point) =>
    ["visual", "audio", "lyric"].includes(point?.kind),
  );
}

export function shouldAllowAutoStarLetter({
  observation,
  observationContext,
  jobId,
  requestFingerprint,
  config,
  isFirstPostWelcome = false,
}) {
  const isAutomaticObservation =
    observationContext === AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST ||
    observationContext === AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME;

  if (!isAutomaticObservation) {
    return { allowed: Boolean(observation?.shouldPost), reason: "manual_or_non_auto" };
  }

  if (isFirstPostWelcome) {
    return { allowed: true, reason: "first_post_welcome" };
  }

  if (!observation?.shouldPost || !observation.starLetter) {
    return { allowed: false, reason: "model_declined" };
  }

  if (
    observationContext === AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST &&
    hasMediaObservation(observation)
  ) {
    return { allowed: true, reason: "media_observed" };
  }

  const autoConfig = config?.autoObservation ?? {};
  const probabilityPercent = Number(autoConfig.starLetterProbabilityPercent ?? 100);
  const minConfidencePercent = Number(autoConfig.starLetterMinConfidencePercent ?? 75);

  if (!Number.isSafeInteger(probabilityPercent) || probabilityPercent <= 0) {
    return { allowed: false, reason: "probability_zero" };
  }

  // Early beta runs at 100% coverage with the normal confidence setting.
  // An operator can still deliberately raise the minimum-confidence threshold
  // later without having to lower the probability first.
  if (probabilityPercent >= 100 && minConfidencePercent <= 75) {
    return { allowed: true, reason: "probability_full" };
  }

  const confidencePercent = Math.floor(Number(observation.confidence ?? 0) * 100);

  if (!Number.isSafeInteger(confidencePercent) || confidencePercent < minConfidencePercent) {
    return { allowed: false, reason: "low_confidence" };
  }

  if (probabilityPercent >= 100) {
    return { allowed: true, reason: "probability_full" };
  }

  const bucket = deterministicPercent(`${jobId}:${requestFingerprint}:star-letter`);

  return bucket < probabilityPercent
    ? { allowed: true, reason: "probability_passed" }
    : { allowed: false, reason: "probability_skipped" };
}

export function applyAutoStarLetterGate({
  observation,
  observationContext,
  jobId,
  requestFingerprint,
  config,
  firstPostWelcomeFallback = null,
  isFirstPostWelcome = false,
}) {
  const decision = shouldAllowAutoStarLetter({
    observation,
    observationContext,
    jobId,
    requestFingerprint,
    config,
    isFirstPostWelcome,
  });

  if (decision.allowed) {
    return {
      ...observation,
      shouldPost: true,
      starLetter: observation?.starLetter ?? firstPostWelcomeFallback,
      starLetterGateReason: decision.reason,
    };
  }

  return {
    ...observation,
    shouldPost: false,
    starLetter: null,
    starLetterGateReason: decision.reason,
  };
}

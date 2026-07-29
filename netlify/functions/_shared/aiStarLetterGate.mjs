import { createHash } from "node:crypto";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

function deterministicPercent(seed) {
  const digest = createHash("sha256").update(seed).digest();
  const value = digest.readUInt32BE(0);

  return value % 100;
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

  const autoConfig = config?.autoObservation ?? {};
  const confidencePercent = Math.floor(Number(observation.confidence ?? 0) * 100);
  const minConfidencePercent = Number(autoConfig.starLetterMinConfidencePercent ?? 75);

  if (!Number.isSafeInteger(confidencePercent) || confidencePercent < minConfidencePercent) {
    return { allowed: false, reason: "low_confidence" };
  }

  const probabilityPercent = Number(autoConfig.starLetterProbabilityPercent ?? 70);

  if (!Number.isSafeInteger(probabilityPercent) || probabilityPercent <= 0) {
    return { allowed: false, reason: "probability_zero" };
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

import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { applyAutoStarLetterGate, shouldAllowAutoStarLetter } from "./aiStarLetterGate.mjs";

function observation(overrides = {}) {
  return {
    shouldPost: true,
    starLetter: "夜の端に残った小さな光が、ちゃんとここまで届いていたよ。",
    confidence: 0.86,
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    autoObservation: {
      starLetterProbabilityPercent: 100,
      starLetterMinConfidencePercent: 75,
      ...overrides,
    },
  };
}

test("manual observations keep model star-letter decision", () => {
  const result = applyAutoStarLetterGate({
    observation: observation(),
    observationContext: AI_OBSERVATION_CONTEXT.MANUAL,
    jobId: "job",
    requestFingerprint: "fingerprint",
    config: config({ starLetterProbabilityPercent: 0 }),
  });

  assert.equal(result.shouldPost, true);
  assert.equal(result.starLetter, observation().starLetter);
  assert.equal(result.starLetterGateReason, "manual_or_non_auto");
});

test("automatic observations suppress low-confidence star letters", () => {
  const result = applyAutoStarLetterGate({
    observation: observation({ confidence: 0.7 }),
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    jobId: "job",
    requestFingerprint: "fingerprint",
    config: config({ starLetterMinConfidencePercent: 75 }),
  });

  assert.equal(result.shouldPost, false);
  assert.equal(result.starLetter, null);
  assert.equal(result.starLetterGateReason, "low_confidence");
});

test("automatic observations suppress star letters when probability is zero", () => {
  const decision = shouldAllowAutoStarLetter({
    observation: observation(),
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    jobId: "job",
    requestFingerprint: "fingerprint",
    config: config({ starLetterProbabilityPercent: 0 }),
  });

  assert.deepEqual(decision, { allowed: false, reason: "probability_zero" });
});

test("automatic observations allow all star letters when probability is full", () => {
  const result = applyAutoStarLetterGate({
    observation: observation(),
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    jobId: "job",
    requestFingerprint: "fingerprint",
    config: config({ starLetterProbabilityPercent: 100 }),
  });

  assert.equal(result.shouldPost, true);
  assert.equal(result.starLetter, observation().starLetter);
  assert.equal(result.starLetterGateReason, "probability_full");
});

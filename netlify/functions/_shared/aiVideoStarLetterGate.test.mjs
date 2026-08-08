import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { applyAutoStarLetterGate } from "./aiStarLetterGate.mjs";

function videoObservation(overrides = {}) {
  return {
    shouldPost: true,
    starLetter: "声が伸びるところで、画面の光まで一緒にほどけて見えたよ。",
    confidence: 0.4,
    observedPoints: [
      { kind: "visual", observation: "暗い画面の中央で光が広がる。" },
      { kind: "audio", observation: "サビでボーカルが長く伸びる。" },
    ],
    ...overrides,
  };
}

test("observed uploaded videos bypass random probability and confidence suppression", () => {
  const result = applyAutoStarLetterGate({
    observation: videoObservation(),
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    jobId: "job-video",
    requestFingerprint: "fingerprint-video",
    config: {
      autoObservation: {
        starLetterProbabilityPercent: 0,
        starLetterMinConfidencePercent: 100,
      },
    },
  });

  assert.equal(result.shouldPost, true);
  assert.match(result.starLetter, /声/);
  assert.equal(result.starLetterGateReason, "media_observed");
});

test("uploaded-video observation never fabricates a star letter when Gemini declines", () => {
  const result = applyAutoStarLetterGate({
    observation: videoObservation({ shouldPost: false, starLetter: null }),
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    jobId: "job-video",
    requestFingerprint: "fingerprint-video",
    config: undefined,
  });

  assert.equal(result.shouldPost, false);
  assert.equal(result.starLetter, null);
  assert.equal(result.starLetterGateReason, "model_declined");
});

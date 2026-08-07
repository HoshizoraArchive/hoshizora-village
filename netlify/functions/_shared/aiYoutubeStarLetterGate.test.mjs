import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { applyAutoStarLetterGate } from "./aiStarLetterGate.mjs";

function youtubeObservation(overrides = {}) {
  return {
    shouldPost: true,
    starLetter: "サビで声がほどける瞬間、暗い映像の奥から光がにじむみたいに見えたよ。",
    confidence: 0.4,
    observedPoints: [
      { kind: "visual", observation: "暗い背景で人物のシルエットが切り替わる。" },
      { kind: "audio", observation: "サビでボーカルが長く伸びる。" },
    ],
    ...overrides,
  };
}

test("observed YouTube works bypass random probability and confidence suppression", () => {
  const result = applyAutoStarLetterGate({
    observation: youtubeObservation(),
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    jobId: "job-youtube",
    requestFingerprint: "fingerprint-youtube",
    config: {
      autoObservation: {
        starLetterProbabilityPercent: 0,
        starLetterMinConfidencePercent: 100,
      },
    },
  });

  assert.equal(result.shouldPost, true);
  assert.match(result.starLetter, /サビ/);
  assert.equal(result.starLetterGateReason, "youtube_observed");
});

test("YouTube observation never fabricates a star letter when Gemini declines", () => {
  const result = applyAutoStarLetterGate({
    observation: youtubeObservation({ shouldPost: false, starLetter: null }),
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    jobId: "job-youtube",
    requestFingerprint: "fingerprint-youtube",
    config: undefined,
  });

  assert.equal(result.shouldPost, false);
  assert.equal(result.starLetter, null);
  assert.equal(result.starLetterGateReason, "model_declined");
});

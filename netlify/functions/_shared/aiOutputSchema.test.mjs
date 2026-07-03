import assert from "node:assert/strict";
import test from "node:test";
import { validateAiObservationOutput } from "./aiOutputSchema.mjs";

function validOutput(overrides = {}) {
  return {
    media_type: "image",
    visual_observation: "星の色が印象的です。",
    audio_observation: null,
    lyric_observation: null,
    key_moments: [
      {
        timestamp: "00:01",
        observation: "光が強くなります。",
      },
    ],
    confidence: 0.72,
    should_post: true,
    star_letter: "星の光がやさしく届いています。今夜の空に残したい流星便です。",
    ...overrides,
  };
}

test("AI output schema accepts the strict expected shape", () => {
  const result = validateAiObservationOutput(validOutput());

  assert.equal(result.ok, true);
});

test("AI output schema rejects additional properties", () => {
  const result = validateAiObservationOutput(validOutput({ unexpected: "nope" }));

  assert.equal(result.ok, false);
  assert.equal(result.code, "additional_properties");
});

test("AI output schema rejects invalid confidence ranges", () => {
  const result = validateAiObservationOutput(validOutput({ confidence: 1.2 }));

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_confidence");
});

test("AI output schema does not allow public posting without a star letter", () => {
  const result = validateAiObservationOutput(validOutput({ should_post: true, star_letter: null }));

  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_star_letter_for_post");
});

test("AI output schema allows non-posting outputs without star letters", () => {
  const result = validateAiObservationOutput(validOutput({ should_post: false, star_letter: null }));

  assert.equal(result.ok, true);
});

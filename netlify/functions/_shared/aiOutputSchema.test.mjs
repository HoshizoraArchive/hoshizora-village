import assert from "node:assert/strict";
import test from "node:test";
import { validateAiObservationOutput } from "./aiOutputSchema.mjs";

function validOutput(overrides = {}) {
  return {
    media_type: "image",
    text_observation: null,
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
    star_letter: "まだ歌になる前のところまで、ちゃんと光ってたよ。",
    ...overrides,
  };
}

test("AI output schema accepts the strict expected shape", () => {
  const result = validateAiObservationOutput(validOutput(), { expectedMediaType: "image" });

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

test("AI output schema rejects non-posting outputs with star letters", () => {
  const result = validateAiObservationOutput(validOutput({
    should_post: false,
    star_letter: "残さないはずの星文が、ここに残ってしまっています。",
  }));

  assert.equal(result.ok, false);
  assert.equal(result.code, "unexpected_star_letter_for_non_post");
});

test("AI output schema accepts 24-character star letters", () => {
  const result = validateAiObservationOutput(validOutput({ star_letter: "小さな余白の奥まで、ひかりが残っていたよ。" }));

  assert.equal(result.ok, true);
});

test("AI output schema rejects star letters shorter than 20 characters", () => {
  const result = validateAiObservationOutput(validOutput({ star_letter: "短すぎる星文です。" }));

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_star_letter_length");
});

test("AI output schema rejects star letters longer than 80 characters", () => {
  const result = validateAiObservationOutput(validOutput({ star_letter: "あ".repeat(81) }));

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_star_letter_length");
});

test("AI output schema requires text observation for text posts", () => {
  const result = validateAiObservationOutput(validOutput({
    media_type: "text",
    text_observation: null,
    visual_observation: null,
  }), { expectedMediaType: "text" });

  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_text_observation");
});

test("AI output schema rejects media type mismatches against trusted post type", () => {
  assert.equal(validateAiObservationOutput(validOutput({
    media_type: "text",
    text_observation: "本文だけを見た説明です。",
    visual_observation: null,
  }), { expectedMediaType: "image" }).code, "media_type_mismatch");

  assert.equal(validateAiObservationOutput(validOutput({
    media_type: "image",
    visual_observation: "静かな画面です。",
  }), { expectedMediaType: "video" }).code, "media_type_mismatch");

  assert.equal(validateAiObservationOutput(validOutput({
    media_type: "video",
    visual_observation: "映像の光が動いています。",
  }), { expectedMediaType: "youtube" }).code, "media_type_mismatch");
});

test("AI output schema validates minimum observation by trusted post type", () => {
  const result = validateAiObservationOutput(validOutput({
    media_type: "video",
    visual_observation: null,
    audio_observation: "小さな音が残っています。",
  }), { expectedMediaType: "video" });

  assert.equal(result.ok, true);
});

test("AI output schema rejects star letters DB completion would reject", () => {
  assert.equal(validateAiObservationOutput(validOutput({
    star_letter: "小さな余白の奥まで、#光が残っていたよ。",
  })).code, "invalid_star_letter_forbidden_content");
  assert.equal(validateAiObservationOutput(validOutput({
    star_letter: "小さな余白の奥まで、https://example.com が残っていたよ。",
  })).code, "invalid_star_letter_forbidden_content");
  assert.equal(validateAiObservationOutput(validOutput({
    star_letter: "小さな余白の奥まで、\nひかりが残っていたよ。",
  })).code, "invalid_star_letter_format");
  assert.equal(validateAiObservationOutput(validOutput({
    star_letter: " 小さな余白の奥まで、ひかりが残っていたよ。",
  })).code, "invalid_star_letter_format");
  assert.equal(validateAiObservationOutput(validOutput({
    star_letter: "小さな余白の奥まで、ひかりが残っていたよ。",
  })).ok, true);
});

test("AI output schema rejects JSON parse failures through parser", async () => {
  const { parseAiObservationOutput } = await import("./aiOutputSchema.mjs");
  const result = parseAiObservationOutput("{not json");

  assert.equal(result.ok, false);
  assert.equal(result.code, "json_parse_failed");
});

import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { buildObservationPrompt } from "./aiPrompt.mjs";

function buildPrompt(type, body, mediaRows = []) {
  return buildObservationPrompt({
    post: { type, body, youtube_video_id: null },
    mediaRows,
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    authorProfile: { display_name: "村人", username: "villager" },
  });
}

test("early beta text prompt requires a star letter even for short daily posts", () => {
  const prompt = buildPrompt("text", "おはよう世界！");

  assert.match(prompt, /初期β/);
  assert.match(prompt, /挨拶や短い日常投稿でも/);
  assert.match(prompt, /should_post=true/);
  assert.match(prompt, /短い星文を必ず返してください/);
  assert.equal(prompt.includes("星文は毎回返しません"), false);
});

test("early beta image prompt requires actual image observation before the star letter", () => {
  const prompt = buildPrompt(
    "image",
    "目が疲れてる…",
    [{
      media_type: "image",
      mime_type: "image/png",
      sort_order: 0,
      size_bytes: 1024,
      duration_seconds: null,
    }],
  );

  assert.match(prompt, /画像そのものを実際に観測/);
  assert.match(prompt, /visual_observation/);
  assert.match(prompt, /具体的な視覚根拠/);
  assert.match(prompt, /星文を必ず返してください/);
  assert.match(prompt, /画像を実際に観測できない場合.*推測せず/);
});

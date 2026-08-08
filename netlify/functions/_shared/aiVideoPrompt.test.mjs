import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { buildObservationPrompt } from "./aiPrompt.mjs";

test("automatic uploaded-video prompt requires observation of the actual video before writing a star letter", () => {
  const prompt = buildObservationPrompt({
    post: {
      type: "video",
      body: "新しい星映です",
      youtube_video_id: null,
    },
    mediaRows: [
      {
        media_type: "video",
        mime_type: "video/mp4",
        sort_order: 0,
        size_bytes: 1024,
        duration_seconds: 20,
      },
    ],
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    authorProfile: { display_name: "村人", username: "villager" },
  });

  assert.match(prompt, /星映として直接アップロードした動画/);
  assert.match(prompt, /動画そのものの映像・音声を実際に観測/);
  assert.match(prompt, /具体的な根拠を記録できた場合は should_post=true/);
  assert.match(prompt, /観測できない場合は推測せず/);
  assert.equal(prompt.includes("星文は毎回返しません"), false);
});

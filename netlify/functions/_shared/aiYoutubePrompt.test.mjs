import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { buildObservationPrompt } from "./aiPrompt.mjs";

test("automatic YouTube prompt requires observation of the actual video before writing a star letter", () => {
  const prompt = buildObservationPrompt({
    post: {
      type: "youtube",
      body: "新曲です https://youtu.be/DebSQ5_BzEE",
      youtube_video_id: "DebSQ5_BzEE",
    },
    mediaRows: [],
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    authorProfile: { display_name: "Ash", username: "Fate_to_Ash" },
  });

  assert.match(prompt, /YouTube動画そのものの映像・音声を実際に観測/);
  assert.match(prompt, /具体的な根拠を記録できた場合は should_post=true/);
  assert.match(prompt, /観測できない場合は推測せず/);
  assert.equal(prompt.includes("星文は毎回返しません"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { buildObservationPrompt } from "./aiPrompt.mjs";

test("first-post prompt tells Chia to answer a stated friendship as herself", () => {
  const prompt = buildObservationPrompt({
    post: {
      type: "text",
      body: "ちあちゃんの友達のいちけんです！",
      youtube_video_id: null,
    },
    mediaRows: [],
    observationContext: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
    authorProfile: {
      display_name: "いちけん",
      username: "kansoku_ywvt",
    },
    isFirstPostWelcome: true,
  });

  assert.equal(prompt.includes("ちあ本人としてその言葉へ直接返事してください"), true);
  assert.equal(prompt.includes("本文にない関係は作らないでください"), true);
  assert.equal(prompt.includes("<author_call_name>\nいちけんさん\n</author_call_name>"), true);
  assert.equal(prompt.includes("<meteor_text>\nちあちゃんの友達のいちけんです！\n</meteor_text>"), true);
});

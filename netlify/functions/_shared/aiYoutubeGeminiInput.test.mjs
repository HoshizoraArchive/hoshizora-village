import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { runGeminiObservation } from "./aiGemini.mjs";

function youtubeOutput() {
  return JSON.stringify({
    media_type: "youtube",
    text_observation: "投稿本文では新曲として紹介されている。",
    visual_observation: "暗い背景の中で人物のシルエットが切り替わる映像を観測した。",
    audio_observation: "強いビートの上でボーカルが伸びるサビを観測した。",
    lyric_observation: null,
    key_moments: [],
    confidence: 0.91,
    should_post: true,
    star_letter: "サビで声が伸びる瞬間、暗い映像の奥から光がほどけるみたいに見えたよ。",
  });
}

test("Gemini receives the embedded YouTube URL as video input, not only as post text", async () => {
  const calls = [];

  await runGeminiObservation({
    client: {
      interactions: {
        create(request, options) {
          calls.push({ request, options });
          return Promise.resolve({
            output_text: youtubeOutput(),
            usage: {
              total_input_tokens: 600,
              total_output_tokens: 80,
              total_tokens: 680,
            },
          });
        },
      },
      files: {
        delete() {
          return Promise.resolve({});
        },
      },
    },
    config: {
      model: "gemini-3.5-flash",
      observationTimeoutMs: 1000,
    },
    post: {
      id: "22222222-2222-4222-8222-222222222222",
      type: "youtube",
      body: "新曲です https://youtu.be/DebSQ5_BzEE",
      youtube_url: "https://youtu.be/DebSQ5_BzEE",
      youtube_video_id: "DebSQ5_BzEE",
    },
    mediaRows: [],
    storageRequirements: [],
    supabase: {},
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    authorProfile: { display_name: "Ash", username: "Fate_to_Ash" },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].request.input[1], {
    type: "video",
    uri: "https://youtu.be/DebSQ5_BzEE",
  });
  assert.match(calls[0].request.input[0].text, /YouTube動画そのものの映像・音声を実際に観測/);
  assert.equal(calls[0].options.retries.strategy, "none");
});

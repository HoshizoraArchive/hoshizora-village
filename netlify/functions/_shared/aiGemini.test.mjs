import assert from "node:assert/strict";
import test from "node:test";
import {
  assertVideoDurationMatches,
  bufferMatchesMimeType,
  getUsageTokens,
  runGeminiObservation,
  uploadMediaFiles,
} from "./aiGemini.mjs";
import { AI_ERROR } from "./aiErrors.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

test("Gemini media validation checks basic image signatures", () => {
  assert.equal(bufferMatchesMimeType(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), "image/jpeg"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]), "image/png"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from("RIFFxxxxWEBP", "ascii"), "image/webp"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from("not-an-image!"), "image/png"), false);
});

test("Gemini media validation checks basic video signatures", () => {
  assert.equal(bufferMatchesMimeType(Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]), "video/mp4"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]), "video/quicktime"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), "video/webm"), true);
  assert.equal(bufferMatchesMimeType(Buffer.from("not-a-video!"), "video/mp4"), false);
});

function validTextObservationOutput() {
  return JSON.stringify({
    media_type: "text",
    text_observation: "投稿本文の短い揺れを観測した。",
    visual_observation: null,
    audio_observation: null,
    lyric_observation: null,
    key_moments: [],
    confidence: 0.82,
    should_post: true,
    star_letter: "まだ言葉になる前の揺れまで、ちゃんと残っていたよ。",
  });
}

test("Interactions API usage bills output plus thinking tokens and allows optional usage fields to be missing", () => {
  const usage = getUsageTokens({
    usage: {
      total_input_tokens: 533,
      total_output_tokens: 27,
      total_thought_tokens: 230,
      total_tokens: 790,
    },
  });

  assert.deepEqual(usage, {
    inputTokens: 533,
    outputTokens: 257,
    totalTokens: 790,
  });
});

test("Interactions API usage rejects missing or invalid fields", () => {
  assert.throws(
    () => getUsageTokens({ usage: null }),
    (error) => error?.code === AI_ERROR.AI_OUTPUT_INVALID[0],
  );
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: 1,
      total_output_tokens: -1,
      total_tokens: 1,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: 1.1,
      total_output_tokens: 1,
      total_tokens: 2,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: Number.MAX_SAFE_INTEGER + 1,
      total_output_tokens: 1,
      total_tokens: Number.MAX_SAFE_INTEGER + 2,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: 1,
      total_tokens: 1,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_output_tokens: 1,
      total_tokens: 1,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: 1,
      total_output_tokens: 1,
    },
  }));
});

test("Interactions API usage rejects overflow and contradictory totals", () => {
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: 1,
      total_output_tokens: Number.MAX_SAFE_INTEGER,
      total_thought_tokens: 1,
      total_tokens: Number.MAX_SAFE_INTEGER,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: 533,
      total_output_tokens: 27,
      total_thought_tokens: 230,
      total_tokens: 789,
    },
  }));
});

test("Interactions API usage treats missing optional thought/cached/tool fields as zero", () => {
  assert.deepEqual(getUsageTokens({
    usage: {
      total_input_tokens: 533,
      total_output_tokens: 27,
      total_tokens: 560,
    },
  }), {
    inputTokens: 533,
    outputTokens: 27,
    totalTokens: 560,
  });
});

test("video duration validation rejects over-limit or mismatched files", () => {
  assert.doesNotThrow(() => assertVideoDurationMatches({
    actualDurationSeconds: 34.8,
    expectedDurationSeconds: 35,
  }));
  assert.throws(() => assertVideoDurationMatches({
    actualDurationSeconds: 36,
    expectedDurationSeconds: 35,
  }));
  assert.throws(() => assertVideoDurationMatches({
    actualDurationSeconds: 20,
    expectedDurationSeconds: 12,
  }));
});

test("uploaded Gemini files and local tmp files are cleaned after ACTIVE wait timeout", async () => {
  const deletedFiles = [];
  const supabase = {
    storage: {
      from() {
        return {
          download() {
            return Promise.resolve({
              data: new Blob([Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])], {
                type: "video/mp4",
              }),
              error: null,
            });
          },
        };
      },
    },
  };
  const client = {
    files: {
      upload() {
        return Promise.resolve({
          name: "files/test-video",
          uri: "gemini://test-video",
          mimeType: "video/mp4",
          state: "PROCESSING",
        });
      },
      get() {
        return Promise.resolve({
          name: "files/test-video",
          uri: "gemini://test-video",
          mimeType: "video/mp4",
          state: "PROCESSING",
        });
      },
      delete({ name }) {
        deletedFiles.push(name);
        return Promise.resolve({});
      },
    },
  };

  await assert.rejects(
    () => uploadMediaFiles({
      client,
      readVideoDuration: async () => 12,
      storageRequirements: [{
        bucket: "meteor-video",
        storagePath: "33333333-3333-4333-8333-333333333333/batch/0-video.mp4",
        mimeType: "video/mp4",
        sizeBytes: 12,
        durationSeconds: 12,
      }],
      supabase,
      timeoutMs: 1,
    }),
    (error) => error?.code === AI_ERROR.GEMINI_TIMEOUT[0],
  );

  assert.deepEqual(deletedFiles, ["files/test-video"]);
});

test("text generation 400 errors are not misclassified as unavailable media", async () => {
  await assert.rejects(
    () => runGeminiObservation({
      client: {
        interactions: {
          create() {
            return Promise.reject({ status: 400 });
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
        observationTimeoutMs: 100,
      },
      post: {
        id: "22222222-2222-4222-8222-222222222222",
        type: "text",
        body: "本文",
      },
      mediaRows: [],
      storageRequirements: [],
      supabase: {},
    }),
    (error) => error?.status === 422 && error?.code === AI_ERROR.GEMINI_REQUEST_FAILED[0],
  );
});

test("text generation connection and service errors use provider-specific codes", async () => {
  for (const [providerError, expectedCode] of [
    [Object.assign(new TypeError("fetch failed"), { code: "ECONNRESET" }), AI_ERROR.GEMINI_CONNECTION_FAILED[0]],
    [{ status: 503 }, AI_ERROR.GEMINI_SERVICE_UNAVAILABLE[0]],
  ]) {
    await assert.rejects(
      () => runGeminiObservation({
        client: {
          interactions: {
            create() {
              return Promise.reject(providerError);
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
          observationTimeoutMs: 100,
        },
        post: {
          id: "22222222-2222-4222-8222-222222222222",
          type: "text",
          body: "本文",
        },
        mediaRows: [],
        storageRequirements: [],
        supabase: {},
      }),
      (error) => error?.code === expectedCode && error?.code !== AI_ERROR.MEDIA_UNAVAILABLE[0],
    );
  }
});

test("Interactions create disables SDK retry and receives timeout options and AbortSignal", async () => {
  const calls = [];
  const result = await runGeminiObservation({
    client: {
      interactions: {
        create(request, options) {
          calls.push({ request, options });
          return Promise.resolve({
            output_text: validTextObservationOutput(),
            usage: {
              total_input_tokens: 533,
              total_output_tokens: 27,
              total_thought_tokens: 230,
              total_tokens: 790,
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
      observationTimeoutMs: 1234,
    },
    post: {
      id: "22222222-2222-4222-8222-222222222222",
      type: "text",
      body: "本文",
    },
    mediaRows: [],
    storageRequirements: [],
    supabase: {},
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    authorProfile: {
      display_name: "ほしくん",
      username: "hoshikun",
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.retries.strategy, "none");
  assert.equal(calls[0].options.timeout_ms, 1234);
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);
  assert.equal(calls[0].request.input[0].text.includes("投稿作成後の自動観測候補"), true);
  assert.equal(calls[0].request.input[0].text.includes("原則 should_post=true"), false);
  assert.equal(calls[0].request.input[0].text.includes("星文は毎回返しません"), true);
  assert.equal(calls[0].request.input[0].text.includes("<author_call_name>\nほしくん\n</author_call_name>"), true);
  assert.equal(result.usage.outputTokens, 257);
  assert.equal(result.usage.actualCostMicroUsd, 3113);
});

test("timeout after Interactions create does not call generation more than once", async () => {
  let calls = 0;

  await assert.rejects(
    () => runGeminiObservation({
      client: {
        interactions: {
          create(_request, options) {
            calls += 1;
            assert.equal(options.retries.strategy, "none");
            assert.equal(options.signal instanceof AbortSignal, true);
            return new Promise((resolve, reject) => {
              options.signal.addEventListener("abort", () => {
                reject(Object.assign(new Error("aborted"), { name: "AbortError", status: 408 }));
              });
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
        observationTimeoutMs: 1,
      },
      post: {
        id: "22222222-2222-4222-8222-222222222222",
        type: "text",
        body: "本文",
      },
      mediaRows: [],
      storageRequirements: [],
      supabase: {},
    }),
    (error) => error?.code === AI_ERROR.GEMINI_TIMEOUT[0],
  );

  assert.equal(calls, 1);
});

test("429 and 5xx provider errors are not retried by app code", async () => {
  for (const status of [429, 503]) {
    let calls = 0;

    await assert.rejects(
      () => runGeminiObservation({
        client: {
          interactions: {
            create() {
              calls += 1;
              return Promise.reject({ status });
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
          observationTimeoutMs: 100,
        },
        post: {
          id: "22222222-2222-4222-8222-222222222222",
          type: "text",
          body: "本文",
        },
        mediaRows: [],
        storageRequirements: [],
        supabase: {},
      }),
    );

    assert.equal(calls, 1);
  }
});

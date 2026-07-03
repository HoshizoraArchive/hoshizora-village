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

test("Interactions API usage uses official snake_case fields without double-counting thinking tokens", () => {
  const usage = getUsageTokens({
    usage: {
      total_input_tokens: 1200,
      total_output_tokens: 180,
      total_thought_tokens: 80,
      total_cached_tokens: 0,
      total_tool_use_tokens: 0,
      total_tokens: 1380,
    },
  });

  assert.deepEqual(usage, {
    inputTokens: 1200,
    outputTokens: 180,
    totalTokens: 1380,
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
      total_thought_tokens: 0,
      total_cached_tokens: 0,
      total_tool_use_tokens: 0,
      total_tokens: 1,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: 1.1,
      total_output_tokens: 1,
      total_thought_tokens: 0,
      total_cached_tokens: 0,
      total_tool_use_tokens: 0,
      total_tokens: 2,
    },
  }));
  assert.throws(() => getUsageTokens({
    usage: {
      total_input_tokens: Number.MAX_SAFE_INTEGER + 1,
      total_output_tokens: 1,
      total_thought_tokens: 0,
      total_cached_tokens: 0,
      total_tool_use_tokens: 0,
      total_tokens: Number.MAX_SAFE_INTEGER + 2,
    },
  }));
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

test("SDK 400 errors are mapped without becoming retryable 503 errors", async () => {
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
    (error) => error?.status === 422 && error?.code === AI_ERROR.MEDIA_UNAVAILABLE[0],
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import { createRequestFingerprint } from "./aiJobReservation.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { normalizeObservationForDb, runAiObservationJob } from "./aiObservationWorker.mjs";

const POST_ID = "22222222-2222-4222-8222-222222222222";
const AUTHOR_ID = "33333333-3333-4333-8333-333333333333";
const CHIA_ID = "44444444-4444-4444-8444-444444444444";

function textPost(overrides = {}) {
  return {
    id: POST_ID,
    author_id: AUTHOR_ID,
    type: "text",
    body: "静かな夜の投稿",
    media_url: null,
    youtube_url: null,
    youtube_video_id: null,
    duration_seconds: null,
    visibility: "public",
    deleted_at: null,
    updated_at: "2026-07-03T00:00:00Z",
    ...overrides,
  };
}

test("request fingerprint changes when post body or media row fields change", () => {
  const post = textPost({ type: "image" });
  const mediaSummary = {
    inputKind: "image",
    inputSizeBytes: 1024,
    inputDurationSeconds: null,
  };
  const mediaRows = [{
    id: "55555555-5555-4555-8555-555555555555",
    post_id: POST_ID,
    uploader_id: AUTHOR_ID,
    media_type: "image",
    storage_path: `${AUTHOR_ID}/batch/0-image.jpg`,
    thumbnail_storage_path: null,
    duration_seconds: null,
    sort_order: 0,
    mime_type: "image/jpeg",
    size_bytes: 1024,
  }];
  const original = createRequestFingerprint({ post, mediaRows, mediaSummary });

  assert.notEqual(
    createRequestFingerprint({ post: { ...post, body: "本文が変わった" }, mediaRows, mediaSummary }),
    original,
  );
  assert.notEqual(
    createRequestFingerprint({
      post,
      mediaSummary,
      mediaRows: [{
        ...mediaRows[0],
        storage_path: `${AUTHOR_ID}/batch/changed-image.jpg`,
      }],
    }),
    original,
  );
  assert.notEqual(
    createRequestFingerprint({
      post,
      mediaSummary,
      mediaRows: [{
        ...mediaRows[0],
        mime_type: "image/png",
      }],
    }),
    original,
  );
});

function config() {
  return {
    hoshizoraChiaProfileId: CHIA_ID,
    model: "gemini-3.5-flash",
    observationTimeoutMs: 30000,
    rateLimits: {
      globalProcessingLimit: 2,
    },
  };
}

function output(overrides = {}) {
  return {
    media_type: "text",
    text_observation: "静かな夜という言葉が、余白を残して置かれています。",
    visual_observation: null,
    audio_observation: null,
    lyric_observation: null,
    key_moments: [],
    confidence: 0.8,
    should_post: true,
    star_letter: "静かな夜の端に、まだ消えない余白が残っていたよ。",
    ...overrides,
  };
}

function createMockSupabase({
  claimFingerprint,
  claimOutcome = "claimed",
  completeOutcome = "completed",
  failOutcome = "failed",
  processingCount = 1,
  posts,
} = {}) {
  const calls = {
    rpc: [],
    cancelArgs: null,
    failArgs: null,
    completeArgs: null,
    attempts: 0,
    completeCalls: 0,
    postReads: 0,
  };
  const postRows = posts ?? [textPost()];
  const firstPost = postRows[0];
  const fingerprint = claimFingerprint ?? createRequestFingerprint({
    post: firstPost,
    mediaRows: [],
    mediaSummary: {
      inputKind: "text",
      inputSizeBytes: 0,
      inputDurationSeconds: null,
    },
  });

  return {
    calls,
    supabase: {
      rpc(name, args) {
        calls.rpc.push({ name, args });

        if (name === "claim_ai_observation_job") {
          return Promise.resolve({
            data: [{
              outcome: claimOutcome,
              job_id: args.p_job_id,
              job_status: claimOutcome === "claimed" ? "processing" : "succeeded",
              post_id: POST_ID,
              request_fingerprint: fingerprint,
              attempt_count: 0,
              max_attempts: 2,
              input_kind: "text",
              model: "gemini-3.5-flash",
            }],
            error: null,
          });
        }

        if (name === "start_ai_observation_attempt") {
          calls.attempts += 1;
          return Promise.resolve({
            data: [{
              outcome: "attempt_started",
              job_id: args.p_job_id,
              job_status: "processing",
              attempt_count: calls.attempts,
              max_attempts: 2,
            }],
            error: null,
          });
        }

        if (name === "cancel_ai_observation_job") {
          calls.cancelArgs = args;
          return Promise.resolve({
            data: [{
              outcome: "cancelled",
              job_id: args.p_job_id,
              job_status: "cancelled",
            }],
            error: null,
          });
        }

        if (name === "complete_ai_observation_job") {
          calls.completeArgs = args;
          calls.completeCalls += 1;
          return Promise.resolve({
            data: [{
              outcome: completeOutcome,
              job_id: args.p_job_id,
              job_status: completeOutcome === "completed" || completeOutcome === "already_succeeded" ? "succeeded" : "processing",
              observation_id: completeOutcome === "already_succeeded"
                ? "55555555-5555-4555-8555-555555555555"
                : null,
              star_letter_id: completeOutcome === "already_succeeded"
                ? "66666666-6666-4666-8666-666666666666"
                : null,
            }],
            error: null,
          });
        }

        if (name === "fail_ai_observation_job") {
          calls.failArgs = args;
          return Promise.resolve({
            data: [{
              outcome: failOutcome,
              job_id: args.p_job_id,
              job_status: failOutcome === "already_succeeded" ? "succeeded" : "failed",
            }],
            error: null,
          });
        }

        return Promise.resolve({ data: null, error: null });
      },
      from(table) {
        const filters = new Map();
        const query = {
          select() {
            return query;
          },
          eq(column, value) {
            filters.set(column, value);

            if (table === "ai_observation_jobs") {
              return Promise.resolve({ count: processingCount, error: null });
            }

            return query;
          },
          maybeSingle() {
            if (table === "posts") {
              const row = postRows[Math.min(calls.postReads, postRows.length - 1)];
              calls.postReads += 1;
              return Promise.resolve({ data: row, error: null });
            }

            if (table === "profiles") {
              if (filters.get("id") === AUTHOR_ID) {
                return Promise.resolve({
                  data: {
                    id: AUTHOR_ID,
                    username: "hoshikun",
                    display_name: "ほしくん",
                  },
                  error: null,
                });
              }

              return Promise.resolve({
                data: {
                  id: CHIA_ID,
                  username: "chia_hoshizora",
                  display_name: "星空ちあ",
                },
                error: null,
              });
            }

            return Promise.resolve({ data: null, error: null });
          },
          order() {
            return Promise.resolve({ data: [], error: null });
          },
        };

        return query;
      },
    },
  };
}

test("observation output is normalized for public.observations", () => {
  const normalized = normalizeObservationForDb(output({
    key_moments: [{ timestamp: "00:01", observation: "言葉が止まる瞬間。" }],
  }));

  assert.equal(normalized.shouldPost, true);
  assert.equal(normalized.starLetter, "静かな夜の端に、まだ消えない余白が残っていたよ。");
  assert.deepEqual(normalized.observedPoints.at(-1), { kind: "confidence", value: 0.8 });
  assert.equal(normalized.observedPoints.some((point) => point.kind === "text"), true);
});

test("terminal jobs are not sent to Gemini again", async () => {
  const { supabase, calls } = createMockSupabase({ claimOutcome: "already_succeeded" });
  let providerCalls = 0;
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    runProvider: async () => {
      providerCalls += 1;
      return { output: output(), usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, actualCostMicroUsd: 11 } };
    },
  });

  assert.equal(result.outcome, "already_succeeded");
  assert.equal(providerCalls, 0);
  assert.equal(calls.attempts, 0);
});

test("post fingerprint mismatch fails before provider attempt", async () => {
  const { supabase, calls } = createMockSupabase({ claimFingerprint: "0".repeat(64) });
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    runProvider: async () => {
      throw new Error("must not run");
    },
  });

  assert.equal(result.outcome, "failed");
  assert.equal(calls.attempts, 0);
  assert.equal(calls.failArgs.p_public_error_code, AI_ERROR.POST_CHANGED[0]);
});

test("global processing limit cancels queued job before provider attempt", async () => {
  const { supabase, calls } = createMockSupabase({ processingCount: 3 });
  let providerCalls = 0;
  await assert.rejects(
    () => runAiObservationJob({
      jobId: "77777777-7777-4777-8777-777777777777",
      requestId: "request",
      supabase,
      config: config(),
      geminiClient: {},
      runProvider: async () => {
        providerCalls += 1;
        return { output: output(), usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, actualCostMicroUsd: 11 } };
      },
    }),
    (error) => error.status === 429 && error.code === AI_ERROR.RATE_LIMITED[0],
  );

  assert.equal(providerCalls, 0);
  assert.equal(calls.attempts, 0);
  assert.equal(calls.failArgs, null);
  assert.deepEqual(calls.cancelArgs, {
    p_job_id: "77777777-7777-4777-8777-777777777777",
    p_public_error_code: AI_ERROR.RATE_LIMITED[0],
  });
  assert.deepEqual(calls.rpc.map((call) => call.name), ["cancel_ai_observation_job"]);
});

test("global processing capacity allows the last available processing slot", async () => {
  const { supabase, calls } = createMockSupabase({ processingCount: 1 });
  const providerContexts = [];
  const providerAuthorNames = [];
  let providerCalls = 0;
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    runProvider: async ({ observationContext, authorProfile }) => {
      providerCalls += 1;
      providerContexts.push(observationContext);
      providerAuthorNames.push(authorProfile?.display_name);
      return {
        output: output(),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, actualCostMicroUsd: 11 },
      };
    },
  });

  assert.equal(result.outcome, "completed");
  assert.equal(providerCalls, 1);
  assert.deepEqual(providerContexts, [AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST]);
  assert.deepEqual(providerAuthorNames, ["ほしくん"]);
  assert.equal(calls.attempts, 1);
  assert.equal(calls.cancelArgs, null);
});

test("provider failure after attempt is not blindly retried", async () => {
  const { supabase, calls } = createMockSupabase();
  let providerCalls = 0;
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    runProvider: async () => {
      providerCalls += 1;
      throw aiHttpError(503, AI_ERROR.MEDIA_UNAVAILABLE);
    },
  });

  assert.equal(result.outcome, "failed");
  assert.equal(providerCalls, 1);
  assert.equal(calls.attempts, 1);
  assert.equal(calls.failArgs.p_public_error_code, AI_ERROR.MEDIA_UNAVAILABLE[0]);
});

test("completion invalid_payload is failed instead of being logged as success", async () => {
  const { supabase, calls } = createMockSupabase({ completeOutcome: "invalid_payload" });
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    runProvider: async () => ({
      output: output(),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, actualCostMicroUsd: 60 },
    }),
  });

  assert.equal(result.outcome, "failed");
  assert.equal(calls.completeCalls, 1);
  assert.equal(calls.failArgs.p_public_error_code, AI_ERROR.AI_OUTPUT_INVALID[0]);
});

test("completion already_succeeded exits without failing or duplicating", async () => {
  const { supabase, calls } = createMockSupabase({ completeOutcome: "already_succeeded" });
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    runProvider: async () => ({
      output: output(),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, actualCostMicroUsd: 60 },
    }),
  });

  assert.equal(result.outcome, "already_succeeded");
  assert.equal(calls.completeCalls, 1);
  assert.equal(calls.failArgs, null);
});

test("post changes after provider output are rejected before completion", async () => {
  const { supabase, calls } = createMockSupabase({
    posts: [
      textPost(),
      textPost({ body: "Gemini処理中に編集された投稿" }),
    ],
  });
  let providerCalls = 0;
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    runProvider: async () => {
      providerCalls += 1;
      return {
        output: output(),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, actualCostMicroUsd: 60 },
      };
    },
  });

  assert.equal(result.outcome, "failed");
  assert.equal(providerCalls, 1);
  assert.equal(calls.completeCalls, 0);
  assert.equal(calls.failArgs.p_public_error_code, AI_ERROR.POST_CHANGED[0]);
});

test("failure RPC already_succeeded outcome does not throw or overwrite success", async () => {
  const { supabase, calls } = createMockSupabase({
    completeOutcome: "invalid_payload",
    failOutcome: "already_succeeded",
  });
  const result = await runAiObservationJob({
    jobId: "77777777-7777-4777-8777-777777777777",
    requestId: "request",
    supabase,
    config: config(),
    geminiClient: {},
    runProvider: async () => ({
      output: output(),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, actualCostMicroUsd: 60 },
    }),
  });

  assert.equal(result.outcome, "failed");
  assert.equal(calls.failArgs.p_public_error_code, AI_ERROR.AI_OUTPUT_INVALID[0]);
});

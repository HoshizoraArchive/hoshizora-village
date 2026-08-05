import assert from "node:assert/strict";
import test from "node:test";
import { AI_ERROR } from "./aiErrors.mjs";
import {
  getStaleProcessingCutoffIso,
  recoverStaleFirstPostWelcomeJobs,
  recoverStaleProcessingJobs,
  STALE_PROCESSING_GRACE_MS,
} from "./aiStaleJobs.mjs";

test("stale processing cutoff uses observation timeout plus grace", () => {
  const now = Date.parse("2026-07-07T12:00:00.000Z");
  const cutoff = getStaleProcessingCutoffIso({
    observationTimeoutMs: 30_000,
    now,
  });

  assert.equal(cutoff, new Date(now - 30_000 - STALE_PROCESSING_GRACE_MS).toISOString());
});

test("stale processing recovery rescues first-post welcomes before generic stale RPC", async () => {
  const rpcCalls = [];
  const firstPostCalls = [];
  const now = Date.parse("2026-07-07T12:00:00.000Z");
  const originalWarn = console.warn;
  const supabase = {
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: [{ recovered_count: 2 }],
        error: null,
      });
    },
  };

  let recoveredCount;

  try {
    console.warn = () => {};
    recoveredCount = await recoverStaleProcessingJobs({
      supabase,
      config: { observationTimeoutMs: 45_000 },
      requestId: "request",
      operation: "test",
      now,
      limit: 7,
      recoverFirstPostWelcomes: async (args) => {
        firstPostCalls.push(args);
        return 1;
      },
    });
  } finally {
    console.warn = originalWarn;
  }

  const expectedCutoff = new Date(now - 45_000 - STALE_PROCESSING_GRACE_MS).toISOString();
  assert.equal(recoveredCount, 3);
  assert.equal(firstPostCalls.length, 1);
  assert.equal(firstPostCalls[0].staleBefore, expectedCutoff);
  assert.equal(firstPostCalls[0].limit, 7);
  assert.deepEqual(rpcCalls, [{
    name: "recover_stale_ai_observation_jobs",
    args: {
      p_stale_before: expectedCutoff,
      p_public_error_code: AI_ERROR.WORKER_STALE[0],
      p_limit: 7,
    },
  }]);
});

test("stale first-post welcome completes deterministic fallback without resending provider", async () => {
  const completed = [];
  const failed = [];
  const supabase = {};
  const staleBefore = "2026-08-05T11:25:00.000Z";
  const latest = {
    post: {
      id: "post-1",
      author_id: "author-1",
    },
    mediaRows: [],
    mediaSummary: {
      inputKind: "text",
      inputSizeBytes: 12,
      inputDurationSeconds: null,
    },
  };

  const settledCount = await recoverStaleFirstPostWelcomeJobs({
    supabase,
    config: {
      hoshizoraChiaProfileId: "chia-1",
      autoObservation: {
        starLetterDailyLimit: 20,
        starLetterAuthorCooldownSeconds: 21600,
      },
    },
    staleBefore,
    limit: 5,
    listJobs: async (args) => {
      assert.equal(args.staleBefore, staleBefore);
      assert.equal(args.limit, 5);
      return [{
        id: "job-1",
        post_id: "post-1",
        request_fingerprint: "fingerprint-1",
      }];
    },
    validatePost: async ({ postId }) => {
      assert.equal(postId, "post-1");
      return latest;
    },
    loadAuthor: async ({ profileId }) => {
      assert.equal(profileId, "author-1");
      return {
        id: "author-1",
        username: "tester",
        display_name: "テスター",
      };
    },
    createFingerprint: () => "fingerprint-1",
    complete: async (args) => {
      completed.push(args);
      return { outcome: "completed" };
    },
    fail: async (args) => {
      failed.push(args);
      return { outcome: "failed" };
    },
  });

  assert.equal(settledCount, 1);
  assert.equal(failed.length, 0);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].jobId, "job-1");
  assert.equal(completed[0].chiaProfileId, "chia-1");
  assert.equal(completed[0].expectedRequestFingerprint, "fingerprint-1");
  assert.equal(completed[0].isFirstPostFallback, true);
  assert.equal(completed[0].observation.shouldPost, false);
  assert.equal(completed[0].usage.totalTokens, 0);
  assert.match(completed[0].firstPostFallbackStarLetterBody, /^テスターさん、最初の流星便を受け取ったよ。/);
});

test("first-post rescue failure stops generic stale cancellation so a later recovery can retry", async () => {
  const rpcCalls = [];
  const supabase = {
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: [{ recovered_count: 1 }], error: null });
    },
  };

  await assert.rejects(
    recoverStaleProcessingJobs({
      supabase,
      config: { observationTimeoutMs: 120_000 },
      requestId: "request",
      operation: "test",
      now: Date.parse("2026-08-05T12:00:00.000Z"),
      recoverFirstPostWelcomes: async () => {
        throw new Error("temporary rescue failure");
      },
    }),
    /temporary rescue failure/,
  );

  assert.deepEqual(rpcCalls, []);
});

test("stale processing cutoff rejects invalid timeout settings", () => {
  assert.throws(() => getStaleProcessingCutoffIso({ observationTimeoutMs: 0 }), /invalid stale processing timeout/);
  assert.throws(() => getStaleProcessingCutoffIso({ observationTimeoutMs: Number.MAX_SAFE_INTEGER + 1 }), /invalid stale processing timeout/);
});

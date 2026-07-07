import assert from "node:assert/strict";
import test from "node:test";
import { AI_ERROR } from "./aiErrors.mjs";
import {
  getStaleProcessingCutoffIso,
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

test("stale processing recovery calls service RPC with WORKER_STALE and safe cutoff", async () => {
  const rpcCalls = [];
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
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(recoveredCount, 2);
  assert.deepEqual(rpcCalls, [{
    name: "recover_stale_ai_observation_jobs",
    args: {
      p_stale_before: new Date(now - 45_000 - STALE_PROCESSING_GRACE_MS).toISOString(),
      p_public_error_code: AI_ERROR.WORKER_STALE[0],
      p_limit: 7,
    },
  }]);
});

test("stale processing cutoff rejects invalid timeout settings", () => {
  assert.throws(() => getStaleProcessingCutoffIso({ observationTimeoutMs: 0 }), /invalid stale processing timeout/);
  assert.throws(() => getStaleProcessingCutoffIso({ observationTimeoutMs: Number.MAX_SAFE_INTEGER + 1 }), /invalid stale processing timeout/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { dispatchDueAiObservationJobs, loadDueAiObservationJobs } from "./aiDueDispatch.mjs";

const JOB_ID = "77777777-7777-4777-8777-777777777777";

function createMockSupabase(rows) {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    lte(column, value) {
      calls.push(["lte", column, value]);
      return query;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return query;
    },
    limit(value) {
      calls.push(["limit", value]);
      return Promise.resolve({ data: rows, error: null });
    },
  };

  return {
    calls,
    supabase: {
      from(table) {
        calls.push(["from", table]);
        return query;
      },
    },
  };
}

test("loadDueAiObservationJobs reads queued jobs due at or before now", async () => {
  const { supabase, calls } = createMockSupabase([{
    id: JOB_ID,
    observation_context: "auto_text_post",
    not_before_at: "2026-07-07T00:00:00.000Z",
  }]);

  const jobs = await loadDueAiObservationJobs({
    supabase,
    now: new Date("2026-07-07T00:05:00.000Z"),
    limit: 5,
  });

  assert.deepEqual(jobs, [{
    jobId: JOB_ID,
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    notBeforeAt: "2026-07-07T00:00:00.000Z",
  }]);
  assert.deepEqual(calls, [
    ["from", "ai_observation_jobs"],
    ["select", "id, observation_context, not_before_at"],
    ["eq", "status", "queued"],
    ["lte", "not_before_at", "2026-07-07T00:05:00.000Z"],
    ["order", "not_before_at", { ascending: true }],
    ["limit", 5],
  ]);
});

test("dispatchDueAiObservationJobs dispatches due jobs and keeps failures non-terminal", async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    return new Response("ok", { status: fetchCalls.length === 1 ? 202 : 429 });
  };

  try {
    const { supabase } = createMockSupabase([
      {
        id: JOB_ID,
        observation_context: "auto_text_post",
        not_before_at: "2026-07-07T00:00:00.000Z",
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        observation_context: "auto_text_post",
        not_before_at: "2026-07-07T00:01:00.000Z",
      },
    ]);

    const result = await dispatchDueAiObservationJobs({
      request: new Request("https://example.net/api/ai-observation-dispatch-due"),
      supabase,
      config: {
        workerSharedSecret: "s".repeat(32),
        autoObservation: { dispatchBatchSize: 2 },
      },
      requestId: "request",
      now: new Date("2026-07-07T00:05:00.000Z"),
    });

    assert.deepEqual(result, { scanned: 2, dispatched: 1, failed: 1 });
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0].url, "https://example.net/api/ai-observation-worker");
    assert.equal(fetchCalls[0].options.method, "POST");
    assert.equal(fetchCalls[0].options.body.includes(AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

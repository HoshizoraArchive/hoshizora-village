import assert from "node:assert/strict";
import test from "node:test";
import { reserveAiObservationJob } from "./aiJobReservation.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

const POST_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function reservationInput(overrides = {}) {
  return {
    supabase: null,
    operatorUserId: USER_ID,
    payload: {
      postId: POST_ID,
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    },
    post: {
      id: POST_ID,
      author_id: USER_ID,
      type: "image",
      body: "最初の写真",
      youtube_url: null,
      youtube_video_id: null,
      updated_at: "2026-07-29T00:00:00.000Z",
    },
    mediaRows: [],
    mediaSummary: {
      inputKind: "image",
      inputSizeBytes: 1024,
      inputDurationSeconds: null,
    },
    config: {
      model: "gemini-3.5-flash",
      reservedCostMicroUsd: 1000,
      maxRetries: 1,
      dailyRequestLimit: 100,
      monthlyRequestLimit: 1000,
      dailyCostLimitMicroUsd: 1000000,
      monthlyCostLimitMicroUsd: 10000000,
      minSecondsBetweenRequests: 0,
    },
    observationContext: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
    notBeforeAt: new Date("2026-07-29T00:01:00.000Z"),
    firstPostWelcomeReservation: true,
    ...overrides,
  };
}

test("first-post reservation uses the atomic welcome RPC", async () => {
  const calls = [];
  const input = reservationInput();
  input.supabase = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({
        data: [{
          outcome: "reserved",
          job_id: "55555555-5555-4555-8555-555555555555",
          job_status: "queued",
          observation_context: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
          not_before_at: "2026-07-29T00:01:00.000Z",
        }],
        error: null,
      });
    },
  };

  const result = await reserveAiObservationJob(input);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "reserve_chia_first_post_welcome_job");
  assert.equal(
    calls[0].args.p_observation_context,
    AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
  );
  assert.equal(result.outcome, "reserved");
});

test("a concurrent later post is skipped when the atomic RPC rejects it", async () => {
  const input = reservationInput();
  input.supabase = {
    rpc() {
      return Promise.resolve({
        data: [{
          outcome: "not_first_post",
          job_id: null,
          job_status: null,
          observation_context: null,
          not_before_at: null,
        }],
        error: null,
      });
    },
  };

  const result = await reserveAiObservationJob(input);

  assert.deepEqual(result, {
    outcome: "not_first_post",
    jobId: null,
    status: "skipped",
    notBeforeAt: null,
    observationContext: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
  });
});

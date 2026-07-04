import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservationParams,
  canStartProviderAttempt,
  estimateGeminiCostMicroUsd,
  getBillableCostMicroUsd,
  getUtcPeriodStarts,
  isRetriableProviderFailure,
  withTimeout,
} from "./aiLimits.mjs";

test("UTC period starts are fixed to UTC day and month boundaries", () => {
  const starts = getUtcPeriodStarts(new Date("2026-07-03T15:45:10.000Z"));

  assert.equal(starts.dayStart.toISOString(), "2026-07-03T00:00:00.000Z");
  assert.equal(starts.monthStart.toISOString(), "2026-07-01T00:00:00.000Z");
});

test("reservation params use server-side reserved cost and max attempts", () => {
  const params = buildReservationParams({
    config: {
      reservedCostMicroUsd: 123,
      maxRetries: 2,
    },
    mediaSummary: {
      inputKind: "video",
      inputSizeBytes: 1024,
      inputDurationSeconds: 12.5,
    },
  });

  assert.deepEqual(params, {
    inputKind: "video",
    inputSizeBytes: 1024,
    inputDurationSeconds: 12.5,
    reservedCostMicroUsd: 123,
    maxAttempts: 3,
  });
});

test("only transient provider statuses are retry candidates", () => {
  assert.equal(isRetriableProviderFailure(503), true);
  assert.equal(isRetriableProviderFailure(429), true);
  assert.equal(isRetriableProviderFailure(422), false);
  assert.equal(isRetriableProviderFailure(403), false);
});

test("billable cost counts reservations and provider-call failures conservatively", () => {
  assert.equal(getBillableCostMicroUsd({
    status: "queued",
    attempt_count: 0,
    reserved_cost_micro_usd: 100,
    actual_cost_micro_usd: null,
  }), 100);
  assert.equal(getBillableCostMicroUsd({
    status: "succeeded",
    attempt_count: 1,
    reserved_cost_micro_usd: 100,
    actual_cost_micro_usd: 80,
  }), 80);
  assert.equal(getBillableCostMicroUsd({
    status: "failed",
    attempt_count: 1,
    reserved_cost_micro_usd: 100,
    actual_cost_micro_usd: null,
  }), 100);
  assert.equal(getBillableCostMicroUsd({
    status: "failed",
    attempt_count: 0,
    reserved_cost_micro_usd: 100,
    actual_cost_micro_usd: null,
  }), 0);
});

test("provider attempts are bounded by attempt_count and max_attempts on one job", () => {
  assert.equal(canStartProviderAttempt({ status: "processing", attempt_count: 0, max_attempts: 1 }), true);
  assert.equal(canStartProviderAttempt({ status: "processing", attempt_count: 1, max_attempts: 1 }), false);
  assert.equal(canStartProviderAttempt({ status: "failed", attempt_count: 0, max_attempts: 1 }), false);
});

test("Gemini 3.5 Flash pricing uses input/output token rates with ceiling", () => {
  assert.equal(estimateGeminiCostMicroUsd({
    model: "gemini-3.5-flash",
    inputTokens: 1,
    outputTokens: 1,
  }), 11);
  assert.equal(estimateGeminiCostMicroUsd({
    model: "gemini-3.5-flash",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }), 10_500_000);
  assert.equal(estimateGeminiCostMicroUsd({
    model: "gemini-3.5-flash",
    inputTokens: 533,
    outputTokens: 257,
  }), 3113);
});

test("Gemini cost estimation rejects missing or overflowing usage", () => {
  assert.throws(() => estimateGeminiCostMicroUsd({
    model: "gemini-3.5-flash",
    inputTokens: Number.MAX_SAFE_INTEGER,
    outputTokens: 1,
  }), /usage_cost_overflow/);
  assert.throws(() => estimateGeminiCostMicroUsd({
    model: "gemini-3.5-flash",
    inputTokens: -1,
    outputTokens: 0,
  }), /invalid_usage/);
});

test("withTimeout rejects tasks that do not observe AbortSignal", async () => {
  await assert.rejects(
    () => withTimeout(() => new Promise((resolve) => {
      setTimeout(resolve, 30);
    }), 1),
    /timed out/,
  );
});

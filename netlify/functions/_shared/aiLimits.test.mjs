import assert from "node:assert/strict";
import test from "node:test";
import { buildReservationParams, getUtcPeriodStarts, isRetriableProviderFailure } from "./aiLimits.mjs";

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

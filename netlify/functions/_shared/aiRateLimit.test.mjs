import assert from "node:assert/strict";
import test from "node:test";
import { AI_ERROR, aiHttpError, errorResponse } from "./aiErrors.mjs";
import {
  assertGlobalProcessingCapacity,
  assertRateLimit,
  checkRateLimit,
  getClientIp,
  pruneRateLimitStore,
  readAiRateLimitConfig,
} from "./aiRateLimit.mjs";

test("rate limit allows requests until the configured limit and returns retry-after on excess", () => {
  const rateLimitStore = new Map();
  const first = checkRateLimit({
    key: "ip:1",
    limit: 2,
    windowSeconds: 60,
    now: 1000,
    rateLimitStore,
  });
  const second = checkRateLimit({
    key: "ip:1",
    limit: 2,
    windowSeconds: 60,
    now: 2000,
    rateLimitStore,
  });
  const third = checkRateLimit({
    key: "ip:1",
    limit: 2,
    windowSeconds: 60,
    now: 3000,
    rateLimitStore,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);
  assert.equal(third.retryAfterSeconds, 58);
});

test("429 rate-limit responses include Retry-After without leaking details", async () => {
  const response = errorResponse(
    aiHttpError(429, AI_ERROR.RATE_LIMITED, { retryAfterSeconds: 12 }),
    "request-id",
  );
  const payload = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "12");
  assert.equal(payload.error.code, AI_ERROR.RATE_LIMITED[0]);
  assert.equal(payload.error.requestId, "request-id");
  assert.equal(JSON.stringify(payload).includes("ai_observation_jobs"), false);
});

test("operator and IP limits use independent keys", () => {
  const rateLimitStore = new Map();

  assert.doesNotThrow(() => assertRateLimit({
    scope: "operator",
    key: "user-a",
    limit: 1,
    windowSeconds: 60,
    now: 0,
    rateLimitStore,
  }));
  assert.throws(
    () => assertRateLimit({
      scope: "operator",
      key: "user-a",
      limit: 1,
      windowSeconds: 60,
      now: 10,
      rateLimitStore,
    }),
    (error) => error.status === 429 && error.code === AI_ERROR.RATE_LIMITED[0] && error.retryAfterSeconds === 60,
  );
  assert.doesNotThrow(() => assertRateLimit({
    scope: "ip",
    key: "user-a",
    limit: 1,
    windowSeconds: 60,
    now: 10,
    rateLimitStore,
  }));
});

test("rate limit store prunes expired entries", () => {
  const rateLimitStore = new Map([
    ["expired-a", { count: 1, resetAt: 1000 }],
    ["expired-b", { count: 1, resetAt: 1500 }],
    ["active", { count: 1, resetAt: 5000 }],
  ]);

  const size = pruneRateLimitStore({
    rateLimitStore,
    now: 2000,
    maxEntries: 10,
  });

  assert.equal(size, 1);
  assert.equal(rateLimitStore.has("active"), true);
  assert.equal(rateLimitStore.has("expired-a"), false);
  assert.equal(rateLimitStore.has("expired-b"), false);
});

test("rate limit store is capped when many unique keys arrive", () => {
  const rateLimitStore = new Map();

  for (let index = 0; index < 20; index += 1) {
    checkRateLimit({
      key: `ip:${index}`,
      limit: 10,
      windowSeconds: 60,
      now: 1000 + index,
      rateLimitStore,
      maxEntries: 5,
    });
  }

  assert.equal(rateLimitStore.size <= 5, true);
  assert.equal(rateLimitStore.has("ip:19"), true);
});

test("rate limit config has safe defaults and accepts server-only overrides", () => {
  assert.deepEqual(readAiRateLimitConfig({
    AI_RATE_LIMIT_WINDOW_SECONDS: "30",
    AI_RATE_LIMIT_REQUEST_POST_IP: "3",
    AI_GLOBAL_PROCESSING_LIMIT: "4",
  }), {
    windowSeconds: 30,
    requestGetIpLimit: 60,
    requestPostIpLimit: 3,
    statusIpLimit: 120,
    workerIpLimit: 30,
    operatorPostLimit: 4,
    operatorStatusLimit: 120,
    globalProcessingLimit: 4,
  });
});

test("client IP prefers Netlify context and forwarded headers", () => {
  const request = new Request("https://example.test", {
    headers: {
      "x-forwarded-for": "203.0.113.10, 198.51.100.9",
    },
  });

  assert.equal(getClientIp(request, { ip: "192.0.2.1" }), "192.0.2.1");
  assert.equal(getClientIp(request, {}), "203.0.113.10");
});

test("global processing capacity rejects before provider work when processing count is above limit", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "ai_observation_jobs");
      return {
        select(_columns, options) {
          assert.deepEqual(options, { count: "exact", head: true });
          return this;
        },
        eq(column, value) {
          assert.equal(column, "status");
          assert.equal(value, "processing");
          return Promise.resolve({ count: 3, error: null });
        },
      };
    },
  };

  await assert.rejects(
    () => assertGlobalProcessingCapacity({ supabase, limit: 2 }),
    (error) => error.status === 429 && error.code === AI_ERROR.RATE_LIMITED[0],
  );
});

test("global processing capacity reserves a slot before claiming queued work", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "ai_observation_jobs");
      return {
        select() {
          return this;
        },
        eq() {
          return Promise.resolve({ count: 2, error: null });
        },
      };
    },
  };

  await assert.rejects(
    () => assertGlobalProcessingCapacity({ supabase, limit: 2, reservedSlots: 1 }),
    (error) => error.status === 429 && error.code === AI_ERROR.RATE_LIMITED[0],
  );
});

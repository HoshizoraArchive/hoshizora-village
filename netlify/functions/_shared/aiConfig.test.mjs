import assert from "node:assert/strict";
import test from "node:test";
import { readAiObservationConfig } from "./aiConfig.mjs";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function enabledEnv(overrides = {}) {
  return {
    AI_OBSERVATION_ENABLED: "true",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-key",
    GEMINI_API_KEY: "server-only-gemini-key",
    AI_OPERATOR_USER_IDS: VALID_UUID,
    AI_DAILY_REQUEST_LIMIT: "5",
    AI_MONTHLY_REQUEST_LIMIT: "50",
    AI_DAILY_COST_LIMIT_MICRO_USD: "1000",
    AI_MONTHLY_COST_LIMIT_MICRO_USD: "10000",
    AI_OBSERVATION_TIMEOUT_MS: "30000",
    AI_OBSERVATION_MAX_RETRIES: "2",
    AI_MIN_SECONDS_BETWEEN_REQUESTS: "60",
    AI_RESERVED_COST_MICRO_USD: "100",
    ...overrides,
  };
}

test("AI observation config is fail-closed when feature flag is not true", () => {
  assert.deepEqual(readAiObservationConfig({}), {
    enabled: false,
    unavailableReason: "feature_disabled",
  });
});

test("AI observation config accepts enabled server-only settings", () => {
  const config = readAiObservationConfig(enabledEnv());

  assert.equal(config.enabled, true);
  assert.equal(config.geminiApiKeyPresent, true);
  assert.equal(config.dailyRequestLimit, 5);
  assert.equal(config.maxRetries, 2);
  assert.equal(config.operatorUserIds.has(VALID_UUID), true);
});

test("AI observation config rejects invalid operator UUIDs", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_OPERATOR_USER_IDS: "not-a-uuid" })),
    /invalid_env:AI_OPERATOR_USER_IDS/,
  );
});

test("AI observation config rejects missing required numeric limits", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_DAILY_REQUEST_LIMIT: "" })),
    /invalid_env:AI_DAILY_REQUEST_LIMIT/,
  );
});

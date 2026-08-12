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
    AI_OBSERVATION_MODEL: "gemini-3.5-flash",
    AI_HOSHIZORA_CHIA_PROFILE_ID: VALID_UUID,
    AI_WORKER_SHARED_SECRET: "s".repeat(32),
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
  assert.equal(config.model, "gemini-3.5-flash");
  assert.equal(config.hoshizoraChiaProfileId, VALID_UUID);
  assert.equal(config.workerSharedSecret, "s".repeat(32));
  assert.equal(config.geminiApiKey, "server-only-gemini-key");
  assert.equal(config.geminiApiKeyPresent, true);
  assert.equal(config.dailyRequestLimit, 5);
  assert.equal(config.maxRetries, 2);
  assert.equal(config.workerDispatchTtlSeconds, 60);
  assert.deepEqual(config.rateLimits, {
    windowSeconds: 60,
    requestGetIpLimit: 60,
    requestPostIpLimit: 8,
    statusIpLimit: 120,
    workerIpLimit: 30,
    operatorPostLimit: 4,
    operatorStatusLimit: 120,
    globalProcessingLimit: 2,
  });
  assert.deepEqual(config.autoObservation, {
    minDelaySeconds: 120,
    maxDelaySeconds: 2100,
    dispatchBatchSize: 5,
    starLetterProbabilityPercent: 100,
    starLetterMinConfidencePercent: 75,
    starLetterDailyLimit: 100,
    starLetterAuthorCooldownSeconds: 0,
  });
  assert.equal(config.operatorUserIds.has(VALID_UUID), true);
});

test("AI observation config accepts worker dispatch and rate-limit overrides", () => {
  const config = readAiObservationConfig(enabledEnv({
    AI_WORKER_DISPATCH_TTL_SECONDS: "45",
    AI_RATE_LIMIT_WINDOW_SECONDS: "30",
    AI_RATE_LIMIT_REQUEST_GET_IP: "70",
    AI_RATE_LIMIT_REQUEST_POST_IP: "5",
    AI_RATE_LIMIT_STATUS_IP: "140",
    AI_RATE_LIMIT_WORKER_IP: "11",
    AI_RATE_LIMIT_OPERATOR_POST: "2",
    AI_RATE_LIMIT_OPERATOR_STATUS: "90",
    AI_GLOBAL_PROCESSING_LIMIT: "3",
  }));

  assert.equal(config.workerDispatchTtlSeconds, 45);
  assert.deepEqual(config.rateLimits, {
    windowSeconds: 30,
    requestGetIpLimit: 70,
    requestPostIpLimit: 5,
    statusIpLimit: 140,
    workerIpLimit: 11,
    operatorPostLimit: 2,
    operatorStatusLimit: 90,
    globalProcessingLimit: 3,
  });
});

test("AI observation config accepts automatic observation overrides", () => {
  const config = readAiObservationConfig(enabledEnv({
    AI_AUTO_OBSERVATION_MIN_DELAY_SECONDS: "120",
    AI_AUTO_OBSERVATION_MAX_DELAY_SECONDS: "600",
    AI_AUTO_OBSERVATION_DISPATCH_BATCH_SIZE: "9",
    AI_AUTO_STAR_LETTER_PROBABILITY_PERCENT: "35",
    AI_AUTO_STAR_LETTER_MIN_CONFIDENCE_PERCENT: "82",
    AI_AUTO_STAR_LETTER_DAILY_LIMIT: "12",
    AI_AUTO_STAR_LETTER_AUTHOR_COOLDOWN_SECONDS: "7200",
  }));

  assert.deepEqual(config.autoObservation, {
    minDelaySeconds: 120,
    maxDelaySeconds: 600,
    dispatchBatchSize: 9,
    starLetterProbabilityPercent: 35,
    starLetterMinConfidencePercent: 82,
    starLetterDailyLimit: 12,
    starLetterAuthorCooldownSeconds: 7200,
  });
});

test("AI observation config supports the early-beta full star-letter mode", () => {
  const config = readAiObservationConfig(enabledEnv({
    AI_AUTO_STAR_LETTER_PROBABILITY_PERCENT: "100",
    AI_AUTO_STAR_LETTER_DAILY_LIMIT: "100",
    AI_AUTO_STAR_LETTER_AUTHOR_COOLDOWN_SECONDS: "0",
  }));

  assert.equal(config.autoObservation.starLetterProbabilityPercent, 100);
  assert.equal(config.autoObservation.starLetterDailyLimit, 100);
  assert.equal(config.autoObservation.starLetterAuthorCooldownSeconds, 0);
});

test("AI observation config rejects invalid automatic observation settings", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({
      AI_AUTO_OBSERVATION_MIN_DELAY_SECONDS: "0",
    })),
    /invalid_env:AI_AUTO_OBSERVATION_MIN_DELAY_SECONDS/,
  );
  assert.throws(
    () => readAiObservationConfig(enabledEnv({
      AI_AUTO_OBSERVATION_MIN_DELAY_SECONDS: "2101",
      AI_AUTO_OBSERVATION_MAX_DELAY_SECONDS: "2100",
    })),
    /invalid_env:AI_AUTO_OBSERVATION_MAX_DELAY_SECONDS/,
  );
  assert.throws(
    () => readAiObservationConfig(enabledEnv({
      AI_AUTO_STAR_LETTER_PROBABILITY_PERCENT: "101",
    })),
    /invalid_env:AI_AUTO_STAR_LETTER_PROBABILITY_PERCENT/,
  );
});

test("AI observation config rejects invalid worker dispatch and rate-limit values", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_WORKER_DISPATCH_TTL_SECONDS: "0" })),
    /invalid_env:AI_WORKER_DISPATCH_TTL_SECONDS/,
  );
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_WORKER_DISPATCH_TTL_SECONDS: "301" })),
    /invalid_env:AI_WORKER_DISPATCH_TTL_SECONDS/,
  );
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_GLOBAL_PROCESSING_LIMIT: "0" })),
    /invalid_env:AI_GLOBAL_PROCESSING_LIMIT/,
  );
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_RATE_LIMIT_REQUEST_POST_IP: "9007199254740992" })),
    /invalid_env:AI_RATE_LIMIT_REQUEST_POST_IP/,
  );
});

test("AI observation config rejects unsupported models", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_OBSERVATION_MODEL: "gemini-3.5-pro" })),
    /invalid_env:AI_OBSERVATION_MODEL/,
  );
});

test("AI observation config rejects invalid Chia profile IDs", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_HOSHIZORA_CHIA_PROFILE_ID: "not-a-uuid" })),
    /invalid_env:AI_HOSHIZORA_CHIA_PROFILE_ID/,
  );
});

test("AI observation config rejects short worker secrets", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_WORKER_SHARED_SECRET: "short" })),
    /invalid_env:AI_WORKER_SHARED_SECRET/,
  );
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

test("AI observation config accepts retry boundary values 0 and 9", () => {
  assert.equal(readAiObservationConfig(enabledEnv({ AI_OBSERVATION_MAX_RETRIES: "0" })).maxRetries, 0);
  assert.equal(readAiObservationConfig(enabledEnv({ AI_OBSERVATION_MAX_RETRIES: "9" })).maxRetries, 9);
});

test("AI observation config rejects retry values above 9", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_OBSERVATION_MAX_RETRIES: "10" })),
    /invalid_env:AI_OBSERVATION_MAX_RETRIES/,
  );
});

test("AI observation config rejects values above JavaScript safe integer", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_DAILY_COST_LIMIT_MICRO_USD: "9007199254740992" })),
    /invalid_env:AI_DAILY_COST_LIMIT_MICRO_USD/,
  );
});

test("AI observation config rejects zero for positive-only settings", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_RESERVED_COST_MICRO_USD: "0" })),
    /invalid_env:AI_RESERVED_COST_MICRO_USD/,
  );
});

test("AI observation config allows zero for non-negative settings", () => {
  const config = readAiObservationConfig(enabledEnv({
    AI_OBSERVATION_MAX_RETRIES: "0",
    AI_MIN_SECONDS_BETWEEN_REQUESTS: "0",
  }));

  assert.equal(config.maxRetries, 0);
  assert.equal(config.minSecondsBetweenRequests, 0);
});

test("AI observation config rejects excessively large timeout values", () => {
  assert.throws(
    () => readAiObservationConfig(enabledEnv({ AI_OBSERVATION_TIMEOUT_MS: "300001" })),
    /invalid_env:AI_OBSERVATION_TIMEOUT_MS/,
  );
});

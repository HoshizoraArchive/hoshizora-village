const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSTGRES_INTEGER_MAX = 2147483647;
const MAX_REQUEST_LIMIT = 1000000;
const MAX_TIMEOUT_MS = 300000;
const MAX_SECONDS_BETWEEN_REQUESTS = 86400;
const SUPPORTED_AI_OBSERVATION_MODEL = "gemini-3.5-flash";
const MIN_WORKER_SHARED_SECRET_LENGTH = 32;
const DEFAULT_WORKER_DISPATCH_TTL_SECONDS = 60;
const DEFAULT_AUTO_OBSERVATION_MIN_DELAY_SECONDS = 120;
const DEFAULT_AUTO_OBSERVATION_MAX_DELAY_SECONDS = 2100;
const DEFAULT_AUTO_OBSERVATION_DISPATCH_BATCH_SIZE = 5;
const DEFAULT_AUTO_STAR_LETTER_PROBABILITY_PERCENT = 100;
const DEFAULT_AUTO_STAR_LETTER_MIN_CONFIDENCE_PERCENT = 75;
const DEFAULT_AUTO_STAR_LETTER_DAILY_LIMIT = 100;
const DEFAULT_AUTO_STAR_LETTER_AUTHOR_COOLDOWN_SECONDS = 0;

function defaultEnvSource() {
  return globalThis.Netlify?.env ?? process.env;
}

export function readEnv(name, env = defaultEnvSource()) {
  if (env && typeof env.get === "function") {
    return env.get(name) ?? "";
  }

  return env?.[name] ?? "";
}

function parseRequiredInteger(name, env, { min, max }) {
  const rawValue = readEnv(name, env).trim();

  if (!/^(0|[1-9][0-9]*)$/.test(rawValue)) {
    throw new Error(`invalid_env:${name}`);
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`invalid_env:${name}`);
  }

  return value;
}

function parseOptionalInteger(name, env, fallback, { min, max }) {
  const rawValue = readEnv(name, env).trim();

  if (!rawValue) {
    return fallback;
  }

  if (!/^(0|[1-9][0-9]*)$/.test(rawValue)) {
    throw new Error(`invalid_env:${name}`);
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`invalid_env:${name}`);
  }

  return value;
}

function parseOperatorUserIds(env) {
  const rawValue = readEnv("AI_OPERATOR_USER_IDS", env);
  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("invalid_env:AI_OPERATOR_USER_IDS");
  }

  for (const value of values) {
    if (!UUID_PATTERN.test(value)) {
      throw new Error("invalid_env:AI_OPERATOR_USER_IDS");
    }
  }

  return new Set(values.map((value) => value.toLowerCase()));
}

export function readAiObservationConfig(env = defaultEnvSource()) {
  const enabled = readEnv("AI_OBSERVATION_ENABLED", env).trim() === "true";

  if (!enabled) {
    return {
      enabled: false,
      unavailableReason: "feature_disabled",
    };
  }

  const supabaseUrl = readEnv("SUPABASE_URL", env).trim();
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY", env).trim();
  const geminiApiKey = readEnv("GEMINI_API_KEY", env).trim();
  const model = readEnv("AI_OBSERVATION_MODEL", env).trim();
  const hoshizoraChiaProfileId = readEnv("AI_HOSHIZORA_CHIA_PROFILE_ID", env).trim().toLowerCase();
  const workerSharedSecret = readEnv("AI_WORKER_SHARED_SECRET", env).trim();

  if (!supabaseUrl || !supabaseServiceRoleKey || !geminiApiKey) {
    throw new Error("invalid_env:required_secret");
  }

  if (model !== SUPPORTED_AI_OBSERVATION_MODEL) {
    throw new Error("invalid_env:AI_OBSERVATION_MODEL");
  }

  if (!UUID_PATTERN.test(hoshizoraChiaProfileId)) {
    throw new Error("invalid_env:AI_HOSHIZORA_CHIA_PROFILE_ID");
  }

  if (workerSharedSecret.length < MIN_WORKER_SHARED_SECRET_LENGTH) {
    throw new Error("invalid_env:AI_WORKER_SHARED_SECRET");
  }

  const autoObservation = {
    minDelaySeconds: parseOptionalInteger("AI_AUTO_OBSERVATION_MIN_DELAY_SECONDS", env, DEFAULT_AUTO_OBSERVATION_MIN_DELAY_SECONDS, {
      min: 1,
      max: 86400,
    }),
    maxDelaySeconds: parseOptionalInteger("AI_AUTO_OBSERVATION_MAX_DELAY_SECONDS", env, DEFAULT_AUTO_OBSERVATION_MAX_DELAY_SECONDS, {
      min: 1,
      max: 86400,
    }),
    dispatchBatchSize: parseOptionalInteger("AI_AUTO_OBSERVATION_DISPATCH_BATCH_SIZE", env, DEFAULT_AUTO_OBSERVATION_DISPATCH_BATCH_SIZE, {
      min: 1,
      max: 50,
    }),
    starLetterProbabilityPercent: parseOptionalInteger("AI_AUTO_STAR_LETTER_PROBABILITY_PERCENT", env, DEFAULT_AUTO_STAR_LETTER_PROBABILITY_PERCENT, {
      min: 0,
      max: 100,
    }),
    starLetterMinConfidencePercent: parseOptionalInteger("AI_AUTO_STAR_LETTER_MIN_CONFIDENCE_PERCENT", env, DEFAULT_AUTO_STAR_LETTER_MIN_CONFIDENCE_PERCENT, {
      min: 0,
      max: 100,
    }),
    starLetterDailyLimit: parseOptionalInteger("AI_AUTO_STAR_LETTER_DAILY_LIMIT", env, DEFAULT_AUTO_STAR_LETTER_DAILY_LIMIT, {
      min: 0,
      max: Math.min(MAX_REQUEST_LIMIT, POSTGRES_INTEGER_MAX),
    }),
    starLetterAuthorCooldownSeconds: parseOptionalInteger("AI_AUTO_STAR_LETTER_AUTHOR_COOLDOWN_SECONDS", env, DEFAULT_AUTO_STAR_LETTER_AUTHOR_COOLDOWN_SECONDS, {
      min: 0,
      max: 2592000,
    }),
  };

  if (autoObservation.maxDelaySeconds < autoObservation.minDelaySeconds) {
    throw new Error("invalid_env:AI_AUTO_OBSERVATION_MAX_DELAY_SECONDS");
  }

  return {
    enabled: true,
    supabaseUrl,
    supabaseServiceRoleKey,
    geminiApiKey,
    geminiApiKeyPresent: true,
    model,
    hoshizoraChiaProfileId,
    workerSharedSecret,
    workerDispatchTtlSeconds: parseOptionalInteger("AI_WORKER_DISPATCH_TTL_SECONDS", env, DEFAULT_WORKER_DISPATCH_TTL_SECONDS, {
      min: 1,
      max: 300,
    }),
    autoObservation,
    operatorUserIds: parseOperatorUserIds(env),
    dailyRequestLimit: parseRequiredInteger("AI_DAILY_REQUEST_LIMIT", env, {
      min: 1,
      max: Math.min(MAX_REQUEST_LIMIT, POSTGRES_INTEGER_MAX),
    }),
    monthlyRequestLimit: parseRequiredInteger("AI_MONTHLY_REQUEST_LIMIT", env, {
      min: 1,
      max: Math.min(MAX_REQUEST_LIMIT, POSTGRES_INTEGER_MAX),
    }),
    dailyCostLimitMicroUsd: parseRequiredInteger("AI_DAILY_COST_LIMIT_MICRO_USD", env, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
    }),
    monthlyCostLimitMicroUsd: parseRequiredInteger("AI_MONTHLY_COST_LIMIT_MICRO_USD", env, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
    }),
    observationTimeoutMs: parseRequiredInteger("AI_OBSERVATION_TIMEOUT_MS", env, {
      min: 1,
      max: MAX_TIMEOUT_MS,
    }),
    maxRetries: parseRequiredInteger("AI_OBSERVATION_MAX_RETRIES", env, {
      min: 0,
      max: 9,
    }),
    minSecondsBetweenRequests: parseRequiredInteger("AI_MIN_SECONDS_BETWEEN_REQUESTS", env, {
      min: 0,
      max: MAX_SECONDS_BETWEEN_REQUESTS,
    }),
    reservedCostMicroUsd: parseRequiredInteger("AI_RESERVED_COST_MICRO_USD", env, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
    }),
    rateLimits: {
      windowSeconds: parseOptionalInteger("AI_RATE_LIMIT_WINDOW_SECONDS", env, 60, {
        min: 1,
        max: 3600,
      }),
      requestGetIpLimit: parseOptionalInteger("AI_RATE_LIMIT_REQUEST_GET_IP", env, 60, {
        min: 1,
        max: 1000000,
      }),
      requestPostIpLimit: parseOptionalInteger("AI_RATE_LIMIT_REQUEST_POST_IP", env, 8, {
        min: 1,
        max: 1000000,
      }),
      statusIpLimit: parseOptionalInteger("AI_RATE_LIMIT_STATUS_IP", env, 120, {
        min: 1,
        max: 1000000,
      }),
      workerIpLimit: parseOptionalInteger("AI_RATE_LIMIT_WORKER_IP", env, 30, {
        min: 1,
        max: 1000000,
      }),
      operatorPostLimit: parseOptionalInteger("AI_RATE_LIMIT_OPERATOR_POST", env, 4, {
        min: 1,
        max: 1000000,
      }),
      operatorStatusLimit: parseOptionalInteger("AI_RATE_LIMIT_OPERATOR_STATUS", env, 120, {
        min: 1,
        max: 1000000,
      }),
      globalProcessingLimit: parseOptionalInteger("AI_GLOBAL_PROCESSING_LIMIT", env, 2, {
        min: 1,
        max: 100,
      }),
    },
  };
}

export { SUPPORTED_AI_OBSERVATION_MODEL, UUID_PATTERN };

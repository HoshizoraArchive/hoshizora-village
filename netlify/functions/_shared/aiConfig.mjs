const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSTGRES_INTEGER_MAX = 2147483647;
const MAX_REQUEST_LIMIT = 1000000;
const MAX_TIMEOUT_MS = 300000;
const MAX_SECONDS_BETWEEN_REQUESTS = 86400;
const SUPPORTED_AI_OBSERVATION_MODEL = "gemini-3.5-flash";
const MIN_WORKER_SHARED_SECRET_LENGTH = 32;

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

  return {
    enabled: true,
    supabaseUrl,
    supabaseServiceRoleKey,
    geminiApiKey,
    geminiApiKeyPresent: true,
    model,
    hoshizoraChiaProfileId,
    workerSharedSecret,
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
  };
}

export { SUPPORTED_AI_OBSERVATION_MODEL, UUID_PATTERN };

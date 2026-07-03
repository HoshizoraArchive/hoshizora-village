const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultEnvSource() {
  return globalThis.Netlify?.env ?? process.env;
}

export function readEnv(name, env = defaultEnvSource()) {
  if (env && typeof env.get === "function") {
    return env.get(name) ?? "";
  }

  return env?.[name] ?? "";
}

function parseRequiredPositiveInteger(name, env) {
  const rawValue = readEnv(name, env).trim();

  if (!/^[1-9][0-9]*$/.test(rawValue)) {
    throw new Error(`invalid_env:${name}`);
  }

  return Number(rawValue);
}

function parseRequiredNonNegativeInteger(name, env) {
  const rawValue = readEnv(name, env).trim();

  if (!/^(0|[1-9][0-9]*)$/.test(rawValue)) {
    throw new Error(`invalid_env:${name}`);
  }

  return Number(rawValue);
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

  if (!supabaseUrl || !supabaseServiceRoleKey || !geminiApiKey) {
    throw new Error("invalid_env:required_secret");
  }

  return {
    enabled: true,
    supabaseUrl,
    supabaseServiceRoleKey,
    geminiApiKeyPresent: true,
    operatorUserIds: parseOperatorUserIds(env),
    dailyRequestLimit: parseRequiredPositiveInteger("AI_DAILY_REQUEST_LIMIT", env),
    monthlyRequestLimit: parseRequiredPositiveInteger("AI_MONTHLY_REQUEST_LIMIT", env),
    dailyCostLimitMicroUsd: parseRequiredPositiveInteger("AI_DAILY_COST_LIMIT_MICRO_USD", env),
    monthlyCostLimitMicroUsd: parseRequiredPositiveInteger("AI_MONTHLY_COST_LIMIT_MICRO_USD", env),
    observationTimeoutMs: parseRequiredPositiveInteger("AI_OBSERVATION_TIMEOUT_MS", env),
    maxRetries: parseRequiredNonNegativeInteger("AI_OBSERVATION_MAX_RETRIES", env),
    minSecondsBetweenRequests: parseRequiredNonNegativeInteger("AI_MIN_SECONDS_BETWEEN_REQUESTS", env),
    reservedCostMicroUsd: parseRequiredPositiveInteger("AI_RESERVED_COST_MICRO_USD", env),
  };
}

export { UUID_PATTERN };

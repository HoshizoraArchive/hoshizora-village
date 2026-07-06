import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import { readEnv } from "./aiConfig.mjs";

const DEFAULT_LIMITS = Object.freeze({
  windowSeconds: 60,
  requestGetIpLimit: 60,
  requestPostIpLimit: 8,
  statusIpLimit: 120,
  workerIpLimit: 30,
  operatorPostLimit: 4,
  operatorStatusLimit: 120,
  globalProcessingLimit: 2,
});

const RATE_LIMIT_MAX = 1000000;
const WINDOW_MAX_SECONDS = 3600;
const RATE_LIMIT_STORE_MAX_ENTRIES = 5000;
const store = globalThis.__hoshizoraAiRateLimitStore ?? new Map();
globalThis.__hoshizoraAiRateLimitStore = store;

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

export function readAiRateLimitConfig(env) {
  const windowSeconds = parseOptionalInteger("AI_RATE_LIMIT_WINDOW_SECONDS", env, DEFAULT_LIMITS.windowSeconds, {
    min: 1,
    max: WINDOW_MAX_SECONDS,
  });

  return {
    windowSeconds,
    requestGetIpLimit: parseOptionalInteger("AI_RATE_LIMIT_REQUEST_GET_IP", env, DEFAULT_LIMITS.requestGetIpLimit, {
      min: 1,
      max: RATE_LIMIT_MAX,
    }),
    requestPostIpLimit: parseOptionalInteger("AI_RATE_LIMIT_REQUEST_POST_IP", env, DEFAULT_LIMITS.requestPostIpLimit, {
      min: 1,
      max: RATE_LIMIT_MAX,
    }),
    statusIpLimit: parseOptionalInteger("AI_RATE_LIMIT_STATUS_IP", env, DEFAULT_LIMITS.statusIpLimit, {
      min: 1,
      max: RATE_LIMIT_MAX,
    }),
    workerIpLimit: parseOptionalInteger("AI_RATE_LIMIT_WORKER_IP", env, DEFAULT_LIMITS.workerIpLimit, {
      min: 1,
      max: RATE_LIMIT_MAX,
    }),
    operatorPostLimit: parseOptionalInteger("AI_RATE_LIMIT_OPERATOR_POST", env, DEFAULT_LIMITS.operatorPostLimit, {
      min: 1,
      max: RATE_LIMIT_MAX,
    }),
    operatorStatusLimit: parseOptionalInteger("AI_RATE_LIMIT_OPERATOR_STATUS", env, DEFAULT_LIMITS.operatorStatusLimit, {
      min: 1,
      max: RATE_LIMIT_MAX,
    }),
    globalProcessingLimit: parseOptionalInteger("AI_GLOBAL_PROCESSING_LIMIT", env, DEFAULT_LIMITS.globalProcessingLimit, {
      min: 1,
      max: 100,
    }),
  };
}

export function getClientIp(request, context) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const firstForwarded = forwardedFor.split(",")[0]?.trim();

  return (
    context?.ip ||
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    firstForwarded ||
    "unknown"
  );
}

export function pruneRateLimitStore({
  rateLimitStore = store,
  now = Date.now(),
  maxEntries = RATE_LIMIT_STORE_MAX_ENTRIES,
  preserveKey,
} = {}) {
  for (const [entryKey, value] of rateLimitStore.entries()) {
    if (!value || value.resetAt <= now) {
      rateLimitStore.delete(entryKey);
    }
  }

  if (rateLimitStore.size <= maxEntries) {
    return rateLimitStore.size;
  }

  const entriesByExpiry = [...rateLimitStore.entries()]
    .filter(([entryKey]) => entryKey !== preserveKey)
    .sort((left, right) => Number(left[1]?.resetAt ?? 0) - Number(right[1]?.resetAt ?? 0));

  for (const [entryKey] of entriesByExpiry) {
    if (rateLimitStore.size <= maxEntries) {
      break;
    }

    rateLimitStore.delete(entryKey);
  }

  return rateLimitStore.size;
}

export function checkRateLimit({
  key,
  limit,
  windowSeconds,
  now = Date.now(),
  rateLimitStore = store,
  maxEntries = RATE_LIMIT_STORE_MAX_ENTRIES,
}) {
  pruneRateLimitStore({ rateLimitStore, now, maxEntries, preserveKey: key });

  const windowMs = windowSeconds * 1000;
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    pruneRateLimitStore({ rateLimitStore, now, maxEntries, preserveKey: key });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  pruneRateLimitStore({ rateLimitStore, now, maxEntries, preserveKey: key });
  return {
    ok: true,
    remaining: limit - current.count,
    retryAfterSeconds: 0,
  };
}

export function assertRateLimit({ scope, key, limit, windowSeconds, now, rateLimitStore, maxEntries }) {
  const result = checkRateLimit({
    key: `${scope}:${key}`,
    limit,
    windowSeconds,
    now,
    rateLimitStore,
    maxEntries,
  });

  if (!result.ok) {
    throw aiHttpError(429, AI_ERROR.RATE_LIMITED, {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  return result;
}

export async function assertGlobalProcessingCapacity({ supabase, limit, reservedSlots = 0 }) {
  const { count, error } = await supabase
    .from("ai_observation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "processing");

  if (error || typeof count !== "number") {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  if (count + reservedSlots > limit) {
    throw aiHttpError(429, AI_ERROR.RATE_LIMITED, {
      retryAfterSeconds: 60,
    });
  }

  return count;
}

export function resetRateLimitStore(rateLimitStore = store) {
  rateLimitStore.clear();
}

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readEnv } from "./aiConfig.mjs";
import { resolveChiaDailyMeteorSlot } from "./chiaDailyMeteor.mjs";
import { normalizeWorkerDispatchTtlSeconds } from "./aiWorkerDispatch.mjs";

const MIN_SHARED_SECRET_LENGTH = 32;
const NONCE_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_SLOTS = new Set(["morning", "noon", "evening"]);
const nonceStore = globalThis.__hoshizoraChiaDailyMeteorDispatchNonceStore ?? new Map();
globalThis.__hoshizoraChiaDailyMeteorDispatchNonceStore = nonceStore;

export class ChiaDailyMeteorDispatchError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "ChiaDailyMeteorDispatchError";
    this.status = status;
    this.code = code;
  }
}

function dispatchMessage({ slot, localDate, scheduledFor, issuedAt, nonce }) {
  return [
    "chia-daily-meteor.v1",
    slot,
    localDate,
    scheduledFor,
    issuedAt,
    nonce,
  ].join(".");
}

function hmacHex(secret, message) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function rememberNonce({ slot, localDate, nonce, expiresAt, store, now }) {
  for (const [key, value] of store.entries()) {
    if (value <= now) {
      store.delete(key);
    }
  }

  const key = `${slot}:${localDate}:${nonce}`;

  if (store.has(key)) {
    return false;
  }

  store.set(key, expiresAt);
  return true;
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function assertValidSlotInfo({ slot, localDate, scheduledFor, issuedAt }) {
  if (
    !SUPPORTED_SLOTS.has(slot) ||
    typeof localDate !== "string" ||
    !LOCAL_DATE_PATTERN.test(localDate) ||
    !isCanonicalIsoTimestamp(scheduledFor)
  ) {
    throw new ChiaDailyMeteorDispatchError(403, "invalid_chia_daily_meteor_dispatch");
  }

  const resolved = resolveChiaDailyMeteorSlot(new Date(issuedAt * 1000));

  if (
    !resolved ||
    resolved.slot !== slot ||
    resolved.localDate !== localDate ||
    resolved.scheduledFor !== scheduledFor
  ) {
    throw new ChiaDailyMeteorDispatchError(403, "invalid_chia_daily_meteor_slot");
  }
}

export function readChiaDailyMeteorDispatchAuthConfig(env) {
  const secret = readEnv("AI_WORKER_SHARED_SECRET", env).trim();

  if (secret.length < MIN_SHARED_SECRET_LENGTH) {
    throw new Error("invalid_env:AI_WORKER_SHARED_SECRET");
  }

  const rawTtlSeconds = readEnv("AI_WORKER_DISPATCH_TTL_SECONDS", env).trim();

  return {
    secret,
    ttlSeconds: normalizeWorkerDispatchTtlSeconds(rawTtlSeconds || undefined),
  };
}

export function signChiaDailyMeteorDispatch(slotInfo, {
  secret,
  now = Date.now(),
  nonce = randomUUID(),
} = {}) {
  const payload = {
    slot: slotInfo.slot,
    localDate: slotInfo.localDate,
    scheduledFor: slotInfo.scheduledFor,
    issuedAt: Math.floor(now / 1000),
    nonce,
  };

  assertValidSlotInfo(payload);

  return {
    ...payload,
    signature: hmacHex(secret, dispatchMessage(payload)),
  };
}

export function verifyChiaDailyMeteorDispatch(payload, {
  secret,
  ttlSeconds,
  now = Date.now(),
  store = nonceStore,
} = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ChiaDailyMeteorDispatchError(400, "invalid_chia_daily_meteor_dispatch");
  }

  if (
    Object.keys(payload).sort().join(",") !==
    "issuedAt,localDate,nonce,scheduledFor,signature,slot"
  ) {
    throw new ChiaDailyMeteorDispatchError(400, "invalid_chia_daily_meteor_dispatch");
  }

  if (
    !Number.isSafeInteger(payload.issuedAt) ||
    typeof payload.nonce !== "string" ||
    !NONCE_PATTERN.test(payload.nonce) ||
    typeof payload.signature !== "string" ||
    !SIGNATURE_PATTERN.test(payload.signature)
  ) {
    throw new ChiaDailyMeteorDispatchError(403, "invalid_chia_daily_meteor_dispatch");
  }

  const normalizedTtlSeconds = normalizeWorkerDispatchTtlSeconds(ttlSeconds);
  const nowSeconds = Math.floor(now / 1000);

  if (payload.issuedAt > nowSeconds + 5 || nowSeconds - payload.issuedAt > normalizedTtlSeconds) {
    throw new ChiaDailyMeteorDispatchError(403, "expired_chia_daily_meteor_dispatch");
  }

  assertValidSlotInfo(payload);
  const expectedSignature = hmacHex(secret, dispatchMessage(payload));

  if (!timingSafeEqualText(payload.signature, expectedSignature)) {
    throw new ChiaDailyMeteorDispatchError(403, "invalid_chia_daily_meteor_dispatch");
  }

  if (!rememberNonce({
    slot: payload.slot,
    localDate: payload.localDate,
    nonce: payload.nonce,
    expiresAt: (payload.issuedAt + normalizedTtlSeconds) * 1000,
    store,
    now,
  })) {
    throw new ChiaDailyMeteorDispatchError(403, "replayed_chia_daily_meteor_dispatch");
  }

  return {
    slotInfo: {
      slot: payload.slot,
      localDate: payload.localDate,
      scheduledFor: payload.scheduledFor,
    },
    issuedAt: payload.issuedAt,
    nonce: payload.nonce,
  };
}

export function resetChiaDailyMeteorDispatchNonceStore(store = nonceStore) {
  store.clear();
}

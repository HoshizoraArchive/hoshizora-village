import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import { UUID_PATTERN } from "./aiConfig.mjs";
import { AI_OBSERVATION_CONTEXT, isAiObservationContext, normalizeAiObservationContext } from "./aiObservationContext.mjs";

const DEFAULT_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 300;
const NONCE_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const nonceStore = globalThis.__hoshizoraAiWorkerDispatchNonceStore ?? new Map();
globalThis.__hoshizoraAiWorkerDispatchNonceStore = nonceStore;

function dispatchMessage({ jobId, issuedAt, nonce, observationContext }) {
  if (observationContext) {
    return `${jobId}.${issuedAt}.${nonce}.${observationContext}`;
  }

  return `${jobId}.${issuedAt}.${nonce}`;
}

function hmacHex(secret, message) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function rememberNonce({ jobId, nonce, expiresAt, store = nonceStore, now = Date.now() }) {
  for (const [key, value] of store.entries()) {
    if (value <= now) {
      store.delete(key);
    }
  }

  const key = `${jobId}:${nonce}`;

  if (store.has(key)) {
    return false;
  }

  store.set(key, expiresAt);
  return true;
}

export function normalizeWorkerDispatchTtlSeconds(value) {
  const ttl = value === undefined || value === null ? DEFAULT_TTL_SECONDS : Number(value);

  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_TTL_SECONDS) {
    throw new Error("invalid_env:AI_WORKER_DISPATCH_TTL_SECONDS");
  }

  return ttl;
}

export function signWorkerDispatch({
  jobId,
  secret,
  observationContext = AI_OBSERVATION_CONTEXT.MANUAL,
  now = Date.now(),
  nonce = randomUUID(),
}) {
  const normalizedJobId = String(jobId).toLowerCase();
  const normalizedContext = normalizeAiObservationContext(observationContext);
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    jobId: normalizedJobId,
    issuedAt,
    nonce,
    observationContext: normalizedContext,
  };

  return {
    ...payload,
    signature: hmacHex(secret, dispatchMessage(payload)),
  };
}

export function verifyWorkerDispatchPayload(payload, {
  expectedJobId,
  secret,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now(),
  store = nonceStore,
} = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  const keys = Object.keys(payload).sort();

  const hasObservationContext = Object.prototype.hasOwnProperty.call(payload, "observationContext");

  if (
    keys.join(",") !== "issuedAt,jobId,nonce,signature" &&
    keys.join(",") !== "issuedAt,jobId,nonce,observationContext,signature"
  ) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  const jobId = String(payload.jobId ?? "").toLowerCase();

  if (!UUID_PATTERN.test(jobId) || (expectedJobId && jobId !== expectedJobId)) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  if (!Number.isSafeInteger(payload.issuedAt)) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  if (typeof payload.nonce !== "string" || !NONCE_PATTERN.test(payload.nonce)) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  if (hasObservationContext && !isAiObservationContext(payload.observationContext)) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  if (typeof payload.signature !== "string" || !SIGNATURE_PATTERN.test(payload.signature)) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  const normalizedTtlSeconds = normalizeWorkerDispatchTtlSeconds(ttlSeconds);
  const nowSeconds = Math.floor(now / 1000);

  if (payload.issuedAt > nowSeconds + 5 || nowSeconds - payload.issuedAt > normalizedTtlSeconds) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  const expectedSignature = hmacHex(secret, dispatchMessage({
    jobId,
    issuedAt: payload.issuedAt,
    nonce: payload.nonce,
    observationContext: hasObservationContext ? payload.observationContext : undefined,
  }));

  if (!timingSafeEqualText(payload.signature, expectedSignature)) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  if (!rememberNonce({
    jobId,
    nonce: payload.nonce,
    expiresAt: (payload.issuedAt + normalizedTtlSeconds) * 1000,
    store,
    now,
  })) {
    throw aiHttpError(403, AI_ERROR.FORBIDDEN);
  }

  return {
    jobId,
    issuedAt: payload.issuedAt,
    nonce: payload.nonce,
    observationContext: hasObservationContext
      ? payload.observationContext
      : AI_OBSERVATION_CONTEXT.MANUAL,
  };
}

export function resetWorkerDispatchNonceStore(store = nonceStore) {
  store.clear();
}

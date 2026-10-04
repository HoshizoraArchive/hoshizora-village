import {
  createHash,
  randomUUID,
  sign as signDetached,
  verify as verifyDetached,
} from "node:crypto";
import { resolveChiaDailyMeteorSlot } from "./chiaDailyMeteor.mjs";

const VERSION = "chia-dot-meteor.v1";
const MAX_TTL_SECONDS = 300;
const FUTURE_SKEW_SECONDS = 5;
const NONCE_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const BODY_HASH_PATTERN = /^[0-9a-f]{64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{80,120}$/;
const ACTIONS = new Set(["snapshot", "publish", "repair"]);
const EXPECTED_KEYS = [
  "action",
  "body",
  "bodyHash",
  "issuedAt",
  "localDate",
  "mediaEvidenceKey",
  "nonce",
  "scheduledFor",
  "signature",
  "snapshotGeneratedAt",
  "snapshotHash",
  "slot",
].sort().join(",");

export const CHIA_DOT_METEOR_PUBLIC_KEY_PEM = [
  "-----BEGIN PUBLIC KEY-----",
  "MCowBQYDK2VwAyEAJ97+9rQLw27zIzSs1S4Lb5EYrM6OicfCnfZ11eUF9zo=",
  "-----END PUBLIC KEY-----",
  "",
].join("\n");

export class ChiaDotMeteorAuthError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "ChiaDotMeteorAuthError";
    this.status = status;
    this.code = code;
  }
}

function canonicalMessage(payload) {
  return [
    VERSION,
    payload.action,
    payload.slot,
    payload.localDate,
    payload.scheduledFor,
    String(payload.issuedAt),
    payload.nonce,
    payload.bodyHash,
    payload.snapshotGeneratedAt,
    payload.snapshotHash,
    payload.mediaEvidenceKey,
  ].join("\n");
}

export function hashChiaDotMeteorBody(body) {
  return createHash("sha256").update(String(body ?? ""), "utf8").digest("hex");
}

function normalizeTtlSeconds(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return 60;
  return Math.min(parsed, MAX_TTL_SECONDS);
}

function assertScheduledTuple(payload) {
  const scheduled = new Date(payload.scheduledFor);
  if (!Number.isFinite(scheduled.getTime()) || scheduled.toISOString() !== payload.scheduledFor) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_slot");
  }

  const resolved = resolveChiaDailyMeteorSlot(scheduled);
  if (
    !resolved
    || resolved.slot !== payload.slot
    || resolved.localDate !== payload.localDate
    || resolved.scheduledFor !== payload.scheduledFor
    || resolved.localMinute !== 0
  ) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_slot");
  }
}

function assertCurrentPublishSlot(payload, now) {
  if (payload.action !== "publish") return;
  const resolved = resolveChiaDailyMeteorSlot(new Date(now));
  if (
    !resolved
    || resolved.slot !== payload.slot
    || resolved.localDate !== payload.localDate
    || resolved.scheduledFor !== payload.scheduledFor
    || resolved.localMinute >= 10
  ) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_slot");
  }
}

function assertRepairWindow(payload, now) {
  if (payload.action !== "repair") return;
  const scheduledAt = Date.parse(payload.scheduledFor);
  if (
    now < scheduledAt - FUTURE_SKEW_SECONDS * 1000
    || now - scheduledAt > 24 * 60 * 60 * 1000
  ) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_slot");
  }
}

function assertPublishSnapshot(payload, now) {
  if (payload.action !== "publish") {
    if (payload.snapshotGeneratedAt || payload.snapshotHash || payload.mediaEvidenceKey) {
      throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_request");
    }
    return;
  }
  const generatedAt = Date.parse(payload.snapshotGeneratedAt);
  if (
    !Number.isFinite(generatedAt)
    || new Date(generatedAt).toISOString() !== payload.snapshotGeneratedAt
    || generatedAt > now + FUTURE_SKEW_SECONDS * 1000
    || now - generatedAt > 120_000
    || !BODY_HASH_PATTERN.test(payload.snapshotHash)
    || (payload.mediaEvidenceKey !== "" && !BODY_HASH_PATTERN.test(payload.mediaEvidenceKey))
  ) {
    throw new ChiaDotMeteorAuthError(403, "stale_chia_dot_meteor_snapshot");
  }
}

function assertSnapshotHorizon(payload, now) {
  if (payload.action !== "snapshot") return;
  const scheduledAt = Date.parse(payload.scheduledFor);
  if (scheduledAt < now - 60 * 60 * 1000 || scheduledAt > now + 24 * 60 * 60 * 1000) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_slot");
  }
}

export function signChiaDotMeteorRequest({
  action,
  slotInfo,
  body = "",
  snapshotGeneratedAt = "",
  snapshotHash = "",
  mediaEvidenceKey = "",
  privateKey,
  now = Date.now(),
  nonce = randomUUID(),
}) {
  const normalizedBody = String(body ?? "");
  const payload = {
    action,
    slot: slotInfo?.slot,
    localDate: slotInfo?.localDate,
    scheduledFor: slotInfo?.scheduledFor,
    issuedAt: Math.floor(now / 1000),
    nonce,
    bodyHash: hashChiaDotMeteorBody(normalizedBody),
    body: normalizedBody,
    snapshotGeneratedAt,
    snapshotHash,
    mediaEvidenceKey,
  };

  if (!ACTIONS.has(action) || !privateKey) {
    throw new Error("invalid_chia_dot_meteor_signing_configuration");
  }
  assertScheduledTuple(payload);

  return {
    ...payload,
    signature: signDetached(null, Buffer.from(canonicalMessage(payload)), privateKey).toString("base64url"),
  };
}

export function verifyChiaDotMeteorRequest(payload, {
  publicKey = CHIA_DOT_METEOR_PUBLIC_KEY_PEM,
  ttlSeconds = 60,
  now = Date.now(),
} = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ChiaDotMeteorAuthError(400, "invalid_chia_dot_meteor_request");
  }

  if (Object.keys(payload).sort().join(",") !== EXPECTED_KEYS) {
    throw new ChiaDotMeteorAuthError(400, "invalid_chia_dot_meteor_request");
  }

  if (
    !ACTIONS.has(payload.action)
    || typeof payload.slot !== "string"
    || typeof payload.localDate !== "string"
    || typeof payload.scheduledFor !== "string"
    || !Number.isSafeInteger(payload.issuedAt)
    || typeof payload.nonce !== "string"
    || !NONCE_PATTERN.test(payload.nonce)
    || typeof payload.body !== "string"
    || typeof payload.bodyHash !== "string"
    || !BODY_HASH_PATTERN.test(payload.bodyHash)
    || typeof payload.signature !== "string"
    || !SIGNATURE_PATTERN.test(payload.signature)
    || typeof payload.snapshotGeneratedAt !== "string"
    || typeof payload.snapshotHash !== "string"
    || typeof payload.mediaEvidenceKey !== "string"
  ) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_request");
  }

  const normalizedTtlSeconds = normalizeTtlSeconds(ttlSeconds);
  const nowSeconds = Math.floor(now / 1000);
  if (
    payload.issuedAt > nowSeconds + FUTURE_SKEW_SECONDS
    || nowSeconds - payload.issuedAt > normalizedTtlSeconds
  ) {
    throw new ChiaDotMeteorAuthError(403, "expired_chia_dot_meteor_request");
  }

  assertScheduledTuple(payload);
  assertCurrentPublishSlot(payload, now);
  assertRepairWindow(payload, now);
  assertSnapshotHorizon(payload, now);
  assertPublishSnapshot(payload, now);

  if (hashChiaDotMeteorBody(payload.body) !== payload.bodyHash) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_request");
  }

  let signature;
  try {
    signature = Buffer.from(payload.signature, "base64url");
  } catch {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_request");
  }

  const verified = verifyDetached(
    null,
    Buffer.from(canonicalMessage(payload)),
    publicKey,
    signature,
  );
  if (!verified) {
    throw new ChiaDotMeteorAuthError(403, "invalid_chia_dot_meteor_request");
  }

  return {
    action: payload.action,
    slotInfo: {
      slot: payload.slot,
      localDate: payload.localDate,
      scheduledFor: payload.scheduledFor,
    },
    body: payload.body,
    issuedAt: payload.issuedAt,
    nonce: payload.nonce,
    snapshotGeneratedAt: payload.snapshotGeneratedAt,
    snapshotHash: payload.snapshotHash,
    mediaEvidenceKey: payload.mediaEvidenceKey,
  };
}

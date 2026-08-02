import { createHash } from "node:crypto";

export const DISASTER_RECOVERY_STORE_NAME = "hoshizora-dr-backups";
export const DISASTER_RECOVERY_STATE_KEY = "_control/state.json";
export const DISASTER_RECOVERY_RUNS_PREFIX = "runs/";
export const DISASTER_RECOVERY_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DISASTER_RECOVERY_RETENTION_COUNT = 3;

export function createDisasterRecoveryRunId(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function shouldStartDisasterRecoveryBackup(state, now = new Date()) {
  if (state?.activeRunId) {
    return false;
  }

  if (!state?.lastCompletedAt) {
    return true;
  }

  const completedAt = Date.parse(state.lastCompletedAt);
  if (!Number.isFinite(completedAt)) {
    return true;
  }

  return now.getTime() - completedAt >= DISASTER_RECOVERY_INTERVAL_MS;
}

export function createStorageBackupKey(runId, bucketName, objectPath) {
  const cleanBucket = String(bucketName ?? "").replace(/^\/+|\/+$/g, "");
  const cleanPath = String(objectPath ?? "").replace(/^\/+/, "");

  if (!runId || !cleanBucket || !cleanPath) {
    throw new Error("invalid_disaster_recovery_storage_key");
  }

  return `${DISASTER_RECOVERY_RUNS_PREFIX}${runId}/storage/${cleanBucket}/${cleanPath}`;
}

export function createDatabaseBackupKey(runId) {
  return `${DISASTER_RECOVERY_RUNS_PREFIX}${runId}/database/snapshot.json`;
}

export function createManifestKey(runId) {
  return `${DISASTER_RECOVERY_RUNS_PREFIX}${runId}/manifest.json`;
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function selectStorageRestoreVerificationSample(objects = []) {
  return [...objects]
    .filter((item) => item?.completed === true && item?.blobKey && item?.sha256)
    .sort((left, right) => Number(left.sizeBytes ?? 0) - Number(right.sizeBytes ?? 0))[0] ?? null;
}

export function getCompletedBackupRunIds(blobKeys = []) {
  const runIds = new Set();

  for (const key of blobKeys) {
    const match = String(key).match(/^runs\/([^/]+)\/manifest\.json$/);
    if (match) {
      runIds.add(match[1]);
    }
  }

  return [...runIds].sort().reverse();
}

export function getExpiredBackupRunIds(blobKeys = [], retentionCount = DISASTER_RECOVERY_RETENTION_COUNT) {
  return getCompletedBackupRunIds(blobKeys).slice(Math.max(0, retentionCount));
}

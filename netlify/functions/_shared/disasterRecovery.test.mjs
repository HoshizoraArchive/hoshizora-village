import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createDatabaseBackupKey,
  createDisasterRecoveryRunId,
  createManifestKey,
  createStorageBackupKey,
  getCompletedBackupRunIds,
  getExpiredBackupRunIds,
  selectStorageRestoreVerificationSample,
  sha256Hex,
  shouldStartDisasterRecoveryBackup,
} from "./disasterRecovery.mjs";

const migrationPath = "supabase/migrations/20260802002927_add_disaster_recovery_snapshot_rpcs.sql";
const migrationSql = readFileSync(migrationPath, "utf8").trim();
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const schemaMarker = "-- Disaster-recovery snapshot helpers for trusted server-side backup jobs.\n";
const schemaEnd = "grant execute on function public.verify_disaster_recovery_snapshot(jsonb) to service_role;";

test("disaster recovery run ids are path-safe and stable", () => {
  assert.equal(
    createDisasterRecoveryRunId(new Date("2026-08-01T13:30:45.123Z")),
    "2026-08-01T13-30-45-123Z",
  );
});

test("disaster recovery starts when no completed backup exists", () => {
  const now = new Date("2026-08-02T00:00:00.000Z");
  assert.equal(shouldStartDisasterRecoveryBackup({}, now), true);
  assert.equal(shouldStartDisasterRecoveryBackup({ activeRunId: "running" }, now), false);
});

test("disaster recovery waits 24 hours after a successful backup", () => {
  const state = { lastCompletedAt: "2026-08-01T12:00:00.000Z" };
  assert.equal(
    shouldStartDisasterRecoveryBackup(state, new Date("2026-08-02T11:59:59.999Z")),
    false,
  );
  assert.equal(
    shouldStartDisasterRecoveryBackup(state, new Date("2026-08-02T12:00:00.000Z")),
    true,
  );
});

test("backup keys remain under the run namespace", () => {
  const runId = "2026-08-01T13-30-45-123Z";
  assert.equal(
    createStorageBackupKey(runId, "meteor-media", "/user/post/image.png"),
    `runs/${runId}/storage/meteor-media/user/post/image.png`,
  );
  assert.equal(createDatabaseBackupKey(runId), `runs/${runId}/database/snapshot.json`);
  assert.equal(createManifestKey(runId), `runs/${runId}/manifest.json`);
});

test("backup storage key rejects incomplete input", () => {
  assert.throws(() => createStorageBackupKey("run", "", "file"), /invalid_disaster_recovery_storage_key/);
  assert.throws(() => createStorageBackupKey("run", "bucket", ""), /invalid_disaster_recovery_storage_key/);
});

test("restore verification selects the smallest completed object", () => {
  const sample = selectStorageRestoreVerificationSample([
    { completed: true, blobKey: "a", sha256: "1", sizeBytes: 100 },
    { completed: false, blobKey: "b", sha256: null, sizeBytes: 1 },
    { completed: true, blobKey: "c", sha256: "3", sizeBytes: 20 },
  ]);
  assert.equal(sample.blobKey, "c");
});

test("completed and expired backup run ids are derived only from manifests", () => {
  const keys = [
    "runs/2026-08-03/manifest.json",
    "runs/2026-08-03/storage/a/file",
    "runs/2026-08-02/manifest.json",
    "runs/2026-08-01/manifest.json",
    "runs/2026-07-31/manifest.json",
    "_control/state.json",
  ];
  assert.deepEqual(getCompletedBackupRunIds(keys), [
    "2026-08-03",
    "2026-08-02",
    "2026-08-01",
    "2026-07-31",
  ]);
  assert.deepEqual(getExpiredBackupRunIds(keys, 3), ["2026-07-31"]);
});

test("sha256 helper is deterministic", () => {
  assert.equal(
    sha256Hex(Buffer.from("星空Village", "utf8")),
    sha256Hex(Buffer.from("星空Village", "utf8")),
  );
  assert.notEqual(sha256Hex(Buffer.from("a")), sha256Hex(Buffer.from("b")));
});

test("disaster recovery migration and schema.sql stay byte-for-byte synchronized", () => {
  const schemaSuffix = schemaSql.split(schemaMarker)[1] ?? "";
  const schemaEndIndex = schemaSuffix.indexOf(schemaEnd);

  assert.notEqual(schemaEndIndex, -1, "disaster recovery schema block must include its final service_role grant");

  const schemaBlock = `${schemaMarker}${schemaSuffix.slice(0, schemaEndIndex + schemaEnd.length)}`.trim();
  assert.equal(schemaBlock, migrationSql);
});


test("DR function uses Netlify runtime context and environment APIs", () => {
  const functionSource = readFileSync("netlify/functions/disaster-recovery-backup.mjs", "utf8");
  assert.match(functionSource, /globalThis\.Netlify\?\.env/);
  assert.match(functionSource, /globalThis\.Netlify\?\.context\?\.deploy\?\.context/);
  assert.doesNotMatch(functionSource, /if \(process\.env\.CONTEXT !== "production"\)/);
});

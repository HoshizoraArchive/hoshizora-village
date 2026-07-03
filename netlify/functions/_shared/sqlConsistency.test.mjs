import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const migrationSql = readFileSync("supabase/migrations/20260703_add_ai_observation_security_foundation.sql", "utf8");
const observationMvpMigrationSql = readFileSync("supabase/migrations/20260704_add_chia_observation_mvp.sql", "utf8");
const preflightSql = readFileSync("docs/ai-resident-security-preflight.sql", "utf8");
const observationMvpPreflightSql = readFileSync("docs/ai-observation-mvp-preflight.sql", "utf8");
const appJsx = readFileSync("src/App.jsx", "utf8");

const requiredTokens = [
  "public.ai_observation_job_status",
  "public.ai_observation_jobs",
  "ai_observation_jobs_attempts_check",
  "ai_observation_jobs_one_active_per_post_resident_idx",
  "ai_observation_jobs_one_success_per_post_resident_idx",
  "public.reserve_ai_observation_job",
  "app_private.ai_observation_billable_cost_micro_usd",
  "post_media_storage_path_owner_check",
  "post_media_thumbnail_storage_path_owner_check",
];

const forbiddenStorageHelperToken = "storage_path_belongs_to_owner";

const storagePathCheckFragments = [
  "storage_path is not null",
  "storage_path = btrim(storage_path)",
  "storage_path <> ''",
  "position('/' in storage_path) > 0",
  "split_part(storage_path, '/', 1) = uploader_id::text",
  "storage_path !~ '^/'",
  "storage_path !~ '/$'",
  "storage_path !~ '//'",
  String.raw`storage_path !~ '(^|/)\.{1,2}(/|$)'`,
  "position(chr(92) in storage_path) = 0",
  "position('%' in storage_path) = 0",
];

const thumbnailPathCheckFragments = [
  "thumbnail_storage_path is null",
  "thumbnail_storage_path = btrim(thumbnail_storage_path)",
  "thumbnail_storage_path <> ''",
  "position('/' in thumbnail_storage_path) > 0",
  "split_part(thumbnail_storage_path, '/', 1) = uploader_id::text",
  "thumbnail_storage_path !~ '^/'",
  "thumbnail_storage_path !~ '/$'",
  "thumbnail_storage_path !~ '//'",
  String.raw`thumbnail_storage_path !~ '(^|/)\.{1,2}(/|$)'`,
  "position(chr(92) in thumbnail_storage_path) = 0",
  "position('%' in thumbnail_storage_path) = 0",
];

test("AI security migration and schema.sql contain the same critical DB elements", () => {
  for (const token of requiredTokens) {
    assert.equal(migrationSql.includes(token), true, `migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }
});

test("AI observation MVP migration and schema.sql contain worker state RPCs with locked execution", () => {
  const tokens = [
    "public.claim_ai_observation_job",
    "public.start_ai_observation_attempt",
    "public.complete_ai_observation_job",
    "public.fail_ai_observation_job",
    "public.cancel_ai_observation_job",
    "for update",
    "p_expected_request_fingerprint",
    "v_job.request_fingerprint <> p_expected_request_fingerprint",
    "v_post.visibility <> 'public'",
    "v_post.deleted_at is not null",
    "p_model <> 'gemini-3.5-flash'",
    "to service_role",
  ];

  for (const token of tokens) {
    assert.equal(observationMvpMigrationSql.includes(token), true, `MVP migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }
});

test("AI observation MVP completion RPC old overload is removed and new signature is granted", () => {
  const oldSignature = "uuid, uuid, jsonb, text, boolean, text, integer, integer, integer, bigint";
  const newSignature = "uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint";

  assert.equal(observationMvpMigrationSql.includes(`drop function if exists public.complete_ai_observation_job(\n  ${oldSignature}`), true);
  assert.equal(observationMvpMigrationSql.includes(newSignature), true);
  assert.equal(schemaSql.includes(newSignature), true);
});

test("AI observation MVP RPCs are not executable by browser roles", () => {
  const rpcNames = [
    "claim_ai_observation_job",
    "start_ai_observation_attempt",
    "complete_ai_observation_job",
    "fail_ai_observation_job",
    "cancel_ai_observation_job",
  ];

  for (const rpcName of rpcNames) {
    assert.equal(
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpcName}`, "i").test(observationMvpMigrationSql),
      true,
      `MVP migration missing browser-role revoke for ${rpcName}`,
    );
    assert.equal(
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpcName}`, "i").test(schemaSql),
      true,
      `schema.sql missing browser-role revoke for ${rpcName}`,
    );
  }
});

test("post_media Storage path checks do not depend on app_private helper functions", () => {
  assert.equal(migrationSql.includes(forbiddenStorageHelperToken), false, "migration still references private Storage path helper");
  assert.equal(schemaSql.includes(forbiddenStorageHelperToken), false, "schema.sql still references private Storage path helper");
  assert.equal(
    /grant\s+execute\s+on\s+function\s+app_private\.[^(]*storage_path[^(]*\([^)]*\)\s+to\s+[^;]*authenticated/i.test(migrationSql),
    false,
    "migration grants authenticated EXECUTE on a private Storage path helper",
  );
  assert.equal(
    /grant\s+execute\s+on\s+function\s+app_private\.[^(]*storage_path[^(]*\([^)]*\)\s+to\s+[^;]*authenticated/i.test(schemaSql),
    false,
    "schema.sql grants authenticated EXECUTE on a private Storage path helper",
  );
  assert.equal(
    /grant\s+execute\s+on\s+function\s+app_private\.[\s\S]*?\s+to\s+[^;]*authenticated/i.test(migrationSql),
    false,
    "migration grants authenticated EXECUTE on an app_private function",
  );
  assert.equal(
    /grant\s+execute\s+on\s+function\s+app_private\.[\s\S]*?\s+to\s+[^;]*authenticated/i.test(schemaSql),
    false,
    "schema.sql grants authenticated EXECUTE on an app_private function",
  );
});

test("migration and schema.sql use the same direct Storage path check fragments", () => {
  for (const fragment of [...storagePathCheckFragments, ...thumbnailPathCheckFragments]) {
    assert.equal(migrationSql.includes(fragment), true, `migration missing Storage path check fragment: ${fragment}`);
    assert.equal(schemaSql.includes(fragment), true, `schema.sql missing Storage path check fragment: ${fragment}`);
  }
});

test("preflight SQL does not depend on objects created by the AI security migration", () => {
  const migrationOnlyTokens = [
    "ai_observation_jobs",
    "ai_observation_job_status",
    "reserve_ai_observation_job",
    "ai_observation_billable_cost_micro_usd",
    forbiddenStorageHelperToken,
  ];

  for (const token of migrationOnlyTokens) {
    assert.equal(preflightSql.includes(token), false, `preflight SQL unexpectedly references ${token}`);
  }
});

test("AI observation MVP preflight treats missing chia profile as an anomaly", () => {
  assert.equal(observationMvpPreflightSql.includes("when observed_count = 0 then 1"), true);
  assert.equal(observationMvpPreflightSql.includes("left join auth.users"), true);
  assert.equal(observationMvpPreflightSql.includes("auth_user_count"), true);
});

test("AI observation frontend polling has timeout, fatal status stop, and no setInterval loop", () => {
  assert.equal(appJsx.includes("AI_OBSERVATION_STATUS_MAX_MS"), true);
  assert.equal(appJsx.includes("AI_OBSERVATION_STATUS_MAX_ERRORS"), true);
  assert.equal(appJsx.includes("isAiObservationFatalStatus"), true);
  assert.equal(appJsx.includes("window.setTimeout"), true);
  assert.equal(appJsx.includes("window.setInterval"), false);
  assert.equal(appJsx.includes("aiObservationPollingAccessTokenRef"), true);
  assert.equal(appJsx.includes("previousAccessToken && previousAccessToken !== nextAccessToken"), true);
  assert.equal(appJsx.includes("aiObservationPollingAccessTokenRef.current !== accessToken"), true);
  assert.equal(appJsx.includes("status === \"failed\""), true);
  assert.equal(appJsx.includes("status === \"succeeded\""), true);
  assert.equal(appJsx.includes("status === \"status_unknown\""), true);
});

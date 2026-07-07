import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const migrationSql = readFileSync("supabase/migrations/20260703_add_ai_observation_security_foundation.sql", "utf8");
const observationMvpMigrationSql = readFileSync("supabase/migrations/20260704_add_chia_observation_mvp.sql", "utf8");
const staleRecoveryMigrationSql = readFileSync("supabase/migrations/20260707_recover_stale_ai_observation_jobs.sql", "utf8");
const autoObservationExpansionMigrationSql = readFileSync("supabase/migrations/20260708_expand_chia_auto_observation.sql", "utf8");
const preflightSql = readFileSync("docs/ai-resident-security-preflight.sql", "utf8");
const observationMvpPreflightSql = readFileSync("docs/ai-observation-mvp-preflight.sql", "utf8");
const observationMvpVerificationSql = readFileSync("docs/ai-observation-mvp-verification.sql", "utf8");
const appJsx = readFileSync("src/App.jsx", "utf8");

function normalizedSql(sql) {
  return sql.replace(/\s+/g, " ");
}

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
    "app_private.ai_observation_current_request_fingerprint(v_job.post_id)",
    "v_current_request_fingerprint <> v_job.request_fingerprint",
    "v_current_request_fingerprint <> p_expected_request_fingerprint",
    "p_model <> 'gemini-3.5-flash'",
    "to service_role",
  ];

  for (const token of tokens) {
    assert.equal(observationMvpMigrationSql.includes(token), true, `MVP migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }
});

test("AI observation stale recovery RPC is service-role only and does not retry provider calls", () => {
  const tokens = [
    "public.recover_stale_ai_observation_jobs",
    "where j.status = 'processing'",
    "j.completed_at is null",
    "coalesce(j.started_at, j.updated_at, j.created_at) < p_stale_before",
    "for update skip locked",
    "set status = 'cancelled'",
    "public_error_code = p_public_error_code",
    "WORKER_STALE",
    "to service_role",
  ];

  for (const token of tokens) {
    assert.equal(staleRecoveryMigrationSql.includes(token), true, `stale recovery migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing stale recovery token ${token}`);
  }

  assert.equal(
    /revoke\s+all\s+on\s+function\s+public\.recover_stale_ai_observation_jobs\(timestamptz,\s*text,\s*integer\)\s+from\s+public,\s+anon,\s+authenticated/i.test(staleRecoveryMigrationSql),
    true,
  );
  assert.equal(
    /revoke\s+all\s+on\s+function\s+public\.recover_stale_ai_observation_jobs\(timestamptz,\s*text,\s*integer\)\s+from\s+public,\s+anon,\s+authenticated/i.test(schemaSql),
    true,
  );
  assert.equal(staleRecoveryMigrationSql.includes("start_ai_observation_attempt"), false);
  assert.equal(staleRecoveryMigrationSql.includes("runGemini"), false);
});

test("AI automatic observation expansion migration and schema.sql add delayed context fields", () => {
  const tokens = [
    "observation_context text not null default 'manual'",
    "not_before_at timestamptz not null default now()",
    "ai_observation_jobs_observation_context_check",
    "observation_context in ('manual', 'auto_text_post')",
    "ai_observation_jobs_due_queue_idx",
    "on public.ai_observation_jobs(status, not_before_at, created_at)",
    "where status = 'queued'",
  ];

  for (const token of tokens) {
    assert.equal(autoObservationExpansionMigrationSql.includes(token), true, `auto expansion migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }
});

test("AI automatic observation expansion RPC signatures are synced and service-role only", () => {
  const reserveSignature = "uuid, uuid, text, text, text, text, text, text, timestamptz, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer";
  const completeSignature = "uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer";
  const tokens = [
    "p_observation_context text",
    "p_not_before_at timestamptz",
    "p_auto_star_letter_daily_limit integer",
    "p_auto_star_letter_author_cooldown_seconds integer",
    "if v_job.status = 'queued' and v_job.not_before_at > now() then",
    "outcome := 'not_ready'",
    "pg_advisory_xact_lock(hashtext('ai_observation_star_letters:hoshizora_chia')::bigint)",
    "insert into public.resonances",
    "v_job.observation_context = 'auto_text_post'",
    "'silent'",
  ];

  for (const token of tokens) {
    assert.equal(autoObservationExpansionMigrationSql.includes(token), true, `auto expansion migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }

  for (const sql of [autoObservationExpansionMigrationSql, schemaSql]) {
    const compact = normalizedSql(sql);
    assert.equal(compact.includes(reserveSignature), true, "reserve RPC signature missing new context/not_before_at args");
    assert.equal(compact.includes(completeSignature), true, "complete RPC signature missing auto star-letter gate args");
    assert.equal(
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.reserve_ai_observation_job\\(\\s*${reserveSignature.replaceAll(" ", "\\s*").replaceAll(",", "\\s*,\\s*")}\\s*\\)\\s+from\\s+public,\\s+anon,\\s+authenticated`, "i").test(sql),
      true,
      "reserve RPC browser revoke missing",
    );
    assert.equal(
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.complete_ai_observation_job\\(\\s*${completeSignature.replaceAll(" ", "\\s*").replaceAll(",", "\\s*,\\s*")}\\s*\\)\\s+to\\s+service_role`, "i").test(sql),
      true,
      "complete RPC service_role grant missing",
    );
  }
});

test("AI observation MVP current fingerprint helper locks and hashes current post and media rows", () => {
  const tokens = [
    "app_private.ai_observation_current_request_fingerprint",
    "from public.posts p",
    "for update",
    "from public.post_media pm",
    "order by pm.sort_order, pm.id",
    "for share",
    '"aiResidentKey"',
    '"body"',
    '"media"',
    '"mediaRows"',
    '"postId"',
    '"postType"',
    '"updatedAt"',
    '"youtubeUrl"',
    '"youtubeVideoId"',
    '"durationSeconds"',
    '"mediaType"',
    '"mimeType"',
    '"sizeBytes"',
    '"sortOrder"',
    '"storagePath"',
    '"thumbnailStoragePath"',
    '"uploaderId"',
  ];

  for (const token of tokens) {
    assert.equal(observationMvpMigrationSql.includes(token), true, `MVP migration missing current fingerprint token: ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing current fingerprint token: ${token}`);
  }

  assert.equal(observationMvpMigrationSql.includes("v_current_request_fingerprint is null"), true);
  assert.equal(schemaSql.includes("v_current_request_fingerprint is null"), true);
});

test("AI observation MVP current fingerprint helper uses Supabase pgcrypto digest from extensions schema", () => {
  const expectedDigestCall = "extensions.digest(v_payload, 'sha256')";
  const forbiddenDigestCall = "public.digest(v_payload, 'sha256')";

  assert.equal(observationMvpMigrationSql.includes(expectedDigestCall), true, "MVP migration should call extensions.digest");
  assert.equal(schemaSql.includes(expectedDigestCall), true, "schema.sql should call extensions.digest");
  assert.equal(observationMvpMigrationSql.includes(forbiddenDigestCall), false, "MVP migration should not assume public.digest");
  assert.equal(schemaSql.includes(forbiddenDigestCall), false, "schema.sql should not assume public.digest");
  assert.equal(
    observationMvpVerificationSql.includes("pgcrypto_digest_extensions_schema"),
    true,
    "verification SQL should check digest in extensions schema",
  );
  assert.equal(
    observationMvpVerificationSql.includes("n.nspname = 'extensions'"),
    true,
    "verification SQL should look for extensions.digest",
  );
  assert.equal(
    observationMvpVerificationSql.includes("oidvectortypes(p.proargtypes) = 'text, text'"),
    true,
    "verification SQL should verify extensions.digest(text, text)",
  );
  assert.equal(
    observationMvpVerificationSql.includes("public.digest(v_payload"),
    true,
    "verification SQL should explicitly reject a public.digest assumption",
  );
});

test("AI observation MVP private fingerprint helpers are not executable by browser roles", () => {
  const helperNames = [
    "ai_observation_json_text",
    "ai_observation_json_timestamptz",
    "ai_observation_json_number",
    "ai_observation_current_request_fingerprint",
  ];

  for (const helperName of helperNames) {
    assert.equal(
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+app_private\\.${helperName}`, "i").test(observationMvpMigrationSql),
      true,
      `MVP migration missing browser-role revoke for app_private.${helperName}`,
    );
    assert.equal(
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+app_private\\.${helperName}`, "i").test(schemaSql),
      true,
      `schema.sql missing browser-role revoke for app_private.${helperName}`,
    );
  }
});

test("AI observation MVP JS and SQL fingerprint canonical fields stay aligned", () => {
  const jsTokens = [
    "aiResidentKey",
    "body",
    "mediaRows",
    "postId",
    "postType",
    "updatedAt",
    "youtubeUrl",
    "youtubeVideoId",
    "durationSeconds",
    "mediaType",
    "mimeType",
    "sizeBytes",
    "sortOrder",
    "storagePath",
    "thumbnailStoragePath",
    "uploaderId",
  ];
  const aiJobReservation = readFileSync("netlify/functions/_shared/aiJobReservation.mjs", "utf8");

  for (const token of jsTokens) {
    assert.equal(aiJobReservation.includes(token), true, `JS fingerprint missing ${token}`);
    assert.equal(observationMvpMigrationSql.includes(`"${token}"`) || observationMvpMigrationSql.includes(token), true, `SQL fingerprint missing ${token}`);
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

test("AI observation MVP verification SQL checks stale recovery RPC grants", () => {
  assert.equal(observationMvpVerificationSql.includes("recover_stale_ai_observation_jobs"), true);
  assert.equal(observationMvpVerificationSql.includes("stale_processing_candidates"), true);
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

test("production post cards do not expose manual AI observation controls", () => {
  const forbiddenUiTokens = [
    "ちあに観測してもらう",
    "ちあは観測したけど",
    "観測できませんでした",
    "観測を始められませんでした",
    "AI_OBSERVATION_STATUS_MAX_MS",
    "aiObservationPollingAccessTokenRef",
    "handleStartAiObservation",
    "/api/ai-observation-status",
  ];

  for (const token of forbiddenUiTokens) {
    assert.equal(appJsx.includes(token), false, `App.jsx still exposes manual AI observation UI token: ${token}`);
  }

  assert.equal(appJsx.includes("/api/ai-observation-auto-request"), true);
  assert.equal(appJsx.includes("requestAutomaticChiaObservation"), true);
});

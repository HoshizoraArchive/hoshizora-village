import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const migrationSql = readFileSync("supabase/migrations/20260703_add_ai_observation_security_foundation.sql", "utf8");
const observationMvpMigrationSql = readFileSync("supabase/migrations/20260704_add_chia_observation_mvp.sql", "utf8");
const staleRecoveryMigrationSql = readFileSync("supabase/migrations/20260707_recover_stale_ai_observation_jobs.sql", "utf8");
const autoObservationExpansionMigrationSql = readFileSync("supabase/migrations/20260708_expand_chia_auto_observation.sql", "utf8");
const pushSubscriptionsMigrationSql = readFileSync("supabase/migrations/20260708113000_add_push_subscriptions.sql", "utf8");
const pushNotificationJobsMigrationSql = readFileSync("supabase/migrations/20260708124500_add_push_notification_jobs.sql", "utf8");
const legalConsentsMigrationSql = readFileSync("supabase/migrations/20260710120000_add_legal_consents.sql", "utf8");
const starLetterConversationMigrationSql = readFileSync(
  "supabase/migrations/20260728210000_add_star_letter_conversation_foundation.sql",
  "utf8",
);
const chiaFirstPostWelcomeMigrationSql = readFileSync(
  "supabase/migrations/20260729093000_add_chia_first_post_welcomes.sql",
  "utf8",
);
const postsRealtimePublicationMigrationSql = readFileSync(
  "supabase/migrations/20260730155837_add_posts_to_realtime_publication.sql",
  "utf8",
);
const preflightSql = readFileSync("docs/ai-resident-security-preflight.sql", "utf8");
const observationMvpPreflightSql = readFileSync("docs/ai-observation-mvp-preflight.sql", "utf8");
const observationMvpVerificationSql = readFileSync("docs/ai-observation-mvp-verification.sql", "utf8");
const legalConsentVerificationSql = readFileSync("docs/legal-consent-verification.sql", "utf8");
const starLetterConversationVerificationSql = readFileSync("docs/star-letter-conversation-verification.sql", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const appJsx = readFileSync("src/App.jsx", "utf8");
const mainJsx = readFileSync("src/main.jsx", "utf8");
const pushNotificationSetupJs = readFileSync("src/pushNotificationSetup.js", "utf8");
const pushConfigFunction = readFileSync("netlify/functions/push-config.mjs", "utf8");
const pushRegisterFunction = readFileSync("netlify/functions/push-subscription-register.mjs", "utf8");
const pushStatusFunction = readFileSync("netlify/functions/push-subscription-status.mjs", "utf8");
const pushTestFunction = readFileSync("netlify/functions/push-subscription-test.mjs", "utf8");
const pushTransferFunction = readFileSync("netlify/functions/push-subscription-transfer.mjs", "utf8");
const pushDisableFunction = readFileSync("netlify/functions/push-subscription-disable.mjs", "utf8");
const pushSharedFunction = readFileSync("netlify/functions/_shared/pushNotifications.mjs", "utf8");
const pushDeliverySharedFunction = readFileSync("netlify/functions/_shared/pushDelivery.mjs", "utf8");
const pushSubscriptionTestSharedFunction = readFileSync("netlify/functions/_shared/pushSubscriptionTest.mjs", "utf8");
const pushSubscriptionTransferSharedFunction = readFileSync("netlify/functions/_shared/pushSubscriptionTransfer.mjs", "utf8");
const pushSubscriptionDisableSharedFunction = readFileSync("netlify/functions/_shared/pushSubscriptionDisable.mjs", "utf8");
const pushDispatchFunction = readFileSync("netlify/functions/push-notification-dispatch.mjs", "utf8");
const privacyPolicyMarkdown = readFileSync("src/legal/privacy-policy.md", "utf8");
const termsOfServiceMarkdown = readFileSync("src/legal/terms-of-service.md", "utf8");

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
  const oldReserveSignature = "uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer";
  const reserveSignature = "uuid, uuid, text, text, text, text, text, text, timestamptz, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer";
  const oldCompleteSignature = "uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint";
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
    const regexSignature = (signature) => signature.replaceAll(" ", "\\s*").replaceAll(",", "\\s*,\\s*");
    assert.equal(compact.includes(oldReserveSignature), true, "reserve RPC old compatibility signature missing");
    assert.equal(compact.includes(reserveSignature), true, "reserve RPC signature missing new context/not_before_at args");
    assert.equal(compact.includes(oldCompleteSignature), true, "complete RPC old compatibility signature missing");
    assert.equal(compact.includes(completeSignature), true, "complete RPC signature missing auto star-letter gate args");
    assert.equal(
      /from\s+public\.reserve_ai_observation_job\([^;]*'manual'[^;]*now\(\)[^;]*\)/i.test(compact),
      true,
      "reserve RPC old wrapper must delegate to manual/now defaults",
    );
    assert.equal(
      /from\s+public\.complete_ai_observation_job\([^;]*20\s*,\s*86400[^;]*\)/i.test(compact),
      true,
      "complete RPC old wrapper must delegate to daily/cooldown defaults",
    );

    for (const signature of [oldReserveSignature, reserveSignature]) {
      assert.equal(
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.reserve_ai_observation_job\\(\\s*${regexSignature(signature)}\\s*\\)\\s+from\\s+public,\\s+anon,\\s+authenticated`, "i").test(sql),
        true,
        `reserve RPC browser revoke missing for ${signature}`,
      );
      assert.equal(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.reserve_ai_observation_job\\(\\s*${regexSignature(signature)}\\s*\\)\\s+to\\s+service_role`, "i").test(sql),
        true,
        `reserve RPC service_role grant missing for ${signature}`,
      );
    }

    for (const signature of [oldCompleteSignature, completeSignature]) {
      assert.equal(
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.complete_ai_observation_job\\(\\s*${regexSignature(signature)}\\s*\\)\\s+from\\s+public,\\s+anon,\\s+authenticated`, "i").test(sql),
        true,
        `complete RPC browser revoke missing for ${signature}`,
      );
      assert.equal(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.complete_ai_observation_job\\(\\s*${regexSignature(signature)}\\s*\\)\\s+to\\s+service_role`, "i").test(sql),
        true,
        `complete RPC service_role grant missing for ${signature}`,
      );
    }
  }

  assert.equal(observationMvpVerificationSql.includes("rpc_backward_compatible_signatures"), true);
  assert.equal(observationMvpVerificationSql.includes("rpc_backward_compatible_execute_grants"), true);
  assert.equal(observationMvpVerificationSql.includes(oldReserveSignature), true);
  assert.equal(observationMvpVerificationSql.includes("timestamp with time zone"), true);
  assert.equal(observationMvpVerificationSql.includes(oldCompleteSignature), true);
});

test("AI automatic observation expansion keeps old Netlify RPC wrappers deploy-order safe", () => {
  const oldReserveSignature = "uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer";
  const oldCompleteSignature = "uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint";
  const compactMigration = normalizedSql(autoObservationExpansionMigrationSql);

  assert.equal(compactMigration.includes(`drop function if exists public.reserve_ai_observation_job( ${oldReserveSignature} )`), true);
  assert.equal(compactMigration.includes(`drop function if exists public.complete_ai_observation_job( ${oldCompleteSignature} )`), true);

  for (const sql of [autoObservationExpansionMigrationSql, schemaSql]) {
    const compact = normalizedSql(sql);
    assert.equal(
      /create\s+or\s+replace\s+function\s+public\.reserve_ai_observation_job\([^)]*p_min_seconds_between_requests\s+integer\s*\)\s+returns\s+table\s*\(\s*outcome\s+text,\s+job_id\s+uuid,\s+job_status\s+text\s*\)\s+language\s+sql/i.test(compact),
      true,
      "old reserve wrapper should keep the old three-column return shape",
    );
    assert.equal(
      /create\s+or\s+replace\s+function\s+public\.complete_ai_observation_job\([^)]*p_actual_cost_micro_usd\s+bigint\s*\)\s+returns\s+table\s*\(\s*outcome\s+text,\s+job_id\s+uuid,\s+job_status\s+text,\s+observation_id\s+uuid,\s+star_letter_id\s+uuid\s*\)\s+language\s+sql/i.test(compact),
      true,
      "old complete wrapper should keep the old completion return shape",
    );
  }
});

test("first-post welcome migration keeps the once-only record and completion path service-role only", () => {
  const newCompletionSignature = "uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer, text, boolean";
  const tokens = [
    "create table if not exists public.chia_first_post_welcomes",
    "author_id uuid primary key references public.profiles(id) on delete cascade",
    "first_post_id uuid references public.posts(id) on delete set null",
    "star_letter_id uuid references public.star_letters(id) on delete set null",
    "public.get_chia_first_post_welcome_candidate",
    "app_private.is_chia_first_public_post",
    "target.type in ('text', 'image', 'video', 'youtube')",
    "earlier.visibility = 'public'",
    "earlier.deleted_at is null",
    "public.reserve_chia_first_post_welcome_job",
    "p_observation_context <> 'first_post_welcome'",
    "set observation_context = 'first_post_welcome'",
    "observation_context in ('manual', 'auto_text_post', 'first_post_welcome')",
    "for share",
    "for update",
    "pg_advisory_xact_lock(hashtext('chia_first_post_welcome:' || v_post.author_id::text)::bigint)",
    "(earlier.created_at, earlier.id) < (target.created_at, target.id)",
    "insert into public.chia_first_post_welcomes (author_id, first_post_id, star_letter_id)",
    "p_first_post_fallback_star_letter_body text",
    "p_is_first_post_fallback boolean",
    "v_actual_cost_micro_usd := greatest(p_actual_cost_micro_usd, v_job.reserved_cost_micro_usd)",
    "v_job.attempt_count = 0",
    "p_public_error_code = 'FIRST_POST_NOT_ELIGIBLE'",
    "revoke all on table public.chia_first_post_welcomes from public, anon, authenticated",
  ];

  for (const token of tokens) {
    assert.equal(chiaFirstPostWelcomeMigrationSql.includes(token), true, `first-post migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }

  for (const sql of [chiaFirstPostWelcomeMigrationSql, schemaSql]) {
    const firstPostHelper = sql.match(
      /create or replace function app_private\.is_chia_first_public_post[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
    assert.equal(firstPostHelper.includes("earlier.visibility = 'public'"), true);
    assert.equal(firstPostHelper.includes("earlier.deleted_at is null"), true);
    assert.equal(firstPostHelper.includes("earlier.type"), false);
    assert.equal(
      (sql.match(/app_private\.is_chia_first_public_post\(v_post\.id\)/g) ?? []).length >= 2,
      true,
      "candidate and completion must share the same first-public-post helper",
    );
    assert.equal(
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.complete_ai_observation_job\\(\\s*${newCompletionSignature.replaceAll(" ", "\\s*").replaceAll(",", "\\s*,\\s*")}\\s*\\)\\s+from\\s+public,\\s+anon,\\s+authenticated`, "i").test(sql),
      true,
    );
    assert.equal(
      /grant\s+execute\s+on\s+function\s+public\.complete_ai_observation_job\([\s\S]*?text,\s*boolean\s*\)\s+to\s+service_role/i.test(sql),
      true,
    );
    assert.match(
      sql,
      /revoke all on function public\.reserve_chia_first_post_welcome_job\([\s\S]*?\) from public, anon, authenticated;/,
    );
    assert.match(
      sql,
      /grant execute on function public\.reserve_chia_first_post_welcome_job\([\s\S]*?\) to service_role;/,
    );
  }

  const migrationBody = chiaFirstPostWelcomeMigrationSql
    .replace(/^--[^\n]*\n--[^\n]*\n\nbegin;\n\n/, "begin;\n\n")
    .replace(/\ncommit;\s*$/i, "")
    .trim();
  const schemaBlock = schemaSql
    .split("-- 20260729093000_add_chia_first_post_welcomes.sql\n")[1]
    ?.split("-- 20260729120000_add_profile_titles.sql")[0]
    ?.trim();

  assert.equal(schemaBlock, migrationBody, "first-post migration and schema block must stay synchronized");
});

test("automatic completion creates one resonance independently from optional star letters", () => {
  for (const sql of [autoObservationExpansionMigrationSql, schemaSql]) {
    const compact = normalizedSql(sql);
    const alreadySucceededIndex = compact.indexOf("if v_job.status = 'succeeded' then");
    const resonanceIndex = compact.indexOf(
      "if v_job.observation_context = 'auto_text_post' then insert into public.resonances",
    );
    const starLetterIndex = compact.indexOf("if v_should_post then insert into public.star_letters");
    const completedIndex = compact.indexOf("outcome := 'completed'", resonanceIndex);

    assert.notEqual(alreadySucceededIndex, -1, "completion must short-circuit an already succeeded job");
    assert.notEqual(resonanceIndex, -1, "automatic completion must insert a resonance");
    assert.notEqual(starLetterIndex, -1, "completion must retain the optional star-letter branch");
    assert.notEqual(completedIndex, -1, "completion must finish the same transaction");
    assert.equal(alreadySucceededIndex < resonanceIndex, true, "redispatch must exit before inserting another resonance");
    assert.equal(resonanceIndex < starLetterIndex, true, "resonance must not depend on the star-letter branch");
    assert.equal(starLetterIndex < completedIndex, true, "resonance, optional star letter, and job success stay atomic");
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

test("AI observation MVP completion RPC pre-fingerprint overload is removed and fingerprint signature exists", () => {
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

  const authenticatedPrivateFunctions = [
    ...schemaSql.matchAll(
      /grant\s+execute\s+on\s+function\s+app_private\.([a-z0-9_]+)\([^;]*?\)\s+to\s+([^;]+);/gi,
    ),
  ]
    .filter(([, , grantees]) => grantees.split(",").some((role) => role.trim().toLowerCase() === "authenticated"))
    .map(([, functionName]) => functionName)
    .sort();

  assert.deepEqual(
    authenticatedPrivateFunctions,
    ["guide_section_is_public", "is_black_hole_between", "is_black_hole_protected"],
    "only RLS-only visibility and protection helpers may be executable by authenticated",
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
  assert.equal(
    appJsx.includes('["text", "image", "video", "youtube"].includes(postType)'),
    true,
  );
  assert.equal(appJsx.includes('postType !== "text"'), false);
});

test("R.Connect renders smartphone notification test card through React instead of DOM injection", () => {
  const requiredAppTokens = [
    "function PushNotificationTestCard({ onboarding, session })",
    "<PushNotificationTestCard onboarding={notifications.onboarding} session={notifications.session} />",
    "スマホ通知テスト",
    "この端末でR.Connect通知を表示できるか確認します。",
    "通知を許可",
    "テスト通知",
    "getPushNotificationPermissionLabel(permission)",
  ];

  for (const token of requiredAppTokens) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing React notification card token: ${token}`);
  }

  assert.equal(mainJsx.includes('import "./pushNotificationSetup.js";'), false);
  assert.equal(pushNotificationSetupJs.includes("MutationObserver"), false);
  assert.equal(pushNotificationSetupJs.includes("querySelector"), false);
  assert.equal(pushNotificationSetupJs.includes("createElement"), false);
  assert.equal(pushNotificationSetupJs.includes("insertAdjacentElement"), false);
  assert.equal(pushNotificationSetupJs.includes("navigator.serviceWorker.register(SERVICE_WORKER_PATH)"), true);
  assert.equal(pushNotificationSetupJs.includes("registration.showNotification"), false);
});

test("Push subscription registration stores subscriptions through service-role-only table access", () => {
  const tokens = [
    "create table if not exists public.push_subscriptions",
    "profile_id uuid not null references public.profiles(id) on delete cascade",
    "endpoint text not null",
    "p256dh text not null",
    "auth text not null",
    "constraint push_subscriptions_endpoint_key unique (endpoint)",
    "alter table public.push_subscriptions enable row level security",
    "revoke all on table public.push_subscriptions from public, anon, authenticated",
    "grant select, insert, update on table public.push_subscriptions to service_role",
  ];

  for (const token of tokens) {
    assert.equal(pushSubscriptionsMigrationSql.includes(token), true, `push subscription migration missing ${token}`);
  }

  assert.equal(pushSubscriptionsMigrationSql.includes("webpush"), false);
  assert.equal(pushSubscriptionsMigrationSql.includes("send_notification"), false);
});

test("Push subscription Functions expose config and authenticated registration only", () => {
  assert.equal(pushConfigFunction.includes('path: "/api/push-config"'), true);
  assert.equal(pushConfigFunction.includes("PUSH_VAPID_PUBLIC_KEY"), false);
  assert.equal(pushSharedFunction.includes('readEnv("PUSH_VAPID_PUBLIC_KEY")'), true);
  assert.equal(pushConfigFunction.includes("enabled: Boolean(publicKey)"), true);

  assert.equal(pushRegisterFunction.includes('path: "/api/push-subscription-register"'), true);
  assert.equal(pushRegisterFunction.includes("requireAuthenticatedUser({ request, supabase })"), true);
  assert.equal(pushRegisterFunction.includes('.from("push_subscriptions")'), true);
  assert.equal(pushRegisterFunction.includes("profile_id: user.id"), true);
  assert.equal(pushRegisterFunction.includes("existingSubscription.profile_id !== user.id"), true);
  assert.equal(pushRegisterFunction.includes("PUSH_SUBSCRIPTION_ACCOUNT_MISMATCH"), true);
  assert.equal(pushSharedFunction.includes("validateEndpoint(subscription.endpoint)"), true);
  assert.equal(pushSharedFunction.includes('trimmed.startsWith("https://")'), true);
});

test("R.Connect notification card registers this device without client-side Push delivery", () => {
  const requiredAppTokens = [
    "subscribeToPushNotifications",
    "端末登録: 未登録",
    "端末登録: 登録済み",
    "端末登録: 別のアカウントに登録済み",
    "端末登録: 登録に失敗しました",
    "端末登録: VAPID key未設定",
    "この端末を登録",
    "<PushNotificationTestCard onboarding={notifications.onboarding} session={notifications.session} />",
  ];
  const requiredSetupTokens = [
    "fetchPushNotificationConfig",
    "subscribeToPushNotifications({ accessToken })",
    "urlBase64ToUint8Array(publicKey)",
    "registration.pushManager.subscribe",
    "navigator.serviceWorker.ready",
    "getPushSubscriptionRegistrationStatus",
    "PUSH_SUBSCRIPTION_STATUS_ENDPOINT",
    "PUSH_SUBSCRIPTION_TEST_ENDPOINT",
    "PUSH_SUBSCRIPTION_TRANSFER_ENDPOINT",
    "PUSH_SUBSCRIPTION_DISABLE_ENDPOINT",
    "endpoint: PUSH_SUBSCRIPTION_REGISTER_ENDPOINT",
    "Authorization: `Bearer ${accessToken}`",
  ];

  for (const token of requiredAppTokens) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing Push subscription UI token: ${token}`);
  }

  for (const token of requiredSetupTokens) {
    assert.equal(pushNotificationSetupJs.includes(token), true, `pushNotificationSetup.js missing ${token}`);
  }

  assert.equal(pushNotificationSetupJs.includes("webpush"), false);
  assert.equal(pushRegisterFunction.includes("showNotification"), false);
});

test("R.Connect reconciles an existing Push subscription with the authenticated server record", () => {
  const appTokens = [
    'checking: "端末登録: 確認中"',
    "getPushSubscriptionRegistrationStatus({",
    "registrationStatus.hasSubscription",
    "通知端末を再登録してください",
    "subscriptionStatus === \"checking\"",
  ];
  const statusTokens = [
    'path: "/api/push-subscription-status"',
    "requireAuthenticatedUser({ request, supabase })",
    '.from("push_subscriptions")',
    '.select("profile_id, p256dh, auth, disabled_at")',
    "status: isRegistered ? \"registered\" : isAccountMismatch ? \"account_mismatch\" : \"unregistered\"",
    "canTransfer: isAccountMismatch",
  ];

  for (const token of appTokens) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing Push reconciliation token: ${token}`);
  }

  for (const token of statusTokens) {
    assert.equal(pushStatusFunction.includes(token), true, `Push status Function missing token: ${token}`);
  }
});

test("new Push devices use the ready Service Worker registration for subscription creation", () => {
  const requiredTokens = [
    "const registration = await getReadyPushNotificationServiceWorker();",
    "const existingSubscription = await registration.pushManager.getSubscription();",
    "await registration.pushManager.subscribe({",
  ];

  for (const token of requiredTokens) {
    assert.equal(pushNotificationSetupJs.includes(token), true, `pushNotificationSetup.js missing new-device subscription token: ${token}`);
  }
});

test("Push subscription re-registration disables only the matching current-account record before replacing the browser subscription", () => {
  const appTokens = [
    "reRegisterPushNotifications",
    "通知端末を再登録",
    "PUSH_REREGISTER_DISABLE_FAILED",
    "PUSH_SUBSCRIPTION_NOT_OWNED",
    "PUSH_CONFIGURATION_ERROR",
    "INVALID_TOKEN",
    "PUSH_REREGISTER_UNSUBSCRIBE_FAILED",
  ];
  const setupTokens = [
    "PUSH_SUBSCRIPTION_DISABLE_ENDPOINT",
    "existingSubscription.unsubscribe()",
    "push-subscription-reregister-disable",
    "code.startsWith(errorPrefix)",
    "PUSH_REREGISTER_SUBSCRIBE_FAILED",
    "PUSH_REREGISTER_STATUS_FAILED",
    "push-subscription-reregister-required",
  ];
  const disableTokens = [
    'path: "/api/push-subscription-disable"',
    "requireAuthenticatedUser({ request, supabase })",
    "disablePushSubscription({",
    ".eq(\"profile_id\", profileId)",
    ".eq(\"endpoint\", subscription.endpoint)",
    ".eq(\"p256dh\", subscription.p256dh)",
    ".eq(\"auth\", subscription.auth)",
    "disabled_at: now",
    "disabledRecords",
    "existingEndpointRecords",
    ".limit(1)",
    "PUSH_SUBSCRIPTION_NOT_OWNED",
  ];

  for (const token of appTokens) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing re-registration token: ${token}`);
  }

  for (const token of setupTokens) {
    assert.equal(pushNotificationSetupJs.includes(token), true, `pushNotificationSetup.js missing re-registration token: ${token}`);
  }

  for (const token of disableTokens) {
    assert.equal(
      pushDisableFunction.includes(token) || pushSubscriptionDisableSharedFunction.includes(token),
      true,
      `Push disable Function missing ${token}`,
    );
  }

  assert.equal(pushSubscriptionDisableSharedFunction.includes("profile_id:"), false);
  assert.equal(pushSubscriptionDisableSharedFunction.includes(".neq(\"profile_id\""), false);
  assert.equal(pushSubscriptionDisableSharedFunction.includes(".maybeSingle()"), false);
  assert.equal(pushDisableFunction.includes("push_subscription_disable_failed"), true);
  assert.equal(pushDisableFunction.includes("safeLogStage"), true);
  assert.equal(pushDisableFunction.includes("databaseCode"), true);
  assert.equal(pushSubscriptionDisableSharedFunction.includes("safeLogDatabaseCode"), true);
});

test("Push account switching and server test delivery require the current endpoint and Push keys", () => {
  const appTokens = [
    "この端末は別のアカウントに通知登録されています",
    "この端末の通知先を現在のアカウントへ切り替える",
    "transferPushSubscriptionToCurrentAccount",
    "sendPushNotificationTest({ accessToken: session?.access_token })",
  ];
  const transferTokens = [
    'path: "/api/push-subscription-transfer"',
    "transferPushSubscription({",
    ".eq(\"endpoint\", subscription.endpoint)",
    ".eq(\"p256dh\", subscription.p256dh)",
    ".eq(\"auth\", subscription.auth)",
    ".neq(\"profile_id\", profileId)",
  ];
  const testTokens = [
    'path: "/api/push-subscription-test"',
    "sendPushSubscriptionTest({",
    "readPushDeliveryConfig",
    "configureWebPush",
    '.eq("profile_id", profileId)',
    '.eq("endpoint", subscription.endpoint)',
    '.eq("p256dh", subscription.p256dh)',
    '.eq("auth", subscription.auth)',
    "おはちあ！ 星空Villageの通知が届いたよ💕",
  ];

  for (const token of appTokens) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing account-switch or server-test token: ${token}`);
  }

  for (const token of transferTokens) {
    assert.equal(pushTransferFunction.includes(token) || pushSubscriptionTransferSharedFunction.includes(token), true, `Push transfer missing token: ${token}`);
  }

  for (const token of testTokens) {
    assert.equal(pushTestFunction.includes(token) || pushSubscriptionTestSharedFunction.includes(token), true, `Push test missing token: ${token}`);
  }

  assert.equal(pushTestFunction.includes("PUSH_VAPID_PRIVATE_KEY"), false);
  assert.equal(pushSubscriptionTestSharedFunction.includes("push_notification_jobs"), false);
});

test("Push test delivery validates VAPID pairs and returns only safe delivery error codes", () => {
  const deliveryTokens = [
    'createECDH("prime256v1")',
    "timingSafeEqual",
    "PUSH_VAPID_KEY_MISMATCH",
    "PUSH_AUTH_FAILED",
    "PUSH_SEND_TEMPORARY_FAILURE",
    "PUSH_SEND_FAILED",
    "deployContext",
    "pushService",
  ];
  const testTokens = [
    "getPushErrorCode",
    "logPushDeliveryFailure",
    "PUSH_AUTH_FAILED",
    "PUSH_SEND_TEMPORARY_FAILURE",
  ];

  for (const token of deliveryTokens) {
    assert.equal(pushDeliverySharedFunction.includes(token), true, `Push delivery helper missing ${token}`);
  }

  for (const token of testTokens) {
    assert.equal(pushSubscriptionTestSharedFunction.includes(token), true, `Push test helper missing ${token}`);
  }

  assert.equal(pushSubscriptionTestSharedFunction.includes("console.warn"), false);
});

test("R.Connect Push delivery migration queues notifications and keeps jobs server-managed", () => {
  const tokens = [
    "create table if not exists public.push_notification_jobs",
    "notification_id uuid not null references public.notifications(id) on delete cascade",
    "recipient_id uuid not null references public.profiles(id) on delete cascade",
    "constraint push_notification_jobs_notification_id_key unique (notification_id)",
    "status in ('queued', 'processing', 'succeeded', 'failed', 'skipped')",
    "alter table public.push_notification_jobs enable row level security",
    "revoke all on table public.push_notification_jobs from public, anon, authenticated",
    "grant select, insert, update on table public.push_notification_jobs to service_role",
    "app_private.enqueue_push_notification_job",
    "after insert on public.notifications",
    "public.claim_push_notification_jobs",
    "j.status = 'queued'",
    "j.next_attempt_at <= now()",
    "j.status = 'processing'",
    "j.updated_at < now() - interval '15 minutes'",
    "and j.attempt_count < j.max_attempts",
    "for update skip locked",
    "revoke all on function public.claim_push_notification_jobs(integer) from public, anon, authenticated",
    "grant execute on function public.claim_push_notification_jobs(integer) to service_role",
  ];

  for (const token of tokens) {
    assert.equal(pushNotificationJobsMigrationSql.includes(token), true, `push delivery migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing push delivery token ${token}`);
  }

  assert.equal(pushNotificationJobsMigrationSql.includes("hoshizora_chia"), false);
  assert.equal(pushNotificationJobsMigrationSql.includes("ai_observation"), false);
});

test("R.Connect Push delivery Function sends all notification types without exposing secrets", () => {
  assert.equal(packageJson.includes('"web-push"'), true);
  assert.equal(pushDispatchFunction.includes('import webPush from "web-push"'), true);
  assert.equal(pushDispatchFunction.includes('schedule: "*/1 * * * *"'), true);
  assert.equal(pushDispatchFunction.includes("claim_push_notification_jobs"), true);
  assert.equal(pushDispatchFunction.includes('.from("notifications")'), true);
  assert.equal(pushDispatchFunction.includes('.from("push_subscriptions")'), true);
  assert.equal(pushDispatchFunction.includes("sendNotification"), true);
  assert.equal(pushDispatchFunction.includes("disabled_at"), true);
  assert.equal(pushDispatchFunction.includes("PUSH_VAPID_PRIVATE_KEY"), false);
  assert.equal(pushDispatchFunction.includes("logPushDeliveryFailure"), true);

  for (const token of ["resonance", "archive", "star_letter", "star_letter_reply", "star_letter_resonance"]) {
    assert.equal(pushDeliverySharedFunction.includes(token), true, `push delivery fallback missing ${token}`);
  }

  assert.equal(pushDeliverySharedFunction.includes('readEnv("PUSH_VAPID_PRIVATE_KEY")'), true);
  assert.equal(pushDeliverySharedFunction.includes("PUSH_DEFAULT_SUBJECT"), true);
  assert.equal(pushDeliverySharedFunction.includes("PUSH_SUBSCRIPTION_GONE"), true);
  assert.equal(pushDeliverySharedFunction.includes("status === 404 || status === 410"), true);
  assert.equal(pushDispatchFunction.includes("ai-observation"), false);
  assert.equal(pushDispatchFunction.includes("hoshizora_chia"), false);
});

test("star-letter conversation migration and schema keep the normalized foundation in sync", () => {
  const tokens = [
    "parent_star_letter_id uuid",
    "client_request_id uuid",
    "deleted_at timestamptz",
    "create table if not exists public.star_letter_resonances",
    "create table if not exists public.star_letter_archives",
    "constraint star_letter_archives_profile_letter_key unique (profile_id, star_letter_id)",
    "star_letter_id uuid references public.star_letters(id) on delete set null",
    "public.get_star_letter_thread",
    "public.create_star_letter_reply",
    "public.update_star_letter",
    "public.delete_star_letter",
    "public.add_star_letter_resonance",
    "public.set_star_letter_archive",
    "set search_path = ''",
  ];

  for (const token of tokens) {
    assert.equal(starLetterConversationMigrationSql.includes(token), true, `star-letter migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing star-letter token ${token}`);
  }

  assert.match(starLetterConversationMigrationSql, /^begin;\s*/i);
  assert.match(starLetterConversationMigrationSql, /\scommit;\s*$/i);

  const migrationBody = starLetterConversationMigrationSql
    .replace(/^begin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const schemaBlock = schemaSql
    .split("-- Issue #108: star-letter conversation foundation.")[1]
    ?.split("-- 20260729093000_add_chia_first_post_welcomes.sql")[0]
    ?.replace(/\s+/g, " ")
    .trim();

  assert.equal(schemaBlock, migrationBody, "migration and schema.sql star-letter foundation blocks differ");
});

test("star-letter foreign keys have leading-column indexes and RLS auth calls use init plans", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);
  const policyAuthCallCounts = new Map([
    ["star_letters_select_visible", 1],
    ["star_letters_insert_logged_in", 3],
    ["star_letters_update_own", 4],
    ["star_letters_delete_own", 2],
    ["star_letter_archives_select_own", 1],
  ]);

  assert.match(
    sql,
    /create index if not exists notifications_star_letter_id_idx on public\.notifications\(star_letter_id\)/i,
  );
  assert.match(
    sql,
    /create index if not exists star_letter_archives_letter_post_idx on public\.star_letter_archives\(star_letter_id, post_id\)/i,
  );

  for (const [policyName, expectedCallCount] of policyAuthCallCounts) {
    const policyDefinition = sql.match(
      new RegExp(`create policy ${policyName}[\\s\\S]*?(?=drop policy|commit;)`, "i"),
    )?.[0];

    assert.ok(policyDefinition, `policy definition missing for ${policyName}`);
    assert.equal(
      policyDefinition.match(/\(select auth\.uid\(\)\)/gi)?.length ?? 0,
      expectedCallCount,
      `unexpected optimized auth.uid() count for ${policyName}`,
    );
    assert.doesNotMatch(
      policyDefinition.replaceAll("(select auth.uid())", ""),
      /auth\.uid\(\)/i,
      `direct per-row auth.uid() remains in ${policyName}`,
    );
  }
});

test("star-letter resonance tables remain RPC-only and RPC grants stay explicit", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);
  const mutationSignatures = [
    "create_star_letter_reply(uuid, text, uuid)",
    "update_star_letter(uuid, text)",
    "delete_star_letter(uuid)",
    "add_star_letter_resonance(uuid, uuid, text)",
    "set_star_letter_archive(uuid, boolean)",
  ];

  assert.match(sql, /alter table public\.star_letter_resonances enable row level security/i);
  assert.match(
    sql,
    /revoke all on table public\.star_letter_resonances from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant (?:all|select|insert|update|delete)[\s\S]*?on table public\.star_letter_resonances to (?:public|anon|authenticated)/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy [^;]+ on public\.star_letter_resonances/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.get_star_letter_thread\(uuid\) from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_star_letter_thread\(uuid\) to anon, authenticated/i,
  );

  for (const signature of mutationSignatures) {
    assert.equal(
      sql.includes(`revoke all on function public.${signature} from public, anon, authenticated`),
      true,
      `browser revoke missing for ${signature}`,
    );
    assert.equal(
      sql.includes(`grant execute on function public.${signature} to authenticated`),
      true,
      `authenticated grant missing for ${signature}`,
    );
  }
});

test("star-letter relationships reject cross-post parents and cycles without cascading replies", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);

  assert.match(sql, /v_parent_post_id is null or v_parent_post_id <> new\.post_id/i);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*hashtext\(new\.post_id::text\)/i);
  assert.match(sql, /where sl\.id = new\.parent_star_letter_id[\s\S]*sl\.deleted_at is null[\s\S]*for key share/i);
  assert.match(sql, /with recursive ancestors as/i);
  assert.match(sql, /id = new\.id or cycle/i);
  assert.match(sql, /parent_star_letter_id[\s\S]*references public\.star_letters\(id\)[\s\S]*on delete set null/i);
  assert.match(sql, /where child\.parent_star_letter_id = old\.id/i);
  assert.match(sql, /body = '削除された星文です。'/i);
  assert.match(sql, /if auth\.uid\(\) is null then return old/i);
  assert.match(sql, /where sl\.id = p_parent_star_letter_id[\s\S]*sl\.deleted_at is null[\s\S]*for share/i);
  assert.equal(sql.includes("parent_star_letter_id uuid not null"), false);
});

test("star-letter mutation RPCs authenticate ownership and visible post access", () => {
  const mutationSignatures = [
    "create_star_letter_reply(uuid, text, uuid)",
    "update_star_letter(uuid, text)",
    "delete_star_letter(uuid)",
    "add_star_letter_resonance(uuid, uuid, text)",
    "set_star_letter_archive(uuid, boolean)",
  ];
  const sql = normalizedSql(starLetterConversationMigrationSql);

  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(sql, /app_private\.lock_accessible_post\(v_parent\.post_id, v_user_id\)/i);
  assert.match(
    sql,
    /create or replace function app_private\.lock_accessible_post[\s\S]*for share[\s\S]*revoke all on function app_private\.lock_accessible_post\(uuid, uuid\) from public, anon, authenticated/i,
  );
  assert.match(sql, /app_private\.lock_accessible_post\(sl\.post_id, v_user_id\)/i);
  assert.match(sql, /app_private\.lock_accessible_post\(v_post_id, v_user_id\)/i);
  assert.match(sql, /v_letter\.author_id <> v_user_id/i);
  assert.match(sql, /sl\.author_id = v_user_id[\s\S]*sl\.deleted_at is null/i);
  assert.match(
    sql,
    /revoke select, insert, update, delete on table public\.star_letters from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant select \( id, post_id, author_id, parent_star_letter_id, body, created_at, updated_at, edited_at, deleted_at \) on table public\.star_letters to anon, authenticated/i,
  );
  assert.match(sql, /grant insert \(post_id, author_id, body\) on table public\.star_letters to authenticated/i);
  assert.match(sql, /grant update \(body\) on table public\.star_letters to authenticated/i);
  assert.match(sql, /grant delete on table public\.star_letters to authenticated/i);
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.star_letters to service_role/i,
  );
  assert.match(sql, /alter table public\.star_letters enable row level security/i);
  assert.doesNotMatch(sql, /grant select on table public\.star_letter_resonances to anon, authenticated/i);
  assert.doesNotMatch(sql, /create policy star_letter_resonances_select_visible/i);

  for (const signature of mutationSignatures) {
    assert.equal(
      sql.includes(`revoke all on function public.${signature} from public, anon, authenticated`),
      true,
      `browser revoke missing for ${signature}`,
    );
    assert.equal(
      sql.includes(`grant execute on function public.${signature} to authenticated`),
      true,
      `authenticated grant missing for ${signature}`,
    );
  }
});

test("legacy root composer remains compatible while conversation mutations use their RPCs", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);
  const app = normalizedSql(appJsx);

  assert.match(
    app,
    /const star_letter_select_columns = "id, post_id, author_id, parent_star_letter_id, body, created_at, updated_at, edited_at, deleted_at"/i,
  );
  assert.doesNotMatch(
    app,
    /const star_letter_select_columns = "[^"]*client_request_id/i,
  );
  assert.match(
    app,
    /\.from\("star_letters"\) \.insert\(\{ post_id: postid, author_id: session\.user\.id, body, \}\) \.select\(columns\)/i,
  );
  for (const token of [
    "updateStarLetter(supabase",
    "deleteStarLetter(supabase",
    "createStarLetterReply(supabase",
    "addStarLetterResonance(supabase",
    "setStarLetterArchived(supabase",
  ]) {
    assert.equal(app.includes(token), true, `conversation UI must use ${token}`);
  }
  assert.match(sql, /grant insert \(post_id, author_id, body\) on table public\.star_letters to authenticated/i);
  assert.match(sql, /grant update \(body\) on table public\.star_letters to authenticated/i);
});

test("star-letter repeated resonance is idempotent per action and notification is de-duplicated", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);

  assert.match(sql, /unique \(profile_id, client_request_id\)/i);
  assert.match(sql, /on conflict \(profile_id, client_request_id\) do nothing/i);
  assert.match(
    sql,
    /v_existing_star_letter_id <> p_star_letter_id[\s\S]*v_existing_resonance_type <> p_resonance_type[\s\S]*'request_conflict'/i,
  );
  assert.match(sql, /count\(\*\) filter \(where profile_id = v_user_id\)/i);
  assert.match(sql, /notifications_star_letter_resonance_once_idx/i);
  assert.match(sql, /on conflict \(recipient_id, actor_id, star_letter_id\)[\s\S]*do nothing/i);
  assert.match(sql, /v_recipient_id = new\.profile_id/i);
});

test("star-letter resonance request ids cannot be replayed against another target or type", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);

  assert.match(sql, /constraint star_letter_resonances_request_key unique \(profile_id, client_request_id\)/i);
  assert.match(sql, /where slr\.profile_id = v_user_id and slr\.client_request_id = p_client_request_id/i);
  assert.match(sql, /v_existing_star_letter_id <> p_star_letter_id/i);
  assert.match(sql, /v_existing_resonance_type <> p_resonance_type/i);
  assert.match(sql, /select 'request_conflict'::text, null::uuid, 0::bigint, 0::bigint/i);
});

test("star-letter Archive is per-user, idempotent, and creates no Archive notification", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);
  const archiveFunction = sql.split("create or replace function public.set_star_letter_archive")[1]
    ?.split("revoke all on function public.set_star_letter_archive")[0] ?? "";

  assert.match(sql, /unique \(profile_id, star_letter_id\)/i);
  assert.match(
    sql,
    /foreign key \(star_letter_id, post_id\) references public\.star_letters\(id, post_id\) on delete cascade/i,
  );
  assert.match(archiveFunction, /on conflict \(profile_id, star_letter_id\) do update/i);
  assert.match(archiveFunction, /delete from public\.star_letter_archives/i);
  assert.equal(archiveFunction.includes("public.notifications"), false);
});

test("star-letter notification constraint replacement targets only the known type constraint", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);

  assert.match(sql, /drop constraint if exists notifications_type_check/i);
  assert.doesNotMatch(sql, /pg_get_constraintdef\(c\.oid\)[\s\S]*like '%resonance%'/i);
  assert.match(
    sql,
    /add constraint notifications_type_check check \(type in \(\s*'resonance', 'archive', 'star_letter', 'star_letter_reply', 'star_letter_resonance'\s*\)\)/i,
  );
});

test("star-letter notification types use the existing R.Connect and Push queue", () => {
  const sql = normalizedSql(starLetterConversationMigrationSql);

  assert.match(sql, /'star_letter_reply'/i);
  assert.match(sql, /'star_letter_resonance'/i);
  assert.match(sql, /v_recipient_id = new\.author_id/i);
  assert.match(sql, /v_recipient_id = new\.profile_id/i);
  assert.equal(sql.includes("insert into public.push_notification_jobs"), false);
  assert.equal(schemaSql.includes("after insert on public.notifications"), true);
});

test("star-letter verification SQL covers permissions and live-data invariants", () => {
  for (const token of [
    "04_rpc_security",
    "05_mutation_rpc_browser_grants",
    "07_rls_enabled",
    "08_cross_post_replies",
    "09_reply_cycles",
    "10_archive_post_mismatch",
    "11_duplicate_star_letter_archives",
    "12_self_star_letter_notifications",
    "13_duplicate_star_letter_resonance_notifications",
    "16_archive_letter_post_foreign_key",
    "17_browser_table_level_write_grants",
    "18_authenticated_star_letter_insert_columns",
    "19_forbidden_star_letter_insert_columns",
    "20_relationship_concurrency_guard",
    "21_private_helper_execute_grants",
    "22_authenticated_star_letter_select_columns",
    "23_private_star_letter_columns",
    "24_service_role_table_grants",
    "25_notification_trigger_chain",
    "26_notification_type_constraint",
    "27_notification_star_letter_post_mismatch",
    "28_mutation_post_lock",
    "29_authenticated_star_letter_update_columns",
    "30_resonance_request_key",
    "31_duplicate_resonance_request_ids",
    "32_star_letter_delete_grants",
  ]) {
    assert.equal(starLetterConversationVerificationSql.includes(token), true, `verification SQL missing ${token}`);
  }

  assert.doesNotMatch(starLetterConversationVerificationSql, /\b(insert|update|delete|truncate)\b\s+(into|from|public\.)/i);
});

test("Legal documents are stored as exact public markdown routes", () => {
  assert.equal(privacyPolicyMarkdown.startsWith("# 星空Village プライバシーポリシー"), true);
  assert.equal(privacyPolicyMarkdown.includes("制定日：2026年7月10日"), true);
  assert.equal(privacyPolicyMarkdown.includes("Google Gemini APIの無償提供枠"), true);
  assert.equal(privacyPolicyMarkdown.trimEnd().endsWith("以上"), true);

  assert.equal(termsOfServiceMarkdown.startsWith("# 星空Village 利用規約"), true);
  assert.equal(termsOfServiceMarkdown.includes("ユーザーは、本サービスへの登録時に、本規約および別途定めるプライバシーポリシーを確認し、同意したうえで本サービスを利用するものとします。"), true);
  assert.equal(termsOfServiceMarkdown.includes("18歳未満の方は、本サービスを利用できません。"), true);
  assert.equal(termsOfServiceMarkdown.trimEnd().endsWith("以上"), true);

  for (const token of [
    'import privacyPolicyMarkdown from "./legal/privacy-policy.md?raw"',
    'import termsOfServiceMarkdown from "./legal/terms-of-service.md?raw"',
    'window.location.pathname.match(/^\\/(privacy|terms)\\/?$/)',
    "LegalDocumentScreen",
    "MarkdownDocument",
    'href="/privacy"',
    'href="/terms"',
  ]) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing legal route token: ${token}`);
  }
});

test("Signup requires legal consent and age confirmation before registration", () => {
  const tokens = [
    "LEGAL_TERMS_VERSION = \"2026-07-10\"",
    "LEGAL_PRIVACY_VERSION = \"2026-07-10\"",
    "acceptedLegal",
    "confirmedAge",
    "会員登録には、利用規約・プライバシーポリシーへの同意と18歳以上であることの確認が必要です。",
    "利用規約",
    "プライバシーポリシー",
    "私は18歳以上であることを確認します",
    "legal_age_confirmed: true",
    "legal_privacy_version: LEGAL_PRIVACY_VERSION",
    "legal_terms_version: LEGAL_TERMS_VERSION",
    "supabase.rpc(\"record_legal_consent\"",
    "recordLegalConsentForSession(data.session)",
    "LEGAL_CONSENT_REQUIRED_AFTER_MS",
    "legal_consent_metadata_missing",
  ];

  for (const token of tokens) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing signup consent token: ${token}`);
  }

  assert.equal(appJsx.includes('.from("legal_consents").insert'), false);
  assert.equal(appJsx.includes("localStorage"), false);
});

test("Signup legal links use an in-place modal without replacing AuthPanel state", () => {
  const signUpConsentStart = appJsx.indexOf("{isSignUp && (");
  const signUpSubmitStart = appJsx.indexOf('className="min-h-10 w-full rounded-2xl bg-gradient-to-r', signUpConsentStart);
  const signUpConsentBlock = appJsx.slice(signUpConsentStart, signUpSubmitStart);
  const legalModalStart = appJsx.indexOf("function LegalDocumentModal");
  const legalModalEnd = appJsx.indexOf("function LinkedText", legalModalStart);
  const legalModalSource = appJsx.slice(legalModalStart, legalModalEnd);

  for (const token of [
    "const [legalDocument, setLegalDocument] = useState(null)",
    "function openLegalDocument(documentType, event)",
    "setLegalDocument(documentType)",
    "<LegalDocumentModal",
    "document.body.style.overflow = \"hidden\"",
    "legalLinkReturnFocusRef.current?.focus()",
    "aria-modal=\"true\"",
    "role=\"dialog\"",
    "<MarkdownDocument markdown={document.markdown} />",
    "確認して会員登録に戻る",
    "onClick={onClose}",
    "min-h-0 overflow-y-auto",
  ]) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing signup legal modal token: ${token}`);
  }

  assert.equal(signUpConsentBlock.includes('href="/terms"'), false);
  assert.equal(signUpConsentBlock.includes('href="/privacy"'), false);
  assert.equal(signUpConsentBlock.includes('openLegalDocument("terms", event)'), true);
  assert.equal(signUpConsentBlock.includes('openLegalDocument("privacy", event)'), true);
  assert.equal(
    legalModalSource.indexOf("確認して会員登録に戻る") > legalModalSource.indexOf("<MarkdownDocument markdown={document.markdown} />"),
    true,
  );
});

test("Legal and contact links distinguish official X from email", () => {
  const legalContactStart = appJsx.indexOf("法務・お問い合わせ");
  const legalContactEnd = appJsx.indexOf("ログイン状態", legalContactStart);
  const legalContactSource = appJsx.slice(legalContactStart, legalContactEnd);
  const authPanelStart = appJsx.indexOf("function AuthPanel");
  const authPanelEnd = appJsx.indexOf("function LegalDocumentModal", authPanelStart);
  const authPanelSource = appJsx.slice(authPanelStart, authPanelEnd);

  for (const token of [
    'const OFFICIAL_X_URL = "https://x.com/hoshizorarchive"',
    "星空Village公式X",
    "メールでお問い合わせ",
    'href="mailto:akaibuhoshizora@gmail.com"',
    'target="_blank"',
    'rel="noopener noreferrer"',
  ]) {
    assert.equal(appJsx.includes(token), true, `App.jsx missing contact link token: ${token}`);
  }

  assert.equal(legalContactSource.includes(">お問い合わせ</a>"), false);
  assert.equal(authPanelSource.includes(">公式X</a>"), true);
  assert.equal(authPanelSource.includes(">メール</a>"), true);
});

test("Legal consent migration and schema keep consent records owner-scoped", () => {
  const tokens = [
    "create table if not exists public.legal_consents",
    "user_id uuid not null references auth.users(id) on delete cascade",
    "terms_version text not null",
    "privacy_version text not null",
    "accepted_at timestamptz not null default now()",
    "age_confirmed_at timestamptz not null",
    "constraint legal_consents_user_versions_key unique (user_id, terms_version, privacy_version)",
    "alter table public.legal_consents enable row level security",
    "revoke all on table public.legal_consents from public, anon, authenticated",
    "grant select on table public.legal_consents to authenticated",
    "grant select, insert on table public.legal_consents to service_role",
    "create policy legal_consents_select_own on public.legal_consents",
    "using (user_id = (select auth.uid()))",
    "public.record_legal_consent",
    "security definer",
    "v_user_id uuid := auth.uid()",
    "p_terms_version is distinct from '2026-07-10'",
    "p_privacy_version is distinct from '2026-07-10'",
    "p_age_confirmed is distinct from true",
    "return jsonb_build_object('outcome', 'invalid_consent')",
    "app_private.record_legal_consent_from_auth_user",
    "new.raw_user_meta_data ->> 'legal_terms_version'",
    "new.raw_user_meta_data ->> 'legal_privacy_version'",
    "new.raw_user_meta_data ->> 'legal_age_confirmed'",
    "v_terms_version is distinct from '2026-07-10'",
    "v_privacy_version is distinct from '2026-07-10'",
    "v_age_confirmed is distinct from true",
    "raise exception 'LEGAL_CONSENT_REQUIRED'",
    "create trigger auth_users_record_legal_consent",
    "after insert on auth.users",
    "revoke all on function public.record_legal_consent(text, text, boolean) from public, anon, authenticated",
    "grant execute on function public.record_legal_consent(text, text, boolean) to authenticated",
  ];

  for (const token of tokens) {
    assert.equal(legalConsentsMigrationSql.includes(token), true, `legal consent migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing legal consent token ${token}`);
  }

  assert.equal(legalConsentsMigrationSql.includes("grant select, insert on table public.legal_consents to authenticated"), false);
  assert.equal(schemaSql.includes("grant select, insert on table public.legal_consents to authenticated"), false);
  assert.equal(legalConsentsMigrationSql.includes("grant insert on table public.legal_consents to authenticated"), false);
  assert.equal(schemaSql.includes("grant insert on table public.legal_consents to authenticated"), false);
  assert.equal(legalConsentsMigrationSql.includes("legal_consents_insert_own"), false);
  assert.equal(schemaSql.includes("legal_consents_insert_own"), false);
  assert.equal(legalConsentsMigrationSql.includes("grant update"), false);
  assert.equal(legalConsentsMigrationSql.includes("grant delete"), false);
});

test("Legal consent verification SQL checks grants, null-safe RPC, and rejecting signup metadata", () => {
  const tokens = [
    "legal_consents",
    "age_confirmed_at",
    "02_table_privileges",
    "04_record_rpc_definition_checks",
    "05_auth_trigger_definition_checks",
    "p_terms_version is distinct from",
    "p_privacy_version is distinct from",
    "p_age_confirmed is distinct from true",
    "v_terms_version is distinct from",
    "v_privacy_version is distinct from",
    "v_age_confirmed is distinct from true",
    "LEGAL_CONSENT_REQUIRED",
    "06_function_execute_privileges",
    "aclexplode",
  ];

  for (const token of tokens) {
    assert.equal(legalConsentVerificationSql.includes(token), true, `legal verification SQL missing ${token}`);
  }

  assert.equal(legalConsentVerificationSql.includes("insert into"), false);
  assert.equal(legalConsentVerificationSql.includes("update public"), false);
  assert.equal(legalConsentVerificationSql.includes("delete from"), false);
});

test("posts Realtime publication migration is idempotent and synchronized with schema.sql", () => {
  const tokens = [
    "from pg_publication",
    "pubname = 'supabase_realtime'",
    "from pg_publication_tables",
    "schemaname = 'public'",
    "tablename = 'posts'",
    "alter publication supabase_realtime add table public.posts",
  ];

  for (const token of tokens) {
    assert.equal(postsRealtimePublicationMigrationSql.includes(token), true, `Realtime migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing Realtime token ${token}`);
  }

  assert.equal(postsRealtimePublicationMigrationSql.includes("alter table public.posts"), false);
  assert.equal(postsRealtimePublicationMigrationSql.includes("create policy"), false);
  assert.equal(postsRealtimePublicationMigrationSql.includes("grant "), false);
});

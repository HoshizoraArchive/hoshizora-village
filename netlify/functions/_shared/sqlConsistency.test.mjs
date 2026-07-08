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
const preflightSql = readFileSync("docs/ai-resident-security-preflight.sql", "utf8");
const observationMvpPreflightSql = readFileSync("docs/ai-observation-mvp-preflight.sql", "utf8");
const observationMvpVerificationSql = readFileSync("docs/ai-observation-mvp-verification.sql", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const appJsx = readFileSync("src/App.jsx", "utf8");
const mainJsx = readFileSync("src/main.jsx", "utf8");
const pushNotificationSetupJs = readFileSync("src/pushNotificationSetup.js", "utf8");
const pushConfigFunction = readFileSync("netlify/functions/push-config.mjs", "utf8");
const pushRegisterFunction = readFileSync("netlify/functions/push-subscription-register.mjs", "utf8");
const pushSharedFunction = readFileSync("netlify/functions/_shared/pushNotifications.mjs", "utf8");
const pushDeliverySharedFunction = readFileSync("netlify/functions/_shared/pushDelivery.mjs", "utf8");
const pushDispatchFunction = readFileSync("netlify/functions/push-notification-dispatch.mjs", "utf8");

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

test("R.Connect renders smartphone notification test card through React instead of DOM injection", () => {
  const requiredAppTokens = [
    "function PushNotificationTestCard({ session })",
    "<PushNotificationTestCard session={notifications.session} />",
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
  assert.equal(pushNotificationSetupJs.includes('registration.showNotification("星空Village"'), true);
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
  assert.equal(pushRegisterFunction.includes("onConflict: \"endpoint\""), true);
  assert.equal(pushRegisterFunction.includes("profile_id: user.id"), true);
  assert.equal(pushSharedFunction.includes("validateEndpoint(subscription.endpoint)"), true);
  assert.equal(pushSharedFunction.includes('trimmed.startsWith("https://")'), true);
});

test("R.Connect notification card registers this device without client-side Push delivery", () => {
  const requiredAppTokens = [
    "subscribeToPushNotifications",
    "端末登録: 未登録",
    "端末登録: 登録済み",
    "端末登録: 登録に失敗しました",
    "端末登録: VAPID key未設定",
    "この端末を登録",
    "<PushNotificationTestCard session={notifications.session} />",
  ];
  const requiredSetupTokens = [
    "fetchPushNotificationConfig",
    "subscribeToPushNotifications({ accessToken })",
    "urlBase64ToUint8Array(publicKey)",
    "registration.pushManager.subscribe",
    'fetch(PUSH_SUBSCRIPTION_REGISTER_ENDPOINT',
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

  for (const token of ["resonance", "archive", "star_letter"]) {
    assert.equal(pushDeliverySharedFunction.includes(token), true, `push delivery fallback missing ${token}`);
  }

  assert.equal(pushDeliverySharedFunction.includes('readEnv("PUSH_VAPID_PRIVATE_KEY")'), true);
  assert.equal(pushDeliverySharedFunction.includes("PUSH_DEFAULT_SUBJECT"), true);
  assert.equal(pushDeliverySharedFunction.includes("PUSH_SUBSCRIPTION_GONE"), true);
  assert.equal(pushDeliverySharedFunction.includes("status === 404 || status === 410"), true);
  assert.equal(pushDispatchFunction.includes("ai-observation"), false);
  assert.equal(pushDispatchFunction.includes("hoshizora_chia"), false);
});

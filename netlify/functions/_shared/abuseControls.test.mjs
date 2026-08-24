import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260824122431_harden_remaining_abuse_write_paths.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const appSource = readFileSync("src/App.jsx", "utf8");
const appOpenSource = readFileSync("src/appOpenTracking.js", "utf8");
const dataApiSource = readFileSync("src/dataRevisionApi.js", "utf8");

function compact(sql) {
  return sql.replace(/\s+/g, " ");
}

function assertDatabaseContract(sql, sourceName) {
  const normalized = compact(sql);

  assert.match(
    normalized,
    /create table if not exists app_private\.abuse_rate_limits \([^;]+primary key \(scope, actor_id\)/i,
    `${sourceName} must keep one atomic limiter row per scope and actor`,
  );
  assert.match(
    normalized,
    /on conflict \(scope, actor_id\) do update set tokens = least\([^;]+where least\([^;]+>= p_cost returning true into v_allowed/i,
    `${sourceName} must consume tokens with one concurrency-safe upsert`,
  );
  assert.match(
    normalized,
    /revoke all on function app_private\.consume_abuse_quota\(text, uuid, numeric, integer, numeric\) from public, anon, authenticated, service_role/i,
    `${sourceName} must keep the quota primitive private`,
  );

  const limits = [
    ["post_create", 10, 3600],
    ["star_letter_create", 30, 3600],
    ["star_letter_resonance", 30, 3600],
    ["feedback_create", 5, 3600],
    ["meteor_tag_create", 30, 3600],
    ["app_open_create", 30, 3600],
    ["content_report_create", 10, 3600],
  ];

  for (const [scope, capacity, refillSeconds] of limits) {
    assert.match(
      normalized,
      new RegExp(
        `consume_abuse_quota\\('${scope}', v_user_id, ${capacity}, ${refillSeconds}\\)`,
        "i",
      ),
      `${sourceName} missing ${scope} limit`,
    );
  }

  for (const trigger of [
    "posts_enforce_create_rate",
    "star_letters_enforce_create_rate",
    "star_letter_resonances_enforce_create_rate",
    "feedbacks_enforce_create_rate",
    "meteor_tags_enforce_create_rate",
    "app_open_events_enforce_create_rate",
    "content_reports_enforce_create_rate",
    "push_subscriptions_enforce_limit",
    "storage_objects_complete_upload_reservation",
  ]) {
    assert.match(normalized, new RegExp(`create trigger ${trigger}`, "i"));
  }

  for (const [bucket, hourCapacity, dayCapacity] of [
    ["avatars", 10, 10],
    ["meteor-media", 30, 32],
    ["meteor-video", 10, 5],
  ]) {
    assert.match(
      normalized,
      new RegExp(
        `when '${bucket}' then .*?v_hour_capacity := ${hourCapacity}; v_day_capacity := ${dayCapacity};`,
        "i",
      ),
      `${sourceName} missing ${bucket} hourly/daily quota`,
    );
  }

  assert.match(
    normalized,
    /create table if not exists app_private\.storage_upload_reservations \([^;]+primary key \(bucket_id, object_name\)/i,
    `${sourceName} must persist exact server-generated upload reservations`,
  );
  assert.match(
    normalized,
    /create or replace function public\.reserve_storage_upload_v1\( p_bucket_id text, p_extension text \).*consume_abuse_quota\( v_hour_scope, v_user_id, v_hour_capacity, 3600, 1 \) and app_private\.consume_abuse_quota\( v_day_scope, v_user_id, v_day_capacity, 86400, 1 \).*v_user_id::text \|\| '\/' \|\| extensions\.gen_random_uuid\(\)::text/i,
    `${sourceName} must atomically reserve a non-client-selectable Storage path`,
  );
  assert.match(
    normalized,
    /revoke all on function public\.reserve_storage_upload_v1\(text, text\) from public, anon, authenticated, service_role; grant execute on function public\.reserve_storage_upload_v1\(text, text\) to authenticated/i,
    `${sourceName} must expose only the authenticated reservation RPC`,
  );
  assert.match(
    normalized,
    /create or replace function app_private\.is_storage_upload_reserved\( p_bucket_id text, p_name text \).*storage\.foldername\(p_name\).*reservation\.used_at is null.*reservation\.expires_at > now\(\)/i,
    `${sourceName} must bind RLS to the actor's live unused reservation`,
  );
  assert.match(
    normalized,
    /create trigger storage_objects_complete_upload_reservation after insert or update of bucket_id, name, owner_id on storage\.objects for each row execute function app_private\.complete_storage_upload_reservation\(\)/i,
    `${sourceName} must permanently consume a reservation after the real Storage write`,
  );

  assert.match(
    normalized,
    /revoke insert, update on table public\.posts from public, anon, authenticated/i,
  );
  assert.match(
    normalized,
    /revoke insert \(post_id, author_id, body\) on table public\.star_letters from public, anon, authenticated/i,
  );
  assert.match(
    normalized,
    /revoke insert on table public\.post_media from public, anon, authenticated/i,
  );
  assert.match(
    normalized,
    /revoke insert, delete on table public\.post_meteor_tags from public, anon, authenticated/i,
  );

  assert.match(
    normalized,
    /create table if not exists app_private\.push_subscription_usage \([^;]+active_count between 0 and 20[^;]+total_count between 0 and 50[^;]+active_count <= total_count/i,
  );
  assert.match(
    normalized,
    /on conflict \(profile_id\) do update set active_count = app_private\.push_subscription_usage\.active_count[^;]+<= 20 and app_private\.push_subscription_usage\.total_count[^;]+<= 50 returning true into v_allowed/i,
  );
  assert.match(
    normalized,
    /tg_op = 'UPDATE' and new\.profile_id <> old\.profile_id.*decrement_push_subscription_usage\( old\.profile_id.*increment_push_subscription_usage\( new\.profile_id/i,
    `${sourceName} must move usage when an existing subscription changes account`,
  );
  assert.match(
    normalized,
    /create or replace function public\.reserve_push_subscription_test_v1\( p_profile_id uuid \).*coalesce\(auth\.role\(\), ''\) <> 'service_role'.*consume_abuse_quota\( 'push_subscription_test', p_profile_id, 5, 3600 \)/i,
    `${sourceName} must reserve Push test delivery before the provider call`,
  );
  assert.match(
    normalized,
    /revoke all on function public\.reserve_push_subscription_test_v1\(uuid\) from public, anon, authenticated, service_role; grant execute on function public\.reserve_push_subscription_test_v1\(uuid\) to service_role/i,
  );
}

test("remaining SEC-008 gates are synchronized in migration and canonical schema", () => {
  assertDatabaseContract(migrationSql, migrationPath);
  assertDatabaseContract(schemaSql, "supabase/schema.sql");
});

test("current browser paths match the intentionally retained or RPC-only boundaries", () => {
  assert.match(dataApiSource, /runRpc\(client, "create_post_v1"/);
  assert.match(dataApiSource, /runRpc\(client, "create_star_letter_v2"/);
  assert.doesNotMatch(appSource, /\.from\("posts"\)[\s\S]{0,180}\.insert\(/);
  assert.doesNotMatch(appSource, /\.from\("star_letters"\)[\s\S]{0,180}\.insert\(/);
  assert.doesNotMatch(appSource, /\.from\("post_media"\)[\s\S]{0,180}\.insert\(/);
  assert.match(appSource, /\.from\("feedbacks"\)\.insert\(/);
  assert.match(appOpenSource, /\.from\("app_open_events"\)\.insert\(/);
  assert.match(appSource, /\.rpc\("reserve_storage_upload_v1"/);
  assert.doesNotMatch(appSource, /avatar-cropped-\$\{Date\.now\(\)\}/);
});

test("the established post-resonance limiter is not redefined by this migration", () => {
  assert.doesNotMatch(migrationSql, /create\s+or\s+replace\s+function\s+public\.add_post_resonance_v1/i);
  assert.doesNotMatch(migrationSql, /revoke\s+insert\s+on\s+table\s+public\.resonances/i);
  assert.match(migrationSql, /既存の流星便共鳴制限は変更しない/);
});

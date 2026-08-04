import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260804153000_add_causal_data_revisions.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
const appSource = readFileSync("src/App.jsx", "utf8");
const apiSource = readFileSync("src/dataRevisionApi.js", "utf8");
const conversationSource = readFileSync("src/starLetterConversations.js", "utf8");
const profileBlockingSource = readFileSync("src/profileBlocking.js", "utf8");

test("causal revision migration is one unapplied-style transaction with lock-protected trigger-first backfill", () => {
  assert.match(normalizedSql, /^begin; /);
  assert.match(normalizedSql, /commit;$/);
  assert.match(normalizedSql, /set local lock_timeout = '15s'/);
  assert.match(normalizedSql, /lock table [\s\S]* in share row exclusive mode/);

  const lockIndex = normalizedSql.indexOf("lock table");
  const triggerIndex = normalizedSql.indexOf("create trigger causal_revision_posts");
  const backfillIndex = normalizedSql.indexOf("-- idempotent backfill");
  assert.ok(lockIndex >= 0 && lockIndex < triggerIndex);
  assert.ok(triggerIndex < backfillIndex);
  assert.match(normalizedSql.slice(backfillIndex), /on conflict \(post_id, domain\) do nothing/);
  assert.match(normalizedSql.slice(backfillIndex), /on conflict \(viewer_id, post_id, domain\) do nothing/);
});

test("revision ledgers are entity-scoped and preserve hard-delete tombstones", () => {
  assert.match(normalizedSql, /primary key \(post_id, domain\)/);
  assert.match(normalizedSql, /primary key \(viewer_id, post_id, domain\)/);
  assert.match(normalizedSql, /viewer_id uuid primary key/);
  assert.match(normalizedSql, /domain in \('post_content', 'post_assets', 'resonance', 'star_thread'\)/);
  assert.match(normalizedSql, /domain in \('archive', 'star_thread_viewer'\)/);
  assert.doesNotMatch(normalizedSql, /global_revision/);
  assert.doesNotMatch(
    normalizedSql.match(/create table if not exists app_private\.post_domain_revisions[\s\S]*?\);/)?.[0] ?? "",
    /references public\.posts/,
  );
  assert.match(
    normalizedSql,
    /bump_post_domain_revision\(old\.id, 'post_content', true, old\.author_id, old\.visibility = 'public'\)/,
  );
  assert.match(normalizedSql, /versioned\.id is null/);
});

test("viewer-dependent reads return a compound version even for zero and false projections", () => {
  for (const rpc of [
    "get_post_snapshots_v1",
    "get_post_engagement_snapshots_v1",
    "get_star_thread_snapshots_v1",
    "get_archived_post_snapshots_v1",
  ]) {
    assert.match(normalizedSql, new RegExp(`create or replace function public\\.${rpc}`));
  }

  assert.match(normalizedSql, /coalesce\(counts\.total_count, 0\)::bigint/);
  assert.match(normalizedSql, /archive_row\.id is not null/);
  assert.match(normalizedSql, /coalesce\(thread\.letters, '\[\]'::jsonb\)/);
  assert.match(normalizedSql, /viewer_context_revision/);
  assert.match(normalizedSql, /thread_revision text, viewer_revision text, viewer_context_revision text/);
  assert.match(normalizedSql, /media_rows jsonb, tag_rows jsonb/);
  assert.match(
    normalizedSql,
    /\(row_number\(\) over \(order by candidate_ids\.post_id\) - 1\) \/ 100/,
  );
  assert.match(normalizedSql, /cross join lateral public\.get_post_snapshots_v1\(snapshot_batches\.post_ids\)/);

  for (const rpc of ["block_profile_v2", "unblock_profile_v2"]) {
    assert.match(normalizedSql, new RegExp(`create or replace function public\\.${rpc}`));
    assert.match(profileBlockingSource, new RegExp(rpc));
  }
  assert.match(
    normalizedSql,
    /block_profile_v2[\s\S]*'revision_epoch'[\s\S]*'viewer_context_revision'/,
  );
  assert.match(
    normalizedSql,
    /unblock_profile_v2[\s\S]*'revision_epoch'[\s\S]*'viewer_context_revision'/,
  );
});

test("successful domain mutations return canonical values and revisions in the same RPC transaction", () => {
  for (const rpc of [
    "add_post_resonance_v1",
    "remove_post_resonance_v1",
    "set_post_archive_v1",
    "create_star_letter_v2",
    "create_star_letter_reply_v2",
    "update_star_letter_v2",
    "delete_star_letter_v2",
    "add_star_letter_resonance_v2",
    "set_star_letter_archive_v2",
    "create_post_v1",
    "update_post_v1",
    "delete_post_v1",
  ]) {
    assert.match(normalizedSql, new RegExp(`create or replace function public\\.${rpc}`));
    assert.match(apiSource + appSource + conversationSource, new RegExp(rpc));
  }

  assert.match(normalizedSql, /'resonance_count', v_count/);
  assert.match(normalizedSql, /'resonance_revision', v_revision::text/);
  assert.match(normalizedSql, /'archive_revision', coalesce\(v_archive_revision, 0\)::text/);
  assert.match(normalizedSql, /app_private\.star_thread_version_json\(v_post_id, v_user_id\)/);
  assert.match(normalizedSql, /'letter', app_private\.star_letter_projection/);
  assert.match(normalizedSql, /'tombstoned', true/);

  for (const table of ["resonances", "archives", "star_letters", "star_letter_resonances", "star_letter_archives"]) {
    assert.doesNotMatch(
      appSource,
      new RegExp(`\\.from\\("${table}"\\)[\\s\\S]{0,220}\\.(insert|update|upsert|delete)\\(`),
    );
  }
});

test("migration adds no RLS policy and exposes only checked RPCs", () => {
  assert.doesNotMatch(normalizedSql, /create policy|drop policy|enable row level security|disable row level security/);
  for (const table of [
    "data_revision_epoch",
    "post_domain_revisions",
    "viewer_post_domain_revisions",
    "viewer_context_revisions",
  ]) {
    assert.match(
      normalizedSql,
      new RegExp(`revoke all on table app_private\\.${table} from public, anon, authenticated`),
    );
  }
  assert.match(normalizedSql, /if v_viewer_id is null then return; end if/);
  assert.match(normalizedSql, /app_private\.can_access_post\(p\.id, v_viewer_id\)/);
  assert.match(normalizedSql, /app_private\.is_black_hole_between_profiles/);
  assert.match(
    normalizedSql,
    /create or replace function app_private\.lock_accessible_post[\s\S]*?p\.deleted_at is null[\s\S]*?for share/,
  );
  assert.match(normalizedSql, /if v_outcome <> 'updated' then v_letter_id := null; v_post_id := null;/);
  assert.match(
    normalizedSql,
    /if v_outcome in \('created', 'already_created'\) then v_projection := app_private\.star_letter_projection/,
  );
});

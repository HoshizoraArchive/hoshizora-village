import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fallbackMigration = readFileSync(
  "supabase/migrations/20261004155833_chia_daily_meteor_ten_minute_fallback.sql",
  "utf8",
);
const mentionGuardMigration = readFileSync(
  "supabase/migrations/20261004155843_chia_ai_resident_mention_block_guard.sql",
  "utf8",
);

test("legacy fallbackはscheduled timeから10分でstale processing claimを安全にtakeoverできる", () => {
  assert.match(fallbackMigration, /add column if not exists claim_owner text/i);
  assert.match(fallbackMigration, /claim_owner in \('dot', 'legacy'\)/i);
  assert.match(fallbackMigration, /create or replace function public\.claim_chia_daily_meteor_run/i);
  assert.match(fallbackMigration, /claim_owner = 'dot'[\s\S]*scheduled_for <= now\(\) - interval '10 minutes'/i);
  assert.match(fallbackMigration, /coalesce\(public\.chia_daily_meteor_runs\.claim_owner, 'legacy'\) = 'legacy'[\s\S]*updated_at < now\(\) - interval '15 minutes'/i);
  assert.match(fallbackMigration, /create or replace function public\.claim_chia_daily_meteor_dot_run/i);
  assert.match(fallbackMigration, /create or replace function public\.complete_chia_daily_meteor_dot_run/i);
  assert.match(fallbackMigration, /create or replace function public\.fail_chia_daily_meteor_dot_run/i);
  assert.match(fallbackMigration, /on conflict \(local_date, slot\) do update/i);
  assert.match(fallbackMigration, /claim_owner = 'dot'/i);
  const dotClaimBody = fallbackMigration.split("create or replace function public.claim_chia_daily_meteor_dot_run", 2)[1] ?? "";
  assert.doesNotMatch(
    dotClaimBody,
    /where public\.chia_daily_meteor_runs\.status = 'failed'\s+or\s+\([\s\S]*claim_owner = 'dot'/i,
  );
  assert.match(fallbackMigration, /grant execute on function public\.claim_chia_daily_meteor_run\(date, text, timestamptz\)\s+to service_role/i);
  assert.match(fallbackMigration, /grant execute on function public\.claim_chia_daily_meteor_dot_run\(date, text, timestamptz\)\s+to service_role/i);
  assert.match(fallbackMigration, /grant execute on function public\.complete_chia_daily_meteor_dot_run\(uuid, uuid, text, text, text\)\s+to service_role/i);
  assert.match(fallbackMigration, /grant execute on function public\.fail_chia_daily_meteor_dot_run\(uuid, text\)\s+to service_role/i);
  assert.match(fallbackMigration, /revoke all on function public\.claim_chia_daily_meteor_run\(date, text, timestamptz\)\s+from public, anon, authenticated/i);
  assert.match(fallbackMigration, /revoke all on function public\.claim_chia_daily_meteor_dot_run\(date, text, timestamptz\)\s+from public, anon, authenticated/i);
  assert.match(fallbackMigration, /select status, claim_owner[\s\S]*for update;/i);
  assert.match(fallbackMigration, /v_status <> 'processing' or v_claim_owner <> 'dot'/i);
  assert.match(fallbackMigration, /status = 'processing'[\s\S]*claim_owner = 'dot'/i);
});

test("AI resident mention notificationは双方向blockをDB trigger内でfail closedする", () => {
  assert.match(mentionGuardMigration, /create or replace function app_private\.create_ai_resident_mention_notification/i);
  assert.match(mentionGuardMigration, /from public\.profile_blocks b/i);
  assert.match(mentionGuardMigration, /b\.blocker_id = new\.actor_profile_id and b\.blocked_id = new\.mentioned_profile_id/i);
  assert.match(mentionGuardMigration, /b\.blocker_id = new\.mentioned_profile_id and b\.blocked_id = new\.actor_profile_id/i);
  assert.match(mentionGuardMigration, /raise exception 'mention relationship is blocked'/i);
  assert.match(mentionGuardMigration, /revoke all on function app_private\.create_ai_resident_mention_notification\(\)\s+from public, anon, authenticated/i);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const canonicalMigrations = [
  {
    md5: "8c3567f4caed608def3bc3cf6f431f2b",
    path: "supabase/migrations/20260709105630_add_push_notification_jobs.sql",
    sha256: "8214fa131eb3dadfb3fd4c78e79a6e1e91ed43a40d63a576a0fa6de81d150c2a",
  },
  {
    md5: "eaa176a263083b5a1080ef6cb479a0c5",
    path: "supabase/migrations/20260728122304_add_star_letter_conversation_foundation.sql",
    sha256: "10bcc148cceea61b625eeb7496fc00384a89351d9a2672749fd68963ce634ff0",
  },
  {
    md5: "91221697fbdfc89d1731aa03c7d2150b",
    path: "supabase/migrations/20260801083009_add_content_reports.sql",
    sha256: "c769915dd5a5a70bbdbf9055e9cddb4812709989fb72e2b436d72d1619386286",
  },
  {
    md5: "1c0609b9bc1f4b372e47ba81bfa38110",
    path: "supabase/migrations/20260810013137_add_chia_post_notifications.sql",
    sha256: "c5c90fccda56dff5cbc5422f19262c3a97c8c54438f2435f9221b597f9c98f9f",
  },
];

const catalogCommentMigrationSql = readFileSync(
  "supabase/migrations/20260812051400_restore_canonical_catalog_comments.sql",
  "utf8",
);
const reconnectMigrationSql = readFileSync(
  "supabase/migrations/20260807071000_rename_rconnect_to_reconnect.sql",
  "utf8",
);

test("canonical migration files keep the exact Production statement fingerprints", () => {
  for (const migration of canonicalMigrations) {
    const bytes = readFileSync(migration.path);
    assert.equal(createHash("md5").update(bytes).digest("hex"), migration.md5);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), migration.sha256);
  }
});

test("catalog restoration migration contains only the nine required COMMENT ON statements", () => {
  const statements = catalogCommentMigrationSql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  const normalizedStatements = statements.map((statement) => statement.replace(/\s+/g, " "));

  assert.equal(statements.length, 9);
  for (const statement of statements) {
    assert.match(statement, /^comment on (column|function) /i);
  }
  assert.doesNotMatch(
    catalogCommentMigrationSql,
    /^\s*(create|alter|drop|grant|revoke|insert|update|delete|do|begin|commit)\b/im,
  );

  assert.deepEqual(normalizedStatements, [
    "comment on column public.push_notification_jobs.notification_id is 'Push配信対象のpublic.notifications行。1通知につき最大1job。'",
    "comment on column public.push_notification_jobs.recipient_id is '通知受信者。送信Functionはこのprofile_idに紐づく有効なpush_subscriptionsだけへ送信する。'",
    "comment on column public.push_notification_jobs.status is 'queued / processing / succeeded / failed / skipped。'",
    "comment on column public.push_notification_jobs.attempt_count is 'scheduled Functionがclaimした送信試行回数。Gemini/AI観測とは無関係。'",
    "comment on column public.push_notification_jobs.last_error_code is '外部へ出してよい短い失敗分類。endpointやsecretなどは保存しない。'",
    "comment on column public.notifications.star_letter_id is '星文通知の対象。Re:Connectから流星便と星文を特定するために保持する。'",
    "comment on column public.notifications.content_report_id is '観測局の管理通知が指すreport。対象ユーザーや送信者へは公開せず、管理者のRe:Connect遷移だけに使用する。'",
    "comment on function app_private.create_chia_post_notifications() is '星空ちあの新規流星便を、ちあ本人とAI住人を除く全村人のRe:Connectへ配る。'",
    "comment on function app_private.enqueue_push_notification_job() is '通知INSERTをPush配信jobへ積む。chia_postだけはrecipientのnotify_chia_posts=falseならPushを積まない。'",
  ]);

  assert.equal(catalogCommentMigrationSql.includes("comment on table public.push_notification_jobs"), false);
  assert.match(
    reconnectMigrationSql.replace(/\s+/g, " "),
    /comment on table public\.push_notification_jobs is 'Re:Connect通知を登録済み端末へWeb Push配信するためのserver-side queue。browser roleからは直接操作させない。';/,
  );
});

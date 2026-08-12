import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  blockProfile,
  createBlockedProfileIdSet,
  excludeBlockedProfiles,
  isMissingProfileBlocksSchemaError,
  isTrustedProtectedProfile,
  readBlockedProfileIds,
  unblockProfile,
} from "../../../src/profileBlocking.js";
import { processPushNotificationJob } from "../push-notification-dispatch.mjs";

const migrationPath =
  "supabase/migrations/20260731080253_add_profile_blocks.sql";
const marker = "-- 20260731080253_add_profile_blocks.sql\n";
const migrationSql = readFileSync(migrationPath, "utf8").trim();
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const appSource = readFileSync("src/App.jsx", "utf8");
const pushDispatchSource = readFileSync(
  "netlify/functions/push-notification-dispatch.mjs",
  "utf8",
);

test("blocked profile ids are fetched once and filter mixed content without N+1 queries", async () => {
  let fromCalls = 0;
  const client = {
    from(table) {
      fromCalls += 1;
      assert.equal(table, "profile_blocks");
      return {
        async select(columns) {
          assert.equal(columns, "blocked_id");
          return {
            data: [{ blocked_id: "profile-a" }, { blocked_id: "profile-b" }],
            error: null,
          };
        },
      };
    },
  };

  const ids = await readBlockedProfileIds(client);
  assert.equal(fromCalls, 1);
  assert.deepEqual([...ids], ["profile-a", "profile-b"]);
  assert.deepEqual(
    excludeBlockedProfiles(
      [{ authorId: "profile-a" }, { authorId: "profile-c" }],
      ids,
      (item) => item.authorId,
    ),
    [{ authorId: "profile-c" }],
  );
  assert.deepEqual(createBlockedProfileIdSet(null), new Set());
});

test("block and restore mutations use only the authenticated RPC contracts", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return {
        data: [
          {
            outcome: name === "block_profile_v2" ? "blocked" : "unblocked",
            revision_epoch: "11111111-1111-4111-8111-111111111111",
            viewer_context_revision: "2",
          },
        ],
        error: null,
      };
    },
  };

  await blockProfile(client, "profile-b");
  await unblockProfile(client, "profile-b");
  assert.deepEqual(calls, [
    {
      args: { p_target_profile_id: "profile-b" },
      name: "block_profile_v2",
    },
    {
      args: { p_target_profile_id: "profile-b" },
      name: "unblock_profile_v2",
    },
  ]);
});

test("missing migration errors keep Deploy Preview fail-soft", () => {
  assert.equal(isMissingProfileBlocksSchemaError({ code: "42P01" }), true);
  assert.equal(
    isMissingProfileBlocksSchemaError({
      code: "PGRST202",
      message: "Could not find function public.block_profile",
    }),
    true,
  );
  assert.equal(isMissingProfileBlocksSchemaError({ code: "42501" }), false);
});

test("only the trusted title record is used for the client-side protected hint", () => {
  assert.equal(
    isTrustedProtectedProfile({
      primaryTitle: { key: "celestial_guide" },
      username: "not-relied-on",
    }),
    true,
  );
  assert.equal(
    isTrustedProtectedProfile({
      displayName: "星空ちあ",
      username: "chia_hoshizora",
    }),
    false,
  );
});

test("profile_blocks enforces ownership, secrecy, self rejection, and bidirectional lookup indexes", () => {
  assert.match(migrationSql, /unique \(blocker_id, blocked_id\)/);
  assert.match(migrationSql, /check \(blocker_id <> blocked_id\)/);
  assert.match(
    migrationSql,
    /profile_blocks_blocked_blocker_idx[\s\S]*\(blocked_id, blocker_id\)/,
  );
  assert.match(
    migrationSql,
    /profile_blocks_select_own[\s\S]*using \(blocker_id = \(select auth\.uid\(\)\)\)/,
  );
  assert.match(
    migrationSql,
    /profile_blocks_insert_own[\s\S]*blocker_id = \(select auth\.uid\(\)\)[\s\S]*not app_private\.is_black_hole_protected\(blocked_id\)/,
  );
  assert.match(
    migrationSql,
    /profile_blocks_delete_own[\s\S]*using \(blocker_id = \(select auth\.uid\(\)\)\)/,
  );
  assert.doesNotMatch(migrationSql, /create policy profile_blocks_update/i);
  assert.doesNotMatch(
    migrationSql,
    /grant[^;]*update[^;]*profile_blocks[^;]*authenticated/i,
  );
});

test("browser access is blocked in both directions across core content and mutations", () => {
  for (const policy of [
    "profiles_select_public",
    "posts_select_visible",
    "resonances_select_visible",
    "resonances_insert_logged_in",
    "resonances_delete_own",
    "archives_select_own",
    "archives_insert_own",
    "archives_update_own",
    "archives_delete_own",
    "notifications_select_own",
    "notifications_update_read_own",
    "star_letters_select_visible",
    "star_letters_insert_logged_in",
    "star_letter_archives_select_own",
  ]) {
    assert.match(migrationSql, new RegExp(`create policy ${policy}`));
  }

  assert.match(
    migrationSql,
    /is_black_hole_between_profiles[\s\S]*relation\.blocker_id = p_left_profile_id[\s\S]*relation\.blocker_id = p_right_profile_id/,
  );
  assert.match(
    migrationSql,
    /create_star_letter_reply[\s\S]*is_black_hole_between_profiles\([\s\S]*v_parent\.author_id/,
  );
  assert.match(
    migrationSql,
    /add_star_letter_resonance[\s\S]*is_black_hole_between_profiles\([\s\S]*v_letter_author_id/,
  );
  assert.match(
    migrationSql,
    /set_star_letter_archive[\s\S]*is_black_hole_between_profiles\([\s\S]*v_letter_author_id/,
  );
  assert.match(
    migrationSql,
    /create policy resonances_delete_own[\s\S]*profile_id = \(select auth\.uid\(\)\)[\s\S]*from public\.posts visible_post/,
  );
  assert.match(
    migrationSql,
    /create policy archives_update_own[\s\S]*profile_id = \(select auth\.uid\(\)\)[\s\S]*from public\.posts visible_post/,
  );
  assert.match(
    migrationSql,
    /create policy archives_delete_own[\s\S]*profile_id = \(select auth\.uid\(\)\)[\s\S]*from public\.posts visible_post/,
  );
});

test("SECURITY DEFINER helpers and RPCs keep fixed search_path and minimum grants", () => {
  for (const functionName of [
    "app_private.is_black_hole_between_profiles",
    "app_private.is_black_hole_between",
    "app_private.is_black_hole_protected",
    "public.block_profile",
    "public.unblock_profile",
    "public.get_my_profile_blocks",
    "public.is_notification_black_holed",
  ]) {
    const functionBlock =
      migrationSql.split(`create or replace function ${functionName}`)[1]?.split("$$;")[0] ?? "";
    assert.match(
      functionBlock,
      /security definer[\s\S]*set search_path = ''/,
    );
  }

  assert.match(
    migrationSql,
    /revoke all on function public\.block_profile\(uuid\)[\s\S]*grant execute on function public\.block_profile\(uuid\)[\s\S]*to authenticated/,
  );
  assert.match(
    migrationSql,
    /is_notification_black_holed\(uuid, uuid\)[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant execute on function public\.is_notification_black_holed[^;]*authenticated/i,
  );
});

test("notifications, queued Push, onboarding, and realtime all honor the relationship", () => {
  for (const triggerFunction of [
    "create_resonance_notification",
    "create_archive_notification",
    "create_star_letter_notification",
    "create_star_letter_resonance_notification",
    "enqueue_push_notification_job",
  ]) {
    const functionBlock =
      migrationSql
        .split(`create or replace function app_private.${triggerFunction}`)[1]
        ?.split("$$;")[0] ?? "";
    assert.match(
      functionBlock,
      /is_black_hole_between_profiles/,
    );
  }

  assert.match(
    migrationSql,
    /ensure_onboarding_target_not_black_holed[\s\S]*not app_private\.is_black_hole_between_profiles/,
  );
  assert.match(
    migrationSql,
    /profile_blocks_refresh_onboarding_target[\s\S]*after insert on public\.profile_blocks/,
  );
  assert.match(
    pushDispatchSource,
    /is_notification_black_holed[\s\S]*"BLACK_HOLE"/,
  );
  assert.ok(
    pushDispatchSource.indexOf("isNotificationBlackHoled") <
      pushDispatchSource.indexOf("fetchRecipientSubscriptions(supabase, job.recipient_id)"),
  );
  assert.match(
    appSource,
    /isProfileBlocked\(blockedProfileIdsRef\.current, post\.author_id\)/,
  );
  assert.match(
    appSource,
    /PUBLIC_POST_FRESHNESS_SELECT_COLUMNS = "id, author_id, created_at, visibility, type"/,
  );
});

test("a queued Push job is skipped before subscriptions are read when the relationship now exists", async () => {
  const updates = [];
  let subscriptionsRead = false;
  const notification = {
    actor_id: "actor-a",
    id: "notification-a",
    message: "hidden",
    post_id: "post-a",
    recipient_id: "recipient-a",
    type: "resonance",
  };
  const supabase = {
    from(table) {
      if (table === "notifications") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: notification, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "push_subscriptions") {
        subscriptionsRead = true;
        throw new Error("subscriptions must not be read");
      }

      assert.equal(table, "push_notification_jobs");
      return {
        update(values) {
          return {
            async eq(_column, jobId) {
              updates.push({ jobId, values });
              return { error: null };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      assert.equal(name, "is_notification_black_holed");
      assert.deepEqual(args, {
        p_actor_id: "actor-a",
        p_recipient_id: "recipient-a",
      });
      return { data: true, error: null };
    },
  };

  const result = await processPushNotificationJob({
    job: {
      id: "job-a",
      notification_id: "notification-a",
      recipient_id: "recipient-a",
    },
    supabase,
    webPushClient: {
      async sendNotification() {
        throw new Error("must not send");
      },
    },
  });

  assert.deepEqual(result, { disabled: 0, sent: 0, status: "skipped" });
  assert.equal(subscriptionsRead, false);
  assert.equal(updates[0].values.last_error_code, "BLACK_HOLE");
  assert.equal(updates[0].values.status, "skipped");
});

test("the UI exposes only explicit confirmation and management actions", () => {
  assert.match(appSource, /ブラックホールに送る/);
  assert.match(appSource, /この村人をブラックホールに送りますか？/);
  assert.match(
    appSource,
    /お互いの投稿・プロフィール・星文・通知が見えなくなります。\\n相手には通知されません。/,
  );
  assert.match(appSource, /ブラックホール管理/);
  assert.match(appSource, /この村人をブラックホールから戻しますか？/);
  assert.match(
    appSource,
    /!isOwnPost[\s\S]*!isTrustedProtectedProfile\(post\)/,
  );
  assert.match(
    appSource,
    /setSavedPosts\(\(items\) => items\.filter\(keepPost\)\)/,
  );
  assert.doesNotMatch(appSource, /window\.location\.reload/);
});

test("migration and schema.sql stay byte-for-byte synchronized", () => {
  const schemaBlock = schemaSql
    .split(marker)[1]
    ?.split("-- 20260801083009_add_content_reports.sql")[0]
    ?.trim();
  assert.equal(schemaBlock, migrationSql);
});

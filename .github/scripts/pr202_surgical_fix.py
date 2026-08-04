from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one patch target, found {count}")
    file_path.write_text(text.replace(old, new, 1))


# HIGH: R.Connect notification loader calls an undefined isCurrentRequest().
# The effect already has an isMounted closure and re-runs on session user changes,
# so restoring that local guard rejects responses from a cleaned-up old session.
replace_once(
    "src/App.jsx",
    '''      const { data, error } = notificationResult;

      if (!isCurrentRequest()) {
        return;
      }

      setNotificationsLoading(false);
''',
    '''      const { data, error } = notificationResult;

      if (!isMounted) {
        return;
      }

      setNotificationsLoading(false);
''',
)

# Keep the server's <=100 known-id input guard, but chunk a large client known set.
# Every RPC returns the current Archive as well, so de-duplicate repeated current rows.
replace_once(
    "src/dataRevisionApi.js",
    '''export async function readArchivedPostSnapshots(client, knownPostIds = [], options = {}) {
  return (await runRpc(client, "get_archived_post_snapshots_v1", {
    p_known_post_ids: uniqueIds(knownPostIds),
  }, options)) ?? [];
}
''',
    '''export async function readArchivedPostSnapshots(client, knownPostIds = [], options = {}) {
  const ids = uniqueIds(knownPostIds);
  const batches = [];

  if (ids.length === 0) {
    batches.push([]);
  } else {
    for (let index = 0; index < ids.length; index += REVISION_READ_BATCH_SIZE) {
      batches.push(ids.slice(index, index + REVISION_READ_BATCH_SIZE));
    }
  }

  const snapshotsByPostId = new Map();

  for (const batch of batches) {
    const rows = (await runRpc(client, "get_archived_post_snapshots_v1", {
      p_known_post_ids: batch,
    }, options)) ?? [];

    for (const snapshot of rows) {
      if (snapshot?.post_id && !snapshotsByPostId.has(snapshot.post_id)) {
        snapshotsByPostId.set(snapshot.post_id, snapshot);
      }
    }
  }

  return [...snapshotsByPostId.values()];
}
''',
)

# The database function already batches snapshot hydration in groups of 100.
# Do not truncate the user's current Archive itself to 100 rows.
replace_once(
    "supabase/migrations/20260804153000_add_causal_data_revisions.sql",
    '''    select current_archives.post_id
    from (
      select a.post_id
      from public.archives a
      where a.profile_id = v_viewer_id
      order by a.created_at desc, a.id
      limit 100
    ) current_archives
''',
    '''    select current_archives.post_id
    from (
      select a.post_id
      from public.archives a
      where a.profile_id = v_viewer_id
      order by a.created_at desc, a.id
    ) current_archives
''',
)

# Replace the old assertion that accidentally enshrined current-Archive truncation.
replace_once(
    "netlify/functions/_shared/dataRevisionMigration.test.mjs",
    '''  assert.match(normalizedSql, /limit 100/);
''',
    '''  assert.match(
    normalizedSql,
    /\\(row_number\\(\\) over \\(order by candidate_ids\\.post_id\\) - 1\\) \\/ 100/,
  );
''',
)

Path("netlify/functions/_shared/archiveRevisionPagination.test.mjs").write_text(r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readArchivedPostSnapshots } from "../../../src/dataRevisionApi.js";

function createArchiveRpcClient() {
  const calls = [];

  return {
    calls,
    rpc(name, args) {
      calls.push({ args, name });
      return Promise.resolve({
        data: [
          { post_id: "current-archive-1", is_archived: true },
          { post_id: "current-archive-2", is_archived: true },
          ...(args.p_known_post_ids ?? []).map((postId) => ({
            post_id: postId,
            is_archived: false,
          })),
        ],
        error: null,
      });
    },
  };
}

test("Archive known ids are batched without truncating or duplicating current rows", async () => {
  const client = createArchiveRpcClient();
  const knownIds = Array.from({ length: 205 }, (_, index) => `known-${index}`);
  const rows = await readArchivedPostSnapshots(client, knownIds);

  assert.deepEqual(client.calls.map((call) => call.args.p_known_post_ids.length), [100, 100, 5]);
  assert.equal(
    client.calls.every((call) => call.name === "get_archived_post_snapshots_v1"),
    true,
  );
  assert.equal(rows.filter((row) => row.post_id === "current-archive-1").length, 1);
  assert.equal(rows.filter((row) => row.post_id === "current-archive-2").length, 1);
  assert.equal(rows.length, knownIds.length + 2);
  assert.deepEqual(
    rows.filter((row) => row.post_id.startsWith("known-")).map((row) => row.post_id),
    knownIds,
  );
});

test("Archive with no known ids still loads the current server Archive", async () => {
  const client = createArchiveRpcClient();
  const rows = await readArchivedPostSnapshots(client, []);

  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].args.p_known_post_ids, []);
  assert.deepEqual(rows.map((row) => row.post_id), ["current-archive-1", "current-archive-2"]);
});

test("Archive migration keeps the 100-id input guard but does not cap current Archive rows", () => {
  const sql = readFileSync(
    "supabase/migrations/20260804153000_add_causal_data_revisions.sql",
    "utf8",
  ).replace(/\s+/g, " ").toLowerCase();
  const archiveRpc = sql.match(
    /create or replace function public\.get_archived_post_snapshots_v1[\s\S]*?revoke all on function public\.get_archived_post_snapshots_v1/,
  )?.[0] ?? "";

  assert.match(archiveRpc, /cardinality\(p_known_post_ids\), 0\) > 100/);
  assert.doesNotMatch(
    archiveRpc,
    /from public\.archives a where a\.profile_id = v_viewer_id order by a\.created_at desc, a\.id limit 100/,
  );
  assert.match(
    archiveRpc,
    /\(row_number\(\) over \(order by candidate_ids\.post_id\) - 1\) \/ 100/,
  );
  assert.match(archiveRpc, /get_post_snapshots_v1\(snapshot_batches\.post_ids\)/);
});
''')

# Add a browser regression that both executes the notification completion path and
# verifies a delayed old-session response is ignored after A -> B session switch.
e2e_path = Path("e2e/refresh-data-consistency-races.spec.mjs")
e2e = e2e_path.read_text()

old_defaults = '''      delayArchiveReads: false,
      delayGlobalStarLetters: false,
      delayResonanceReads: false,
'''
new_defaults = '''      delayArchiveReads: false,
      delayGlobalStarLetters: false,
      delayNotificationReads: false,
      delayResonanceReads: false,
'''
if e2e.count(old_defaults) != 1:
    raise SystemExit(f"e2e defaults target count: {e2e.count(old_defaults)}")
e2e = e2e.replace(old_defaults, new_defaults, 1)

old_counters = '''      delayedArchiveMutations: 0,
      delayedPostSnapshots: 0,
      delayedResonanceReads: 0,
'''
new_counters = '''      delayedArchiveMutations: 0,
      delayedNotificationReads: 0,
      delayedPostSnapshots: 0,
      delayedResonanceReads: 0,
'''
if e2e.count(old_counters) != 1:
    raise SystemExit(f"e2e counters target count: {e2e.count(old_counters)}")
e2e = e2e.replace(old_counters, new_counters, 1)

old_resolvers = '''      nextEngagementSnapshot: null,
      postBody: "再同期race確認用の流星便",
'''
new_resolvers = '''      nextEngagementSnapshot: null,
      notificationReadResolvers: [],
      postBody: "再同期race確認用の流星便",
'''
if e2e.count(old_resolvers) != 1:
    raise SystemExit(f"e2e resolver target count: {e2e.count(old_resolvers)}")
e2e = e2e.replace(old_resolvers, new_resolvers, 1)

old_session_setup = '''  controls.activeSession = session;
  controls.loginSession = loginSession;

  await page.addInitScript'''
new_session_setup = '''  controls.activeSession = session;
  controls.loginSession = loginSession;
  controls.releaseNotificationReads = () => {
    controls.delayNotificationReads = false;
    for (const resolve of controls.notificationReadResolvers.splice(0)) {
      resolve();
    }
  };

  await page.addInitScript'''
if e2e.count(old_session_setup) != 1:
    raise SystemExit(f"e2e session setup target count: {e2e.count(old_session_setup)}")
e2e = e2e.replace(old_session_setup, new_session_setup, 1)

storage_anchor = '''    if (url.includes("/storage/v1/object/sign/")) {
'''
notification_route = '''    if (url.includes("/rest/v1/notifications")) {
      const recipientFilter = new URL(url).searchParams.get("recipient_id") ?? "";
      const recipientId = recipientFilter.replace(/^eq\\./, "") || TEST_USER_ID;

      if (recipientId === TEST_USER_ID && controls.delayNotificationReads) {
        controls.delayedNotificationReads += 1;
        await new Promise((resolve) => controls.notificationReadResolvers.push(resolve));
      }

      await fulfillJson(route, [{
        id: recipientId === TEST_USER_B_ID
          ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
          : "aaaaaaaa-bbbb-4bbb-8bbb-aaaaaaaaaaaa",
        recipient_id: recipientId,
        actor_id: null,
        post_id: null,
        star_letter_id: null,
        content_report_id: null,
        type: "system",
        message: recipientId === TEST_USER_B_ID ? "Bユーザーの通知" : "Aユーザーの通知",
        is_read: false,
        created_at: "2026-08-04T00:00:00.000Z",
      }]);
      return;
    }

'''
if e2e.count(storage_anchor) != 1:
    raise SystemExit(f"e2e storage anchor count: {e2e.count(storage_anchor)}")
e2e = e2e.replace(storage_anchor, notification_route + storage_anchor, 1)

e2e += r'''

test("R.Connectはsession切替後の旧通知応答を捨てruntime errorを出さない", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const controls = await mockVillage(page, {
    delayNotificationReads: true,
    resonanceCount: 0,
    threadLetters: [],
  });
  await page.goto("/");
  await expect.poll(() => controls.delayedNotificationReads).toBeGreaterThan(0);

  const navigation = page.getByRole("navigation", { name: "星空Village bottom navigation" });
  await navigation.getByRole("button", { name: "My Universe", exact: true }).click();
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "村へ帰る", exact: true })).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill("refresh-race-b@example.com");
  await page.getByPlaceholder("6文字以上").fill("password-b");
  await page.getByRole("button", { name: "村へ帰る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bユーザー", exact: true })).toBeVisible();

  await navigation.getByRole("button", { name: "R.Connect", exact: true }).click();
  await expect(page.getByText("Bユーザーの通知", { exact: true })).toBeVisible();
  controls.releaseNotificationReads();
  await page.waitForTimeout(250);
  await expect(page.getByText("Aユーザーの通知", { exact: true })).toHaveCount(0);
  expect(pageErrors.filter((message) => message.includes("isCurrentRequest"))).toEqual([]);
});
'''

e2e_path.write_text(e2e)

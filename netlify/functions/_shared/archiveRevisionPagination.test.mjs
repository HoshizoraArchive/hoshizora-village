import assert from "node:assert/strict";
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

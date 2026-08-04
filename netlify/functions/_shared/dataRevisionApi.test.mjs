import assert from "node:assert/strict";
import test from "node:test";
import {
  readPostEngagementSnapshots,
  readPostSnapshots,
  readStarThreadSnapshots,
} from "../../../src/dataRevisionApi.js";

function createRpcClient() {
  const calls = [];

  return {
    calls,
    rpc(name, args) {
      calls.push({ args, name });
      const ids = args.p_post_ids ?? [];
      return Promise.resolve({
        data: ids.map((postId) => ({ post_id: postId })),
        error: null,
      });
    },
  };
}

test("revision read RPCs split large cross-view entity sets without losing entities", async () => {
  const ids = Array.from({ length: 205 }, (_, index) => `post-${index}`);

  for (const [reader, rpcName] of [
    [readPostSnapshots, "get_post_snapshots_v1"],
    [readPostEngagementSnapshots, "get_post_engagement_snapshots_v1"],
    [readStarThreadSnapshots, "get_star_thread_snapshots_v1"],
  ]) {
    const client = createRpcClient();
    const rows = await reader(client, ids);

    assert.equal(rows.length, ids.length);
    assert.deepEqual(rows.map((row) => row.post_id), ids);
    assert.deepEqual(client.calls.map((call) => call.args.p_post_ids.length), [100, 100, 5]);
    assert.equal(client.calls.every((call) => call.name === rpcName), true);
  }
});

test("revision reads de-duplicate entity IDs before batching", async () => {
  const client = createRpcClient();
  const rows = await readPostSnapshots(client, ["post-1", "post-1", null, "post-2"]);

  assert.deepEqual(rows, [{ post_id: "post-1" }, { post_id: "post-2" }]);
  assert.equal(client.calls.length, 1);
});

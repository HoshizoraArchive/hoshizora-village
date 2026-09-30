import assert from "node:assert/strict";
import test from "node:test";
import { isPinnedPost, orderPostsWithPinnedFirst } from "./pinnedPosts.mjs";

test("orderPostsWithPinnedFirst keeps the pinned post first even when it is older", () => {
  const rows = [
    { id: "newest", created_at: "2026-09-30T10:00:00Z" },
    { id: "pinned", created_at: "2026-01-01T00:00:00Z" },
    { id: "middle", created_at: "2026-09-01T00:00:00Z" },
  ];

  assert.deepEqual(
    orderPostsWithPinnedFirst(rows, "pinned").map((row) => row.id),
    ["pinned", "newest", "middle"],
  );
});

test("orderPostsWithPinnedFirst preserves newest-first ordering for the remaining posts", () => {
  const rows = [
    { post_id: "older", created_at: "2026-08-01T00:00:00Z" },
    { post_id: "newer", created_at: "2026-09-01T00:00:00Z" },
  ];

  assert.deepEqual(
    orderPostsWithPinnedFirst(rows, null).map((row) => row.post_id),
    ["newer", "older"],
  );
});

test("isPinnedPost accepts both post snapshot ids and ordinary post ids", () => {
  assert.equal(isPinnedPost({ id: "one" }, "one"), true);
  assert.equal(isPinnedPost({ post_id: "two" }, "two"), true);
  assert.equal(isPinnedPost({ id: "three" }, "two"), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260727173000_guard_onboarding_existing_posts.sql",
  "utf8",
);

test("オンボーディング開始前の既存投稿では初投稿案内を完了しない", () => {
  assert.equal(migration.includes("p.created_at >= v_progress.created_at"), true);
  assert.equal(migration.includes("existing_post_detected"), false);
  assert.equal(
    migration.includes("advance_initial_onboarding existing_post_detected branch did not match expected definition"),
    true,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  "supabase/migrations/20260804140058_fix_archive_snapshot_ambiguity.sql",
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

test("Archive snapshot follow-up qualifies post_id inside PL/pgSQL batching CTE", () => {
  assert.match(
    sql,
    /array_agg\( numbered_candidates\.post_id order by numbered_candidates\.post_id \) as post_ids/,
  );
  assert.match(sql, /group by numbered_candidates\.batch_number/);
  assert.doesNotMatch(sql, /array_agg\(post_id order by post_id\)/);
});

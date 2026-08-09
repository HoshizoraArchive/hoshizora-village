import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  "supabase/migrations/20260809154500_auto_enroll_new_beta_residents.sql",
  "utf8",
);

test("only newly inserted human profile kinds are automatically added to beta_resident", () => {
  assert.match(migrationSql, /after insert or update of kind on public\.profile_kinds/i);
  assert.match(migrationSql, /if tg_op = 'INSERT' and new\.kind = 'human' then/i);
  assert.match(migrationSql, /insert into public\.profile_cohorts \(profile_id, cohort_key\)/i);
  assert.match(migrationSql, /values \(new\.profile_id, 'beta_resident'\)/i);
  assert.match(migrationSql, /on conflict \(profile_id, cohort_key\) do nothing/i);
});

test("profiles changed to AI residents are removed from beta_resident", () => {
  assert.match(migrationSql, /tg_op = 'UPDATE'/i);
  assert.match(migrationSql, /old\.kind is distinct from new\.kind/i);
  assert.match(migrationSql, /new\.kind = 'ai_resident'/i);
  assert.match(migrationSql, /delete from public\.profile_cohorts/i);
  assert.match(migrationSql, /cohort_key = 'beta_resident'/i);
});

test("migration does not backfill or touch existing non-beta human rows", () => {
  assert.doesNotMatch(migrationSql, /insert into public\.profile_cohorts[\s\S]*select[\s\S]*from public\.profile_kinds/i);
  assert.doesNotMatch(migrationSql, /update public\.profile_kinds/i);
  assert.doesNotMatch(migrationSql, /tg_op = 'UPDATE'[\s\S]*new\.kind = 'human'/i);
});

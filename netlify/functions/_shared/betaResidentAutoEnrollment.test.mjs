import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  "supabase/migrations/20260809154500_auto_enroll_new_beta_residents.sql",
  "utf8",
);

test("new human profiles are automatically added to the beta_resident cohort", () => {
  assert.match(migrationSql, /after insert or update of kind on public\.profile_kinds/i);
  assert.match(migrationSql, /if new\.kind = 'human' then/i);
  assert.match(migrationSql, /insert into public\.profile_cohorts \(profile_id, cohort_key\)/i);
  assert.match(migrationSql, /values \(new\.profile_id, 'beta_resident'\)/i);
  assert.match(migrationSql, /on conflict \(profile_id, cohort_key\) do nothing/i);
});

test("AI residents are not left in the beta_resident cohort", () => {
  assert.match(migrationSql, /elsif new\.kind = 'ai_resident' then/i);
  assert.match(migrationSql, /delete from public\.profile_cohorts/i);
  assert.match(migrationSql, /cohort_key = 'beta_resident'/i);
});

test("migration does not backfill existing non-beta human profiles", () => {
  assert.doesNotMatch(migrationSql, /insert into public\.profile_cohorts[\s\S]*select[\s\S]*from public\.profile_kinds/i);
  assert.doesNotMatch(migrationSql, /update public\.profile_kinds/i);
});

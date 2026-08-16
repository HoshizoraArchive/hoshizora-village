import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260816095022_auto_grant_opening_memorial_to_new_beta_residents.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

function includes(fragment) {
  assert.ok(migration.includes(fragment), `migration is missing: ${fragment}`);
}

test("new beta_resident rows automatically receive Opening Memorial", () => {
  includes("profile_cohorts_grant_opening_memorial");
  includes("after insert on public.profile_cohorts");
  includes("when (new.cohort_key = 'beta_resident')");
  includes("'opening_memorial_beta'");
  includes("on conflict (profile_id, frame_id) do nothing");
});

test("existing active frames are not overwritten", () => {
  includes("profile.active_frame_id is null");
});

test("missing or inactive Opening Memorial never blocks joining", () => {
  includes("frame.is_active is true");
  includes("if target_frame_id is null then\n    return new;");
});

test("migration backfills beta residents missed by the original rollout", () => {
  includes("grant_opening_memorial_to_beta_residents()");
});

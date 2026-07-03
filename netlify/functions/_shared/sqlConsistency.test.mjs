import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const migrationSql = readFileSync("supabase/migrations/20260703_add_ai_observation_security_foundation.sql", "utf8");

const requiredTokens = [
  "public.ai_observation_job_status",
  "public.ai_observation_jobs",
  "ai_observation_jobs_attempts_check",
  "ai_observation_jobs_one_active_per_post_resident_idx",
  "ai_observation_jobs_one_success_per_post_resident_idx",
  "public.reserve_ai_observation_job",
  "app_private.ai_observation_billable_cost_micro_usd",
  "app_private.storage_path_belongs_to_owner",
  "post_media_storage_path_owner_check",
  "post_media_thumbnail_storage_path_owner_check",
];

test("AI security migration and schema.sql contain the same critical DB elements", () => {
  for (const token of requiredTokens) {
    assert.equal(migrationSql.includes(token), true, `migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }
});

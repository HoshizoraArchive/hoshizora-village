import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20261007102226_harden_chia_star_letter_reply_budget.sql",
  import.meta.url,
);
const sql = readFileSync(migrationUrl, "utf8");

test("Chia reply budget serializes rolling provider-call claims in the database", () => {
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /sum\(run\.attempts\)/i);
  assert.match(sql, /now\(\)\s*-\s*interval '24 hours'/i);
  assert.match(sql, /'outcome',\s*'daily_limit'/i);
  assert.match(sql, /claim_chia_star_letter_reply_run_uncapped/i);
});

test("old and new service-role entrypoints stay capped while uncapped primitive is hidden", () => {
  assert.match(
    sql,
    /grant execute on function public\.claim_chia_star_letter_reply_run_v2\(uuid, uuid, integer\)\s+to service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.claim_chia_star_letter_reply_run\(uuid, uuid\)\s+to service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.claim_chia_star_letter_reply_run_uncapped\(uuid, uuid\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /select public\.claim_chia_star_letter_reply_run_v2\(\s*p_source_star_letter_id,\s*p_chia_profile_id,\s*50\s*\)/i,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260823223803_harden_post_resonance_rate_limit.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const appSource = readFileSync("src/App.jsx", "utf8");
const dataApiSource = readFileSync("src/dataRevisionApi.js", "utf8");

function normalizedSql(sql) {
  return sql.replace(/\s+/g, " ");
}

function assertRateLimitContract(sql, sourceName) {
  const normalized = normalizedSql(sql);

  assert.match(
    normalized,
    /create (?:or replace )?function public\.add_post_resonance_v1\( p_post_id uuid, p_resonance_type text default 'sparkle' \)/i,
    `${sourceName} must replace the canonical resonance RPC`,
  );
  assert.match(
    normalized,
    /v_user_id uuid := auth\.uid\(\)/i,
    `${sourceName} must derive the actor from auth.uid()`,
  );
  assert.match(
    normalized,
    /pg_catalog\.pg_advisory_xact_lock\( pg_catalog\.hashtextextended\('post_resonance:' \|\| v_user_id::text, 0\) \)/i,
    `${sourceName} must serialize concurrent requests for the authenticated user`,
  );
  assert.match(
    normalized,
    /r\.profile_id = v_user_id and r\.created_at >= now\(\) - interval '60 seconds'[\s\S]*offset 59 limit 1/i,
    `${sourceName} must enforce the 60-per-60-second user window`,
  );
  assert.match(
    normalized,
    /r\.profile_id = v_user_id and r\.post_id = p_post_id and r\.created_at >= now\(\) - interval '10 seconds'[\s\S]*offset 19 limit 1/i,
    `${sourceName} must enforce the 20-per-10-second user/post window`,
  );
  assert.match(
    normalized,
    /raise exception 'resonance rate limit exceeded' using errcode = 'P0001'/i,
    `${sourceName} must reject before the resonance insert`,
  );
  assert.match(
    normalized,
    /create index if not exists resonances_profile_created_at_idx on public\.resonances \(profile_id, created_at desc\)/i,
    `${sourceName} must add the bounded-window lookup index`,
  );
  assert.match(
    normalized,
    /revoke insert on table public\.resonances from public, anon, authenticated/i,
    `${sourceName} must close the old direct INSERT grant`,
  );
  assert.match(
    normalized,
    /drop policy if exists resonances_insert_logged_in on public\.resonances/i,
    `${sourceName} must remove the old direct INSERT policy`,
  );
}

test("post resonance RPC has a race-safe DB throttle in migration and canonical schema", () => {
  assertRateLimitContract(migrationSql, migrationPath);
  assertRateLimitContract(schemaSql, "supabase/schema.sql");
});

test("browser writes remain on the authenticated RPC and do not retry automatically", () => {
  assert.match(dataApiSource, /runRpc\(client, "add_post_resonance_v1"/);
  assert.doesNotMatch(appSource, /\.from\("resonances"\)[\s\S]{0,200}\.insert\(/);
  assert.doesNotMatch(dataApiSource, /retry|backoff/i);
  assert.match(appSource, /disabled=\{isResonanceSaving \|\| !resonance\?\.onResonate\}/);
});

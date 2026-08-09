import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  "supabase/migrations/20260809123000_add_beta_usage_dashboard.sql",
  "utf8",
);
const mainSource = readFileSync("src/main.jsx", "utf8");
const dashboardSource = readFileSync("src/BetaUsageAdminApp.jsx", "utf8");

test("beta usage dashboard RPC is admin-only and reads the existing beta cohort", () => {
  assert.match(migrationSql, /if not public\.is_app_admin\(\) then/);
  assert.match(migrationSql, /pc\.cohort_key = 'beta_resident'/);
  assert.match(migrationSql, /public\.app_open_events/);
  assert.match(migrationSql, /e\.opened_at >= v_start/);
  assert.match(migrationSql, /e\.opened_at < v_end/);
});

test("beta usage dashboard RPC is not exposed to anon", () => {
  assert.match(
    migrationSql,
    /revoke all on function public\.get_beta_usage_dashboard\(date\) from public, anon;/,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.get_beta_usage_dashboard\(date\) to authenticated;/,
  );
});

test("beta usage dashboard uses app_open_events instead of inferred activity", () => {
  assert.match(dashboardSource, /get_beta_usage_dashboard/);
  assert.match(dashboardSource, /app_open_events/);
  assert.doesNotMatch(dashboardSource, /refresh_token/i);
  assert.doesNotMatch(dashboardSource, /resonances/);
});

test("beta usage dashboard has a dedicated admin route", () => {
  assert.match(mainSource, /\/admin\/beta-usage/);
  assert.match(mainSource, /BetaUsageAdminApp/);
});

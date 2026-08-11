import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  "supabase/migrations/20260809044223_add_signup_open_tracking.sql",
  "utf8",
);
const trackingSource = readFileSync("src/signupOpenTracking.js", "utf8");
const adminSource = readFileSync("src/SignupOpenAdminApp.jsx", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("signup screen open tracking stores no account identity and dedupes each browser session", () => {
  assert.match(migrationSql, /create table if not exists public\.signup_open_events/);
  assert.match(migrationSql, /visitor_id uuid not null/);
  assert.match(migrationSql, /unique \(visitor_id\)/);
  assert.doesNotMatch(migrationSql, /email\s+text/i);
  assert.doesNotMatch(migrationSql, /ip_address/i);
  assert.doesNotMatch(migrationSql, /user_agent/i);
});

test("anonymous clients can record but cannot read signup open events", () => {
  assert.match(migrationSql, /revoke all on table public\.signup_open_events from public, anon, authenticated;/);
  assert.match(
    migrationSql,
    /grant execute on function public\.record_signup_open\(uuid, text, text, timestamptz\) to anon, authenticated;/,
  );
  assert.doesNotMatch(migrationSql, /grant select on table public\.signup_open_events to anon/i);
});

test("signup tracking records the actual signup tab click once per session", () => {
  assert.match(trackingSource, /入村手続き（会員登録）/);
  assert.match(trackingSource, /sessionStorage/);
  assert.match(trackingSource, /record_signup_open/);
  assert.match(trackingSource, /RECORDED_STORAGE_KEY/);
  assert.match(trackingSource, /document\.addEventListener\("click", handleDocumentClick\)/);
});

test("signup open dashboard is admin-only and grouped by Japan day", () => {
  assert.match(migrationSql, /if not public\.is_app_admin\(\) then/);
  assert.match(migrationSql, /time zone 'Asia\/Tokyo'/);
  assert.match(migrationSql, /revoke all on function public\.get_signup_open_dashboard\(date\) from public, anon;/);
  assert.match(migrationSql, /grant execute on function public\.get_signup_open_dashboard\(date\) to authenticated;/);
  assert.match(adminSource, /get_signup_open_dashboard/);
});

test("signup tracking and its admin route are wired into the app entrypoint", () => {
  assert.match(mainSource, /import "\.\/signupOpenTracking\.js";/);
  assert.match(mainSource, /\/admin\/signup-opens/);
  assert.match(mainSource, /SignupOpenAdminApp/);
  assert.match(mainSource, /import "\.\/betaUsageAdminEntry\.js";/);
});

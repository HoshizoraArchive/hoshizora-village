import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationSql = readFileSync(
  new URL("supabase/migrations/20260903175156_secure_public_profile_columns.sql", repositoryRoot),
  "utf8",
);
const appSource = readFileSync(new URL("src/App.jsx", repositoryRoot), "utf8");
const chiaSource = readFileSync(new URL("src/chiaPostNotifications.js", repositoryRoot), "utf8");

function readSourceTree(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) return readSourceTree(entryUrl);
      if (!/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) return [];
      return [readFileSync(entryUrl, "utf8")];
    })
    .join("\n");
}

const browserSource = readSourceTree(new URL("src/", repositoryRoot));

test("profiles expose only the seven public browser columns", () => {
  assert.match(
    migrationSql,
    /revoke select on table public\.profiles from public, anon, authenticated/i,
  );
  assert.match(
    migrationSql,
    /grant select \(\s*id,\s*display_name,\s*username,\s*avatar_url,\s*bio,\s*constellation_note,\s*active_frame_id\s*\) on table public\.profiles to anon, authenticated/is,
  );

  const publicGrant = migrationSql.match(
    /grant select \(([^)]+)\) on table public\.profiles to anon, authenticated/is,
  )?.[1];
  assert.ok(publicGrant);
  for (const privateColumn of [
    "notify_authors_when_i_archive",
    "notify_authors_when_i_resonate",
    "notify_chia_posts",
  ]) {
    assert.doesNotMatch(publicGrant, new RegExp(`\\b${privateColumn}\\b`, "i"));
  }
});

test("own notification settings RPC is argument-free and authenticated-only", () => {
  assert.match(
    migrationSql,
    /create or replace function public\.get_own_profile_notification_settings_v1\(\)/i,
  );
  assert.match(migrationSql, /security definer\s+set search_path = ''/i);
  assert.match(migrationSql, /where profile\.id = \(select auth\.uid\(\)\)/i);
  assert.match(
    migrationSql,
    /revoke all on function public\.get_own_profile_notification_settings_v1\(\)\s+from public, anon, authenticated, service_role/is,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.get_own_profile_notification_settings_v1\(\)\s+to authenticated/is,
  );
});

test("browser reads private profile settings only through the own-user RPC", () => {
  assert.doesNotMatch(
    browserSource,
    /\.select\(["'`]notify_(?:authors_when_i_(?:archive|resonate)|chia_posts)["'`]\)/,
  );
  assert.doesNotMatch(appSource, /\.select\(`id, \$\{field\}`\)/);
  assert.match(appSource, /\.rpc\("get_own_profile_notification_settings_v1"\)/);
  assert.match(chiaSource, /\.rpc\("get_own_profile_notification_settings_v1"\)/);
});

test("browser profiles queries never use wildcard SELECT", () => {
  assert.doesNotMatch(
    browserSource,
    /\.from\(["']profiles["']\)[\s\S]{0,160}?\.select\(\s*(?:["']\*["'])?\s*\)/,
  );
});

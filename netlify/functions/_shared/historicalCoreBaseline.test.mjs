import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationsDirectory = new URL("supabase/migrations/", repositoryRoot);
const baselineFilename = "20260524_historical_core_baseline.sql";
const baselinePath = new URL(`supabase/migrations/${baselineFilename}`, repositoryRoot);
const notificationsPath = new URL(
  "supabase/migrations/20260525_add_notifications.sql",
  repositoryRoot,
);
const configPath = new URL("supabase/config.toml", repositoryRoot);

const canonicalSource = {
  commit: "579dc0fe4f288d0b0f55d5cdc87f164173804e85",
  gitBlob: "9ded8b73b0b4edcdda99f82391a51ff66b49676b",
  bytes: 20_112,
  sha256: "c0c03a381d5bc2752b0d5dea81068a06ca4f3a19a08086fc376efaf52c98600a",
};

const coreTables = [
  "profiles",
  "posts",
  "profile_tags",
  "post_tags",
  "resonances",
  "star_letters",
  "archives",
  "observations",
];

const migrationFilenames = readdirSync(migrationsDirectory, { encoding: "utf8" })
  .filter((filename) => filename.endsWith(".sql"))
  .sort();
const migrationVersions = migrationFilenames.map((filename) => filename.split("_", 1)[0]);
const baselineBytes = readFileSync(baselinePath);
const baselineSql = baselineBytes.toString("utf8");
const notificationsSql = readFileSync(notificationsPath, "utf8");
const config = readFileSync(configPath, "utf8");

test("historical core baseline is the canonical audited Git blob", () => {
  assert.equal(baselineBytes.byteLength, canonicalSource.bytes);
  assert.equal(createHash("sha256").update(baselineBytes).digest("hex"), canonicalSource.sha256);

  assert.match(canonicalSource.commit, /^[0-9a-f]{40}$/);
  assert.match(canonicalSource.gitBlob, /^[0-9a-f]{40}$/);
});

test("historical baseline is the oldest unique migration", () => {
  assert.equal(migrationFilenames.length, 71);
  assert.equal(new Set(migrationVersions).size, 71);
  assert.equal(migrationFilenames[0], baselineFilename);
  assert.equal(migrationFilenames.at(-1), "20260813180000_fix_ai_resident_mention_validation.sql");
});

test("historical baseline creates exactly the eight pre-notification core tables", () => {
  const createdTables = [...baselineSql.matchAll(/create table if not exists public\.([a-z0-9_]+)\s*\(/gi)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(createdTables, [...coreTables].sort());
  assert.match(baselineSql, /create extension if not exists "pgcrypto";/i);
  assert.match(baselineSql, /create or replace function public\.set_updated_at\(\)/i);
  assert.doesNotMatch(baselineSql, /\bpublic\.notifications\b/i);
  assert.doesNotMatch(baselineSql, /\bapp_private\b/i);
  assert.doesNotMatch(baselineSql, /\bstorage\.buckets\b/i);
});

test("20260525 notification migration receives every required baseline object", () => {
  for (const objectName of ["profiles", "posts", "resonances"]) {
    assert.match(notificationsSql, new RegExp(`public\\.${objectName}\\b`, "i"));
    assert.match(baselineSql, new RegExp(`create table if not exists public\\.${objectName}\\b`, "i"));
  }
});

test("later normal migrations do not recreate historical core tables", () => {
  for (const filename of migrationFilenames.slice(1)) {
    const sql = readFileSync(new URL(`supabase/migrations/${filename}`, repositoryRoot), "utf8");
    for (const tableName of coreTables) {
      assert.doesNotMatch(
        sql,
        new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}\\b`, "i"),
        `${filename} recreates baseline table public.${tableName}`,
      );
    }
  }
});

test("historical baseline contains no identity, secret, or top-level DML literals", () => {
  const emailLiteral = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const uuidValueLiteral = /['"][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"]/i;
  const jwtLiteral = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
  const keyLiteral = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/i;
  const privateKey = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/;
  const topLevelDml = /^\s*(?:insert\s+into|update\s+|delete\s+from)\b/im;

  assert.doesNotMatch(baselineSql, emailLiteral);
  assert.doesNotMatch(baselineSql, uuidValueLiteral);
  assert.doesNotMatch(baselineSql, jwtLiteral);
  assert.doesNotMatch(baselineSql, keyLiteral);
  assert.doesNotMatch(baselineSql, privateKey);
  assert.doesNotMatch(baselineSql, topLevelDml);
});

test("local Supabase config cannot select a hosted Hoshizora project", () => {
  assert.match(config, /^project_id = "hoshizora-village-local"$/m);
  assert.match(config, /^enabled = true$/m);
  assert.match(config, /^auto_expose_new_tables = true$/m);
  assert.match(config, /^major_version = 17$/m);
  assert.match(config, /^\[db\.seed\]\nenabled = false$/m);
  assert.doesNotMatch(config, /dhfecpymvmursozfgjlr|qskeezefmvnutuzpevbc/);
  assert.doesNotMatch(config, /\b(?:password|secret|api_key|access_token)\s*=\s*"[^"\n]+"/i);
});

test("Preview baseline remains outside canonical migration discovery", () => {
  for (const filename of migrationFilenames) {
    assert.equal(filename.includes("preview-baseline"), false);
  }

  const migrationDirectoryPath = fileURLToPath(migrationsDirectory);
  assert.equal(migrationDirectoryPath.endsWith("/supabase/migrations/"), true);
});

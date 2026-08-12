import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260807063919_add_profile_identity_roles_and_beta_cohorts.sql";
const migrationBytes = readFileSync(migrationPath);
const migrationSql = migrationBytes.toString("utf8");
const schemaSql = readFileSync("supabase/schema.sql", "utf8");

const remoteAuditMetadata = Object.freeze({
  version: "20260807063919",
  name: "add_profile_identity_roles_and_beta_cohorts",
  statementCount: 1,
  byteLength: 5413,
  md5: "a82489cc049e024db05b3a1537753ab1",
  sha256: "ec86fd7c33bf11e2bb5c5331252d51296589bfff6bc2e647d1090c3c3f73b62f",
});

const localSanitizedSha256 = "09b2b0c607e165f2726b7a15df100d115bdd929bbfc42874fe36f52859101e36";
const forbiddenIdentityLiteralHashPrefixes = [
  "9687d09ac0ff",
  "fe8fa4de8ed2",
  "a694b7f13e55",
  "0be5dd8f5b06",
  "a6ae87b6d29d",
  "3af5ef7d469c",
  "f36f4a3af2b5",
  "3801fde04fb3",
];

function normalizedSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function withoutFunctionBodies(sql) {
  return sql.replace(
    /create\s+or\s+replace\s+function\b[\s\S]*?\bas\s+\$\$[\s\S]*?\$\$\s*;/gi,
    "",
  );
}

test("migration identity records remote audit metadata without claiming raw equality", () => {
  assert.equal(
    basename(migrationPath),
    `${remoteAuditMetadata.version}_${remoteAuditMetadata.name}.sql`,
  );
  assert.equal(remoteAuditMetadata.statementCount, 1);
  assert.equal(remoteAuditMetadata.byteLength, 5413);
  assert.equal(remoteAuditMetadata.md5, "a82489cc049e024db05b3a1537753ab1");
  assert.equal(
    remoteAuditMetadata.sha256,
    "ec86fd7c33bf11e2bb5c5331252d51296589bfff6bc2e647d1090c3c3f73b62f",
  );

  const localHash = sha256(migrationBytes);
  assert.equal(localHash, localSanitizedSha256);
  assert.notEqual(localHash, remoteAuditMetadata.sha256);
  assert.match(migrationSql, /Replay-safe reconstruction for Production ledger version 20260807063919/);
  assert.match(migrationSql, /This is not the exact Production statement/);
  assert.match(migrationSql, /environment-specific identity assignments are intentionally omitted/);
});

test("reconstructed migration and final schema keep the profile identity schema contract", () => {
  const requiredTokens = [
    "create table if not exists public.profile_kinds",
    "profile_id uuid primary key references public.profiles(id) on delete cascade",
    "kind text not null default 'human' check (kind in ('human', 'ai_resident'))",
    "create table if not exists public.profile_roles",
    "role_key text not null check (role_key ~ '^[a-z0-9_]+$')",
    "primary key (profile_id, role_key)",
    "create table if not exists public.profile_cohorts",
    "serial_number integer check (serial_number is null or serial_number > 0)",
    "create unique index if not exists profile_cohorts_unique_serial",
    "where serial_number is not null",
    "alter table public.profile_kinds enable row level security",
    "alter table public.profile_roles enable row level security",
    "alter table public.profile_cohorts enable row level security",
    "grant select on table public.profile_kinds to anon, authenticated",
    "grant select on table public.profile_roles to anon, authenticated",
    "grant select on table public.profile_cohorts to anon, authenticated",
    "grant all on table public.profile_kinds to service_role",
    "grant all on table public.profile_roles to service_role",
    "grant all on table public.profile_cohorts to service_role",
    "create or replace function public.ensure_default_profile_kind()",
    "security definer",
    "set search_path = public",
    "grant execute on function public.ensure_default_profile_kind() to service_role",
    "create trigger ensure_default_profile_kind_after_profile_insert",
    "after insert on public.profiles",
    "for each row execute function public.ensure_default_profile_kind()",
  ];

  for (const token of requiredTokens) {
    assert.equal(migrationSql.includes(token), true, `migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing ${token}`);
  }

  for (const table of ["profile_kinds", "profile_roles", "profile_cohorts"]) {
    assert.match(
      migrationSql,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"),
    );
    assert.match(
      migrationSql,
      new RegExp(`create policy ${table}_select_public[\\s\\S]*?on public\\.${table} for select to anon, authenticated`, "i"),
    );
  }

  assert.equal(
    [...migrationSql.matchAll(/^create policy profile_(?:kinds|roles|cohorts)_select_public/gim)].length,
    3,
  );
  assert.equal(
    [...migrationSql.matchAll(/^comment on (?:table|column) public\.profile_(?:kinds|roles|cohorts)/gim)].length,
    6,
  );
});

test("privacy boundary excludes value identifiers and every audited identity literal", () => {
  assert.doesNotMatch(migrationSql, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  assert.doesNotMatch(
    migrationSql,
    /'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/i,
  );
  assert.doesNotMatch(migrationSql, /\busername\s*(?:=|in\s*\()/i);
  assert.doesNotMatch(migrationSql, /\bauth\.users\b/i);

  const quotedLiterals = migrationSql.match(/'(?:''|[^'])*'/g) ?? [];
  const literalHashes = quotedLiterals.map(sha256);
  for (const prefix of forbiddenIdentityLiteralHashPrefixes) {
    assert.equal(
      literalHashes.some((hash) => hash.startsWith(prefix)),
      false,
      `forbidden identity literal hash ${prefix} found`,
    );
  }
});

test("top-level DML is limited to the two generic relational backfills", () => {
  const topLevelSql = withoutFunctionBodies(migrationSql);
  const dmlStatements = [
    ...topLevelSql.matchAll(/^\s*(insert|update|delete)\b[\s\S]*?;/gim),
  ].map((match) => normalizedSql(match[0]));

  assert.equal(dmlStatements.length, 2);
  assert.deepEqual(
    dmlStatements.map((statement) => statement.match(/^(insert|update|delete)/i)?.[1].toLowerCase()),
    ["insert", "insert"],
  );
  assert.match(
    dmlStatements[0],
    /^insert into public\.profile_kinds \(profile_id, kind\) select profile\.id, 'human' from public\.profiles profile on conflict \(profile_id\) do nothing;$/i,
  );
  assert.match(
    dmlStatements[1],
    /^insert into public\.profile_roles \(profile_id, role_key\) select admin_user\.user_id, 'admin' from public\.app_admins admin_user join public\.profiles profile on profile\.id = admin_user\.user_id on conflict \(profile_id, role_key\) do nothing;$/i,
  );
  assert.doesNotMatch(topLevelSql, /^\s*update\b/gim);
  assert.doesNotMatch(topLevelSql, /^\s*delete\b/gim);
  assert.doesNotMatch(topLevelSql, /insert into public\.profile_cohorts/i);
});

test("final schema includes later beta enrollment behavior", () => {
  const laterMigrationSql = readFileSync(
    "supabase/migrations/20260809045133_auto_enroll_new_beta_residents.sql",
    "utf8",
  );
  const tokens = [
    "create or replace function app_private.sync_beta_resident_cohort_from_profile_kind()",
    "if tg_op = 'INSERT' and new.kind = 'human' then",
    "insert into public.profile_cohorts (profile_id, cohort_key)",
    "values (new.profile_id, 'beta_resident')",
    "new.kind = 'ai_resident'",
    "delete from public.profile_cohorts",
    "create trigger profile_kinds_sync_beta_resident",
    "after insert or update of kind on public.profile_kinds",
  ];

  for (const token of tokens) {
    assert.equal(laterMigrationSql.includes(token), true, `later migration missing ${token}`);
    assert.equal(schemaSql.includes(token), true, `schema.sql missing final-state token ${token}`);
  }
});

test("later migrations are ordered after and depend on the reconstructed foundation", () => {
  const chain = [
    migrationPath,
    "supabase/migrations/20260807103108_add_beta_opening_memorial_frame.sql",
    "supabase/migrations/20260809041544_add_beta_usage_dashboard.sql",
    "supabase/migrations/20260809044223_add_signup_open_tracking.sql",
    "supabase/migrations/20260809045133_auto_enroll_new_beta_residents.sql",
    "supabase/migrations/20260810013137_add_chia_post_notifications.sql",
  ];
  const versions = chain.map((path) => basename(path).match(/^(\d+)_/)?.[1]);

  assert.deepEqual(versions, [...versions].sort());
  for (const path of chain) {
    assert.doesNotThrow(() => readFileSync(path));
  }

  assert.match(readFileSync(chain[1], "utf8"), /from public\.profile_cohorts/i);
  assert.match(readFileSync(chain[2], "utf8"), /from public\.profile_cohorts/i);
  assert.match(readFileSync(chain[4], "utf8"), /on public\.profile_kinds/i);
  assert.match(readFileSync(chain[5], "utf8"), /join public\.profile_kinds/i);
});

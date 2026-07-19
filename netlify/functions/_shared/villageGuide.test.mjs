import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildVillageGuideTree,
  getFallbackVillageGuideRows,
  validateVillageGuideEntryInput,
  validateVillageGuideSectionInput,
} from "../../../src/villageGuide.js";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20260719130000_add_editable_village_guide.sql", repositoryRoot);
const schemaUrl = new URL("supabase/schema.sql", repositoryRoot);
const appUrl = new URL("src/App.jsx", repositoryRoot);
const adminUiUrl = new URL("src/VillageGuideAdmin.jsx", repositoryRoot);
const verificationUrl = new URL("docs/village-guide-verification.sql", repositoryRoot);

test("fallback preserves the current guide hierarchy and adds the planned AI resident item first", () => {
  const rows = getFallbackVillageGuideRows();
  const tree = buildVillageGuideTree(rows.sections, rows.entries);

  assert.deepEqual(
    tree.map((section) => section.title),
    [
      "星空Villageとは",
      "まずやってみること",
      "今できること",
      "これから増える予定",
      "ベータテストで試してほしいこと",
      "不具合・要望の送り方",
      "先行テスト版について",
    ],
  );

  const available = tree.find((section) => section.section_key === "available_now");
  assert.deepEqual(
    available.children.map((section) => section.title),
    [
      "アカウントとプロフィール",
      "流星便を届ける",
      "観測してつながる",
      "星空ちあAI住人",
      "スマホ利用とサポート",
    ],
  );

  const planned = tree.find((section) => section.section_key === "planned_features");
  assert.equal(planned.entries[0].entry_key, "planned_ai_residents");
  assert.equal(planned.entries[0].body, "星空ちあ以外の、新しいAI住人たちの登場");
  assert.equal(rows.sections.length, 12);
  assert.equal(rows.entries.length, 59);
});

test("public guide tree excludes hidden entries, hidden sections, and descendants of hidden sections", () => {
  const rows = getFallbackVillageGuideRows();
  rows.entries.find((entry) => entry.entry_key === "planned_audio").is_visible = false;
  rows.sections.find((section) => section.section_key === "available_now").is_visible = false;

  const tree = buildVillageGuideTree(rows.sections, rows.entries);
  assert.equal(tree.some((section) => section.section_key === "available_now"), false);
  assert.equal(tree.some((section) => section.section_key === "available_account_profile"), false);
  assert.equal(
    tree.find((section) => section.section_key === "planned_features").entries.some((entry) => entry.entry_key === "planned_audio"),
    false,
  );

  const rlsVisibleSections = rows.sections.filter((section) => section.is_visible);
  const rlsTree = buildVillageGuideTree(rlsVisibleSections, rows.entries);
  assert.equal(rlsTree.some((section) => section.section_key === "available_account_profile"), false);
});

test("single-row add, edit, reorder, hide, and delete operations are reflected by the tree", () => {
  const rows = getFallbackVillageGuideRows();
  const plannedSection = rows.sections.find((section) => section.section_key === "planned_features");
  rows.entries.push({
    id: "planned_new_test",
    section_id: plannedSection.id,
    entry_key: "planned_new_test",
    entry_type: "list_item",
    body: "新しい予定",
    sort_order: 15,
    is_visible: true,
  });

  let planned = buildVillageGuideTree(rows.sections, rows.entries).find(
    (section) => section.section_key === "planned_features",
  );
  assert.deepEqual(planned.entries.slice(0, 3).map((entry) => entry.entry_key), [
    "planned_ai_residents",
    "planned_new_test",
    "planned_audio",
  ]);

  rows.entries.find((entry) => entry.entry_key === "planned_new_test").body = "更新した予定";
  rows.entries.find((entry) => entry.entry_key === "planned_new_test").sort_order = 5;
  planned = buildVillageGuideTree(rows.sections, rows.entries).find(
    (section) => section.section_key === "planned_features",
  );
  assert.equal(planned.entries[0].body, "更新した予定");

  rows.entries.find((entry) => entry.entry_key === "planned_new_test").is_visible = false;
  planned = buildVillageGuideTree(rows.sections, rows.entries).find(
    (section) => section.section_key === "planned_features",
  );
  assert.equal(planned.entries.some((entry) => entry.entry_key === "planned_new_test"), false);

  rows.entries = rows.entries.filter((entry) => entry.entry_key !== "planned_new_test");
  planned = buildVillageGuideTree(rows.sections, rows.entries).find(
    (section) => section.section_key === "planned_features",
  );
  assert.equal(planned.entries.some((entry) => entry.entry_key === "planned_new_test"), false);
});

test("guide input validation rejects blank and oversized values", () => {
  assert.equal(validateVillageGuideSectionInput(""), "セクション名を入力してください。");
  assert.equal(validateVillageGuideSectionInput("案内"), "");
  assert.match(validateVillageGuideSectionInput("あ".repeat(121)), /120文字以内/);
  assert.equal(validateVillageGuideEntryInput(""), "文章を入力してください。");
  assert.equal(validateVillageGuideEntryInput("案内文"), "");
  assert.match(validateVillageGuideEntryInput("あ".repeat(2001)), /2000文字以内/);
});

test("migration and schema keep guide security, audit, seed, and grants in sync", async () => {
  const [migration, schema] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);
  const fallback = getFallbackVillageGuideRows();

  for (const sql of [migration, schema]) {
    assert.match(sql, /create table if not exists public\.app_admins/);
    assert.match(sql, /create table if not exists public\.guide_sections/);
    assert.match(sql, /create table if not exists public\.guide_entries/);
    assert.match(sql, /create or replace function public\.is_app_admin\(\)/);
    assert.match(sql, /security definer\s+set search_path = ''/);
    assert.match(sql, /alter table public\.guide_sections enable row level security/);
    assert.match(sql, /alter table public\.guide_entries enable row level security/);
    assert.match(sql, /guide_sections_admin_(?:insert|update|delete)/);
    assert.match(sql, /guide_entries_admin_(?:insert|update|delete)/);
    assert.match(sql, /revoke all on table public\.app_admins from public, anon, authenticated/);
    assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all).*public\.app_admins to (?:anon|authenticated)/i);
    assert.match(sql, /new\.updated_by := \(select auth\.uid\(\)\)/);
    assert.match(sql, /planned_ai_residents/);
    assert.match(sql, /星空ちあ以外の、新しいAI住人たちの登場/);

    for (const section of fallback.sections) {
      assert.equal(sql.includes(`'${section.section_key}'`), true, `missing section seed: ${section.section_key}`);
      assert.equal(sql.includes(`'${section.title}'`), true, `missing section title: ${section.section_key}`);
    }

    for (const entry of fallback.entries) {
      assert.equal(sql.includes(`'${entry.entry_key}'`), true, `missing entry seed: ${entry.entry_key}`);
      assert.equal(sql.includes(`'${entry.body}'`), true, `missing entry body: ${entry.entry_key}`);
    }
  }

  const blockStart = "create table if not exists public.app_admins";
  const blockEnd = "on conflict (entry_key) do nothing;";
  const getGuideSqlBlock = (sql) => {
    const startIndex = sql.lastIndexOf(blockStart);
    const endIndex = sql.indexOf(blockEnd, startIndex) + blockEnd.length;
    return sql.slice(startIndex, endIndex).trim();
  };
  assert.equal(getGuideSqlBlock(migration), getGuideSqlBlock(schema));
});

test("browser roles can only read public guide rows while admin writes stay behind RLS", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /grant select on table public\.guide_sections to anon, authenticated/);
  assert.match(migration, /grant select on table public\.guide_entries to anon, authenticated/);
  assert.match(migration, /using \(is_visible is true\)/);
  assert.match(migration, /with check \(\(select public\.is_app_admin\(\)\)\)/);
  assert.match(migration, /using \(\(select public\.is_app_admin\(\)\)\)/);
  assert.match(migration, /revoke all on function public\.is_app_admin\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.is_app_admin\(\) to authenticated, service_role/);
});

test("frontend uses Supabase as primary source, preserves fallback, and hides editor from non-admins", async () => {
  const [appSource, adminSource] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(adminUiUrl, "utf8"),
  ]);

  assert.match(appSource, /from\("guide_sections"\)/);
  assert.match(appSource, /from\("guide_entries"\)/);
  assert.match(appSource, /getFallbackVillageGuideRows\(\)/);
  assert.match(appSource, /入村案内を読み込み中/);
  assert.match(appSource, /!profile\.canEdit \? \([\s\S]*?はじめての入村案内/);
  assert.match(appSource, /\{profile\.guideIsAdmin \? \(/);
  assert.match(appSource, /rpc\("is_app_admin"\)/);
  assert.match(adminSource, /from\("guide_sections"\)\s*\.insert/);
  assert.match(adminSource, /from\("guide_entries"\)\s*\.insert/);
  assert.match(adminSource, /\.update\(/);
  assert.match(adminSource, /\.delete\(\)/);
  assert.match(adminSource, /window\.confirm/);
});

test("verification SQL remains read-only and checks guide privileges", async () => {
  const verification = await readFile(verificationUrl, "utf8");
  const statementsWithoutComments = verification
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  assert.doesNotMatch(statementsWithoutComments, /\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i);
  assert.match(verification, /information_schema\.table_privileges/);
  assert.match(verification, /pg_catalog\.pg_policies/);
  assert.match(verification, /is_app_admin/);
});

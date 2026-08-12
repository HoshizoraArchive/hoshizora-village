import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GUIDE_ENTRY_SELECT_COLUMNS,
  buildVillageGuideTree,
  getFallbackVillageGuideRows,
  validateVillageGuideEntryInput,
  validateVillageGuideSectionInput,
} from "../../../src/villageGuide.js";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationUrls = [
  "20260719140342_add_editable_village_guide_tables.sql",
  "20260719140500_lock_down_editable_village_guide_tables.sql",
  "20260719140522_add_editable_village_guide_constraints.sql",
  "20260719140534_add_village_guide_admin_table.sql",
  "20260719140552_link_village_guide_admins_to_auth.sql",
  "20260719140606_add_village_guide_admin_check.sql",
  "20260719140645_add_village_guide_visibility_function.sql",
  "20260719140704_grant_village_guide_visibility_function.sql",
  "20260719140756_add_village_guide_section_audit_function.sql",
  "20260719140812_add_village_guide_entry_audit_function.sql",
  "20260719140834_attach_village_guide_audit_triggers.sql",
  "20260719140850_grant_village_guide_access.sql",
  "20260719140908_add_village_guide_section_policies.sql",
  "20260719140926_add_village_guide_entry_policies.sql",
  "20260719140946_seed_village_guide_sections.sql",
  "20260719141014_seed_village_guide_entries_part_one.sql",
  "20260719141041_seed_village_guide_entries_part_two.sql",
  "20260719141100_seed_village_guide_entries_part_three.sql",
  "20260719141619_harden_village_guide_audit_functions.sql",
  "20260722143000_update_village_guide_philosophy.sql",
  "20260722145500_fix_village_philosophy_line_breaks.sql",
  "20260807071000_rename_rconnect_to_reconnect.sql",
  "20260812070757_restore_village_guide_current_intent.sql",
].map((filename) => new URL(`supabase/migrations/${filename}`, repositoryRoot));
const schemaUrl = new URL("supabase/schema.sql", repositoryRoot);
const appUrl = new URL("src/App.jsx", repositoryRoot);
const adminUiUrl = new URL("src/VillageGuideAdmin.jsx", repositoryRoot);
const verificationUrl = new URL("docs/village-guide-verification.sql", repositoryRoot);

async function readGuideMigrationChain() {
  return (await Promise.all(migrationUrls.map((url) => readFile(url, "utf8")))).join("\n");
}

function isDatabaseSectionPublic(sectionRows, sectionId) {
  const sectionsById = new Map(sectionRows.map((section) => [section.id, section]));
  const visited = new Set();
  let currentId = sectionId;

  for (let depth = 0; depth < 64; depth += 1) {
    const section = sectionsById.get(currentId);
    if (!section || section.is_visible !== true || visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);
    if (!section.parent_id) {
      return true;
    }
    currentId = section.parent_id;
  }

  return false;
}

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

test("database visibility includes visible ancestry and rejects hidden parents, hidden children, and cycles", () => {
  const rows = getFallbackVillageGuideRows();
  const root = rows.sections.find((section) => section.section_key === "available_now");
  const child = rows.sections.find((section) => section.section_key === "available_account_profile");
  const entry = rows.entries.find((item) => item.entry_key === "account_auth");

  assert.equal(isDatabaseSectionPublic(rows.sections, null), false);
  assert.equal(isDatabaseSectionPublic(rows.sections, root.id), true);
  assert.equal(isDatabaseSectionPublic(rows.sections, child.id), true);
  assert.equal(entry.is_visible && isDatabaseSectionPublic(rows.sections, entry.section_id), true);

  root.is_visible = false;
  assert.equal(isDatabaseSectionPublic(rows.sections, child.id), false);
  assert.equal(entry.is_visible && isDatabaseSectionPublic(rows.sections, entry.section_id), false);

  root.is_visible = true;
  child.is_visible = false;
  assert.equal(isDatabaseSectionPublic(rows.sections, child.id), false);
  assert.equal(entry.is_visible && isDatabaseSectionPublic(rows.sections, entry.section_id), false);

  child.is_visible = true;
  root.parent_id = child.id;
  assert.equal(isDatabaseSectionPublic(rows.sections, root.id), false);
  assert.equal(isDatabaseSectionPublic(rows.sections, child.id), false);
});

test("public guide tree excludes hidden entries and descendants while admin mode retains hidden rows", () => {
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

  const adminTree = buildVillageGuideTree(rows.sections, rows.entries, { includeHidden: true });
  const adminAvailable = adminTree.find((section) => section.section_key === "available_now");
  const adminPlanned = adminTree.find((section) => section.section_key === "planned_features");
  assert.equal(adminAvailable.children.some((section) => section.section_key === "available_account_profile"), true);
  assert.equal(adminPlanned.entries.some((entry) => entry.entry_key === "planned_audio"), true);
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
    readGuideMigrationChain(),
    readFile(schemaUrl, "utf8"),
  ]);
  const fallback = getFallbackVillageGuideRows();

  for (const sql of [migration, schema]) {
    assert.match(sql, /create table if not exists public\.app_admins/);
    assert.match(sql, /create table if not exists public\.guide_sections/);
    assert.match(sql, /create table if not exists public\.guide_entries/);
    assert.match(sql, /create or replace function public\.is_app_admin\(\)/);
    assert.match(sql, /create or replace function app_private\.guide_section_is_public\(p_section_id uuid\)/);
    assert.match(sql, /security definer\s+set search_path = ''/);
    assert.match(sql, /with recursive section_ancestry/);
    assert.match(sql, /parent_section\.id = any\(section_ancestry\.visited_ids\)/);
    assert.match(sql, /not bool_or\(section_ancestry\.has_cycle\)/);
    assert.match(sql, /bool_or\(section_ancestry\.parent_id is null\)/);
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
      const currentBody = `'${entry.body}'`;
      const historicalBody = `'${entry.body.replaceAll("Re:Connect", "R.Connect")}'`;
      assert.equal(
        sql.includes(currentBody) || (sql === migration && sql.includes(historicalBody)),
        true,
        `missing entry body: ${entry.entry_key}`,
      );
    }
  }

  const functionStart = "create or replace function app_private.guide_section_is_public(p_section_id uuid)";
  const getFinalVisibilityFunction = (sql) => {
    const startIndex = sql.lastIndexOf(functionStart);
    const endIndex = sql.indexOf("$$;", startIndex) + 3;
    return sql.slice(startIndex, endIndex).trim();
  };
  assert.equal(getFinalVisibilityFunction(migration), getFinalVisibilityFunction(schema));
});

test("browser roles can only read public guide rows while admin writes stay behind RLS", async () => {
  const migration = await readGuideMigrationChain();
  const guideEntryColumnGrant = migration.match(
    /grant select \(([\s\S]*?)\) on table public\.guide_entries to anon, authenticated;/,
  )?.[1];
  const publicEntryColumns = [
    "id",
    "section_id",
    "entry_key",
    "entry_type",
    "body",
    "sort_order",
    "is_visible",
    "created_at",
    "updated_at",
  ];

  assert.match(migration, /grant select on table public\.guide_sections to anon, authenticated/);
  assert.doesNotMatch(migration, /grant select on table public\.guide_entries to anon, authenticated/);
  assert.ok(guideEntryColumnGrant);
  assert.deepEqual(
    guideEntryColumnGrant.split(",").map((columnName) => columnName.trim()),
    publicEntryColumns,
  );
  assert.deepEqual(
    GUIDE_ENTRY_SELECT_COLUMNS.split(",").map((columnName) => columnName.trim()),
    publicEntryColumns,
  );
  assert.match(migration, /using \(app_private\.guide_section_is_public\(id\)\)/);
  assert.match(
    migration,
    /is_visible is true\s+and app_private\.guide_section_is_public\(section_id\)/,
  );
  assert.match(migration, /guide_sections_admin_select_all[\s\S]*?using \(\(select public\.is_app_admin\(\)\)\)/);
  assert.match(migration, /guide_entries_admin_select_all[\s\S]*?using \(\(select public\.is_app_admin\(\)\)\)/);
  assert.match(migration, /with check \(\(select public\.is_app_admin\(\)\)\)/);
  assert.match(migration, /using \(\(select public\.is_app_admin\(\)\)\)/);
  assert.match(migration, /revoke all on function public\.is_app_admin\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.is_app_admin\(\) to authenticated, service_role/);
  assert.match(
    migration,
    /revoke all on function app_private\.guide_section_is_public\(uuid\) from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function app_private\.guide_section_is_public\(uuid\) to anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function app_private\.guide_section_is_public\(uuid\) to (?:public|service_role)/,
  );
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
  assert.match(verification, /information_schema\.column_privileges/);
  assert.match(verification, /has_column_privilege/);
  assert.match(verification, /updated_by/);
  assert.match(verification, /pg_catalog\.pg_policies/);
  assert.match(verification, /is_app_admin/);
  assert.match(verification, /guide_section_is_public/);
});

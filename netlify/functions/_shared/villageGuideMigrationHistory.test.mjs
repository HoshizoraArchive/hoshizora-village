import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const migrationsRoot = new URL("supabase/migrations/", repositoryRoot);
const schemaUrl = new URL("supabase/schema.sql", repositoryRoot);
const oldIntegratedMigrationUrl = new URL(
  "20260719130000_add_editable_village_guide.sql",
  migrationsRoot,
);
const followUpUrl = new URL(
  "20260812070757_restore_village_guide_current_intent.sql",
  migrationsRoot,
);

const canonicalMigrations = [
  ["20260719140342_add_editable_village_guide_tables.sql", 920, "8cd9d99e0b267b7feefe8d6acab96528", "5999fb16cf51495509a611e4e3eaa1be1eb437cc335ad1820db03b3058573bdf"],
  ["20260719140500_lock_down_editable_village_guide_tables.sql", 271, "8e7d62bd2393d3ebab16ae7fe8761102", "fbfa682be807c53aa84199cba4737920347e6c35c0c15257b99e29e8366c09cc"],
  ["20260719140522_add_editable_village_guide_constraints.sql", 1505, "4be384611299ec1a12acebf8d9057c19", "faf879de37cf6e3d67cfc71706c747a7344cbe816eebfc35c7a20bfc67acdec6"],
  ["20260719140534_add_village_guide_admin_table.sql", 327, "8d0869c1760c6e55f683f92e34e6e7ef", "da67eb5abd1aa49a562f7d028f1b1e94085097c226dc9913b180f8a7ac6622e7"],
  ["20260719140552_link_village_guide_admins_to_auth.sql", 293, "dcc19e64f53a3a44ad4c8992297f352b", "1f4a9ea0ad99837feb6b95c4f449f5bb85e60b3190e80d85c4e349b47846b4f3"],
  ["20260719140606_add_village_guide_admin_check.sql", 464, "dadf51b5852fdc192e2d39e8ffec0f47", "21b521709fe1b22cdb78ff37dbd33169b91108fee62134e88b0c29e94ae013f5"],
  ["20260719140645_add_village_guide_visibility_function.sql", 837, "9fbd833780fab8cdf2b2bc544ec3b530", "f3d1016b5a69b3a20d4d254e7c029a97827c9fcff29b161f27b4ca9f6bab9566"],
  ["20260719140704_grant_village_guide_visibility_function.sql", 204, "eabcea6285b14e89b24e0290b9a18874", "44442c2c7acbbae097840a85f35b91b8aef33c8b5a9e671494ec8f4bd3e7fa55"],
  ["20260719140756_add_village_guide_section_audit_function.sql", 492, "a6787c114118c5ddcf0dd31e37a1a394", "3728099f774f6afb1508b4eca27348eff3b46b93c3e94348c34629716c73c62a"],
  ["20260719140812_add_village_guide_entry_audit_function.sql", 523, "eb75ba75126ef85e224eb717413d7a86", "5d79fdd8a42b7ba7076f1589460dc9095b5b2db4eb4b1192496441a442c2c929"],
  ["20260719140834_attach_village_guide_audit_triggers.sql", 703, "ce983bf8d39bdb9936b44989b83a1c37", "72cdbb8623e8a56d24001d0e0f0627e82a60a9cb76cfbc9e33f4687e2cd3c3c2"],
  ["20260719140850_grant_village_guide_access.sql", 645, "7b5ec08deb68c754402df35c135ec17c", "bf5eade9bf3042b6f326205d0dd998e99d9e6f60f7ea9c8c23510b5f0ecf59ed"],
  ["20260719140908_add_village_guide_section_policies.sql", 1134, "e70d7ee1f139a491a5cd095a8f62aeda", "961e8f71c08849277d5b9143ffbb32642477fb7d6b71b2930521045f8cbe55af"],
  ["20260719140926_add_village_guide_entry_policies.sql", 1151, "782e51b5704e34f46dbcef45bc21b20c", "8d5b04843f6323670a5256f74b4e08aecb4a7b1bef695fe5a20d70595bf5d3bd"],
  ["20260719140946_seed_village_guide_sections.sql", 1434, "e6a96b43723a164feff0cbc39904b99b", "a1225cdee6c8a8f7917e0711b7f243b7871c7c05dd42307a76997ca2005b4f61"],
  ["20260719141014_seed_village_guide_entries_part_one.sql", 3581, "01de9e579329edf166100c36ce4e3991", "820049adfc16b2ee12afa0a7bcbfdf8730ff16a83fd697a4c1fc7384c76b42ed"],
  ["20260719141041_seed_village_guide_entries_part_two.sql", 3230, "5d7e1a566cf50b9b9b89439fa3f6be7c", "384650a3ca15a4a03c0fbf79130a5e3ebe7585acfb4818b9ead62e97b65ca480"],
  ["20260719141100_seed_village_guide_entries_part_three.sql", 2092, "0a0224f4ce6e520f2b9bd6a87dc601e6", "e8b5675d45ca077cc4e1ae30848105c8089f9be751350cad055d1eab1c764e23"],
  ["20260719141619_harden_village_guide_audit_functions.sql", 153, "f9e44315aa97d931077dadfa337db9f5", "46d780c2854cd4d32a8fe36a237a16973f07867c9bb11fe1b8e6a9ecff7bdf89"],
];

const catalogComments = [
  ["table public.app_admins", "星空Villageの管理操作を許可されたAuthユーザー。ブラウザから一覧は公開しない。"],
  ["table public.guide_sections", "はじめての入村案内のセクションと子カテゴリー。section_keyは外部運用でも使う安定キー。"],
  ["column public.guide_sections.section_key", "人間と外部運用が1行を特定する安定キー。作成後は変更しない。"],
  ["column public.guide_sections.parent_id", "nullなら最上位セクション。値があれば子カテゴリー。"],
  ["column public.guide_sections.display_variant", "standardは通常カード、subsectionは子カテゴリー、noticeは注意書き表示。"],
  ["table public.guide_entries", "はじめての入村案内を1項目ずつ管理する文章行。entry_keyで単発更新できる。"],
  ["column public.guide_entries.entry_key", "人間と外部運用が1行を特定する安定キー。作成後は変更しない。"],
  ["column public.guide_entries.updated_by", "更新したAuthユーザーを記録する非公開監査列。service_role更新ではnullになり得る。"],
  ["function public.is_app_admin()", "現在の認証ユーザーがapp_adminsに登録されているかだけを返す。管理者一覧は公開しない。"],
  ["function app_private.guide_section_is_public(uuid)", "RLS専用。対象セクションからルートまで全祖先が表示中で、循環せずルートへ到達した場合だけtrueを返す。"],
];

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest("hex");
}

function extractFinalVisibilityFunction(sql) {
  const signature = "create or replace function app_private.guide_section_is_public(p_section_id uuid)";
  const startIndex = sql.lastIndexOf(signature);
  const endIndex = sql.indexOf("$$;", startIndex) + 3;
  return sql.slice(startIndex, endIndex).trim();
}

test("canonical Village Guide migrations match the Production ledger fingerprints", async () => {
  assert.equal(canonicalMigrations.length, 19);

  for (const [filename, byteLength, md5, sha256] of canonicalMigrations) {
    const bytes = await readFile(new URL(filename, migrationsRoot));
    assert.equal(bytes.byteLength, byteLength, `${filename} byte length`);
    assert.equal(digest("md5", bytes), md5, `${filename} MD5`);
    assert.equal(digest("sha256", bytes), sha256, `${filename} SHA-256`);
  }

  await assert.rejects(readFile(oldIntegratedMigrationUrl), { code: "ENOENT" });
});

test("canonical visibility history and current-intent follow-up have separate roles", async () => {
  const [canonicalVisibility, followUp, schema] = await Promise.all([
    readFile(new URL("20260719140645_add_village_guide_visibility_function.sql", migrationsRoot), "utf8"),
    readFile(followUpUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);

  assert.match(canonicalVisibility, /language plpgsql/);
  assert.match(canonicalVisibility, /while current_id is not null and depth_value < 64 loop/);
  assert.match(canonicalVisibility, /return current_id is null/);
  assert.doesNotMatch(canonicalVisibility, /with recursive section_ancestry/);

  assert.match(followUp, /language sql/);
  assert.match(followUp, /with recursive section_ancestry/);
  assert.match(followUp, /where section_row\.id = p_section_id/);
  assert.match(followUp, /select coalesce\([\s\S]*?,\s*false\s*\)/);
  assert.match(followUp, /not bool_or\(section_ancestry\.has_cycle\)/);
  assert.match(followUp, /bool_or\(section_ancestry\.parent_id is null\)/);
  assert.equal(extractFinalVisibilityFunction(followUp), extractFinalVisibilityFunction(schema));
});

test("current-intent follow-up contains only one function replacement and ten catalog comments", async () => {
  const followUp = await readFile(followUpUrl, "utf8");
  const functionDefinition =
    /create or replace function app_private\.guide_section_is_public\(p_section_id uuid\)[\s\S]*?\$\$;/i;
  const commentStatement = /comment on (?:table|column|function) [^;]+? is\s*'(?:''|[^'])*';/gi;

  assert.equal((followUp.match(/create or replace function/gi) ?? []).length, 1);
  assert.equal((followUp.match(/comment on /gi) ?? []).length, 10);

  for (const [target, comment] of catalogComments) {
    assert.match(followUp, new RegExp(`comment on ${target.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")} is\\s*'${comment}'`));
  }

  const unsupportedSql = followUp.replace(functionDefinition, "").replace(commentStatement, "").trim();
  assert.equal(unsupportedSql, "");
  assert.doesNotMatch(followUp, /\b(?:insert|update|delete)\b/i);
  assert.doesNotMatch(
    followUp,
    /\b(?:create table|alter table|create index|drop index|create trigger|drop trigger|create policy|alter policy|drop policy|grant|revoke)\b/i,
  );
});

test("seed and later-update chain preserves the final Village Guide intent", async () => {
  const [
    sectionSeed,
    entrySeedOne,
    entrySeedTwo,
    entrySeedThree,
    philosophyUpdate,
    lineBreakFix,
    reconnectUpdate,
    followUp,
    schema,
  ] = await Promise.all([
    readFile(new URL("20260719140946_seed_village_guide_sections.sql", migrationsRoot), "utf8"),
    readFile(new URL("20260719141014_seed_village_guide_entries_part_one.sql", migrationsRoot), "utf8"),
    readFile(new URL("20260719141041_seed_village_guide_entries_part_two.sql", migrationsRoot), "utf8"),
    readFile(new URL("20260719141100_seed_village_guide_entries_part_three.sql", migrationsRoot), "utf8"),
    readFile(new URL("20260722143000_update_village_guide_philosophy.sql", migrationsRoot), "utf8"),
    readFile(new URL("20260722145500_fix_village_philosophy_line_breaks.sql", migrationsRoot), "utf8"),
    readFile(new URL("20260807071000_rename_rconnect_to_reconnect.sql", migrationsRoot), "utf8"),
    readFile(followUpUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);

  assert.equal((sectionSeed.match(/^\s+\('/gm) ?? []).length, 12);
  const entrySeed = [entrySeedOne, entrySeedTwo, entrySeedThree].join("\n");
  assert.equal((entrySeed.match(/^\s+\('/gm) ?? []).length, 59);
  assert.equal((entrySeed.match(/R\.Connect/g) ?? []).length, 5);
  assert.equal((entrySeed.match(/Re:Connect/g) ?? []).length, 0);

  assert.match(philosophyUpdate, /where section_key = 'about_village'/);
  assert.match(lineBreakFix, /body = E'たった一人でも、\\nその人の人生を\\n変革し、幸せにする。'/);
  assert.match(reconnectUpdate, /replace\(body, 'R\.' \|\| 'Connect', 'Re:Connect'\)/);
  assert.doesNotMatch(followUp, /\b(?:insert|update|delete)\b/i);

  assert.equal(extractFinalVisibilityFunction(followUp), extractFinalVisibilityFunction(schema));
  for (const [target, comment] of catalogComments) {
    assert.match(schema, new RegExp(`comment on ${target.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")} is\\s*'${comment}'`));
  }
});

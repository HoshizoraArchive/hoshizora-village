import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entrySource = readFileSync("src/betaUsageAdminEntry.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("My Universeの運営導線は既存admin判定を通過した時だけ表示する", () => {
  assert.equal(entrySource.includes('supabase.rpc("is_app_admin")'), true);
  assert.equal(entrySource.includes("adminAccess = !error && data === true"), true);
  assert.equal(entrySource.includes("removeAdminEntries()"), true);
  assert.equal(entrySource.includes("profile-card-header-actions"), true);
  assert.equal(entrySource.includes('button.textContent = "運営"'), true);
});

test("運営導線はβ利用ダッシュボードだけを開きユーザー名で権限判定しない", () => {
  assert.equal(entrySource.includes('const BETA_USAGE_ADMIN_PATH = "/admin/beta-usage"'), true);
  assert.equal(entrySource.includes("window.location.assign(BETA_USAGE_ADMIN_PATH)"), true);
  assert.equal(entrySource.includes("Fate_to_Ash"), false);
  assert.equal(entrySource.includes("hoshik"), false);
  assert.equal(entrySource.includes("username ==="), false);
});

test("運営導線enhancementを通常アプリ起動時に読み込む", () => {
  assert.equal(mainSource.includes('import "./betaUsageAdminEntry.js";'), true);
  assert.equal(mainSource.includes("<App />"), true);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(new URL("../../../src/main.jsx", import.meta.url), "utf8");
const skipSource = await readFile(
  new URL("../../../src/onboardingSkipExperience.js", import.meta.url),
  "utf8",
);
const migrationSource = await readFile(
  new URL(
    "../../../supabase/migrations/20260805130000_add_onboarding_skip_all.sql",
    import.meta.url,
  ),
  "utf8",
);

test("入村案内の全体スキップ導線をクライアント起動時に読み込む", () => {
  assert.match(mainSource, /import "\.\/onboardingSkipExperience\.js";/);
  assert.match(skipSource, /案内をすべてスキップ/);
  assert.match(skipSource, /\.onboarding-welcome, \.onboarding-guide/);
  assert.match(skipSource, /ちあの案内を見る/);
});

test("全体スキップは確認後にDBの専用actionを呼び、成功時だけ再読込する", () => {
  assert.match(skipSource, /window\.confirm\(/);
  assert.match(skipSource, /p_action: "skip_all"/);
  assert.match(skipSource, /advance_initial_onboarding/);
  assert.match(skipSource, /\["advanced", "already_completed"\]/);
  assert.match(skipSource, /window\.location\.reload\(\)/);
});

test("migrationは全体スキップを完了扱いにしつつ離脱位置を保存する", () => {
  assert.match(migrationSource, /add column if not exists skipped_at timestamptz/);
  assert.match(migrationSource, /add column if not exists skipped_from_step text/);
  assert.match(migrationSource, /if p_action = 'skip_all' then/);
  assert.match(migrationSource, /current_step = 'completed'/);
  assert.match(migrationSource, /skipped_from_step = coalesce\(skipped_from_step, v_progress\.current_step\)/);
});

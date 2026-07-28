import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/onboardingObserveExperience.js", "utf8");

test("観測オンボーディングは表示中もDBを継続確認して段階を復元する", () => {
  for (const token of [
    "const DATABASE_REFRESH_INTERVAL_MS = 800",
    'window.setInterval(() => {',
    "requestContextSynchronization();",
    '.select("user_id, current_step, target_post_id, created_at")',
    '.gte("created_at", activeStartedAt)',
    'hasMatchingRow("resonances", "profile_id")',
    'hasMatchingRow("star_letters", "author_id")',
    'databaseStage === "star_letter_open"',
  ]) {
    assert.equal(source.includes(token), true, `missing DB-derived observe stage behavior: ${token}`);
  }
});

test("DOM再描画時も古い段階だけを貼り直さずDB再確認を予約する", () => {
  assert.equal(source.includes("Date.now() - lastContextReadAt >= MUTATION_REFRESH_THROTTLE_MS"), true);
  assert.equal(source.includes("requestContextSynchronization();"), true);
  assert.equal(source.includes("if (activeContextKey && getGuide())"), false);
  assert.equal(source.includes("applyObserveGuide();\n\n    if (Date.now()"), true);
});

test("再実行時はオンボーディング開始前の共鳴と星文を進行条件にしない", () => {
  assert.equal(source.includes("activeStartedAt = progress.created_at"), true);
  assert.equal(source.includes('.gte("created_at", activeStartedAt)'), true);
  assert.equal(source.includes('`${userId}:${progress.target_post_id}:${progress.created_at}`'), true);
});

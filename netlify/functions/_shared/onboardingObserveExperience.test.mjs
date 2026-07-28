import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/onboardingObserveExperience.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("観測案内は共鳴、星文、Archiveの順で実操作を案内する", () => {
  const orderedTokens = [
    "まずは、この流星便に「共鳴」を押してみて！",
    "次は「星文」！",
    "この流星便に、届けたい言葉を書いてみて！",
    "最後は「Archive」！",
  ];

  let previousIndex = -1;
  for (const token of orderedTokens) {
    const index = source.indexOf(token);
    assert.ok(index > previousIndex, `observe guide order is wrong: ${token}`);
    previousIndex = index;
  }

  assert.equal(source.includes("共鳴は何回でも押せるよ✨"), true);
  assert.equal(source.includes('optionalLabel: "星文はあとで"'), true);
});

test("共鳴と星文は実DB行を確認してから次へ進み、再開地点も復元する", () => {
  for (const token of [
    'hasMatchingRow("resonances", "profile_id")',
    'hasMatchingRow("star_letters", "author_id")',
    'waitForActionResult("resonances", "profile_id", "star_letter_open")',
    'waitForActionResult("star_letters", "author_id", "archive")',
    '.select("user_id, current_step, target_post_id, created_at")',
    'progress?.current_step !== "archive_prompt"',
  ]) {
    assert.equal(source.includes(token), true, `missing verified observe behavior: ${token}`);
  }
});

test("案内対象の流星便内だけをハイライトし通常画面へ影響を残さない", () => {
  for (const token of [
    '[data-onboarding-target="onboarding-archive-post"]',
    'textarea[placeholder="この流星便に星文を残す"]',
    "cleanupObserveExperience()",
    "restoreDefaultArchiveTarget()",
    "isGuideAlreadyApplied",
  ]) {
    assert.equal(source.includes(token), true, `missing isolated observe behavior: ${token}`);
  }

  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal(mainSource.includes('import "./onboardingObserveExperience.js";'), true);
});
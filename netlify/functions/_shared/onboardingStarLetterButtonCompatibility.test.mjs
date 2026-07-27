import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/onboardingStarLetterButtonCompatibility.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("鉛筆アイコン付きの星文ボタンをオンボーディングが認識できるようにする", () => {
  for (const token of [
    'includes("星文")',
    'label.startsWith("星文")',
    'prefix.textContent = "星文 "',
    'prefix.setAttribute("aria-hidden", "true")',
    'button.prepend(createHiddenPrefix())',
  ]) {
    assert.equal(source.includes(token), true, `missing compatibility behavior: ${token}`);
  }
});

test("互換処理は観測ガイドより先に読み込む", () => {
  const compatibilityIndex = mainSource.indexOf('import "./onboardingStarLetterButtonCompatibility.js";');
  const observeGuideIndex = mainSource.indexOf('import "./onboardingObserveExperience.js";');

  assert.notEqual(compatibilityIndex, -1);
  assert.notEqual(observeGuideIndex, -1);
  assert.equal(compatibilityIndex < observeGuideIndex, true);
});

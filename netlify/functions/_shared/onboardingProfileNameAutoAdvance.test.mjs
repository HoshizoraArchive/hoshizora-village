import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PROFILE_NAME_AUTO_ADVANCE_DELAY_MS,
  shouldScheduleProfileNameAutoAdvance,
} from "../../../src/onboardingProfileNameAutoAdvance.js";

const source = readFileSync("src/onboardingProfileNameAutoAdvance.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("名前入力停止を700ms待ってから自動遷移する", () => {
  assert.equal(PROFILE_NAME_AUTO_ADVANCE_DELAY_MS, 700);
  assert.equal(
    shouldScheduleProfileNameAutoAdvance({
      hasAutoAdvanced: false,
      isComposing: false,
      isNameStep: true,
      value: "ほしくん",
    }),
    true,
  );
});

test("空白・IME変換中・自動遷移済み・別ステップでは進めない", () => {
  for (const options of [
    { hasAutoAdvanced: false, isComposing: false, isNameStep: true, value: "   " },
    { hasAutoAdvanced: false, isComposing: true, isNameStep: true, value: "ほしくん" },
    { hasAutoAdvanced: true, isComposing: false, isNameStep: true, value: "ほしくん" },
    { hasAutoAdvanced: false, isComposing: false, isNameStep: false, value: "ほしくん" },
  ]) {
    assert.equal(shouldScheduleProfileNameAutoAdvance(options), false);
  }
});

test("実際の名前入力とIME確定を監視し既存の次へ操作を再利用する", () => {
  assert.equal(mainSource.includes('import "./onboardingProfileNameAutoAdvance.js";'), true);

  for (const token of [
    'input[placeholder="名無しの観測者"]',
    '[data-profile-guide-step="name"]',
    'document.addEventListener("input", handleProfileNameInput, true)',
    'document.addEventListener("compositionstart", handleCompositionStart, true)',
    'document.addEventListener("compositionend", handleCompositionEnd, true)',
    'button.textContent?.trim() === "次へ"',
    "input.value !== valueSnapshot",
    'data-onboarding-name-auto-advanced',
    "nextButton.click();",
  ]) {
    assert.equal(source.includes(token), true, `missing profile name auto-advance token: ${token}`);
  }
});

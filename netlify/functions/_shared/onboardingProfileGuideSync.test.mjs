import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldAutoAdvanceProfileGuide } from "../../../src/onboardingProfileGuideSync.js";

const bridgeSource = readFileSync("src/onboardingProfileGuideSync.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("入力を終えたプロフィール項目だけ、既存の案内ボタン経由で次へ同期する", () => {
  for (const step of ["name", "username", "bio", "star_chart"]) {
    assert.equal(
      shouldAutoAdvanceProfileGuide({ step, value: "入力済み" }),
      true,
      `${step} should advance after a completed value`,
    );
    assert.equal(
      shouldAutoAdvanceProfileGuide({ step, value: "   " }),
      false,
      `${step} should stay put when empty`,
    );
  }

  for (const step of ["avatar", "avatar_crop", "save", "entry"]) {
    assert.equal(
      shouldAutoAdvanceProfileGuide({ step, value: "入力済み" }),
      false,
      `${step} must keep its existing transition path`,
    );
  }
});

test("ちあの戻る・次へ・小さく・全体スキップ等を押した時は自動同期と競合しない", () => {
  assert.equal(
    shouldAutoAdvanceProfileGuide({ step: "bio", value: "入力済み", suppressed: true }),
    false,
  );

  for (const token of [
    'document.addEventListener("pointerdown", handleGuidePointerDown, true)',
    "GUIDE_CONTROL_SUPPRESS_MS",
    "clearPendingAdvance()",
    'const ONBOARDING_SKIP_ROOT_SELECTOR = "#hoshizora-onboarding-skip-all"',
    "target.closest(ONBOARDING_SKIP_ROOT_SELECTOR)",
    "suppressGuideAutoAdvance()",
  ]) {
    assert.equal(bridgeSource.includes(token), true, `missing race guard: ${token}`);
  }
});

test("キーボードで入力欄から案内操作へ移動してもblur自動進行を奪わない", () => {
  for (const token of [
    "event.relatedTarget",
    "isGuideControlTarget(event.relatedTarget)",
    "Keyboard users can move focus directly",
  ]) {
    assert.equal(bridgeSource.includes(token), true, `missing keyboard focus guard: ${token}`);
  }
});

test("DB遷移を増やさずInteractiveOnboardingの既存ボタンを唯一の進行経路として使う", () => {
  assert.equal(bridgeSource.includes("advance_initial_onboarding"), false);
  assert.equal(bridgeSource.includes("supabase"), false);
  assert.equal(bridgeSource.includes(".click()"), true);
  assert.equal(
    bridgeSource.includes("single source of truth"),
    true,
    "bridge must explicitly preserve the existing transition owner",
  );
  assert.equal(mainSource.includes('import "./onboardingProfileGuideSync.js";'), true);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync("src/InteractiveOnboarding.jsx", "utf8");
const nameAutoAdvanceSource = readFileSync("src/onboardingProfileNameAutoAdvance.js", "utf8");

test("プロフィール案内の戻るは入力内容を巻き戻さず、ひとつ前の案内へだけ戻る", () => {
  for (const mapping of [
    'username: "name"',
    'avatar: "username"',
    'bio: "avatar"',
    'star_chart: "bio"',
    'save: "star_chart"',
  ]) {
    assert.equal(componentSource.includes(mapping), true, `missing previous guide mapping: ${mapping}`);
  }

  assert.equal(componentSource.includes('name: "entry"'), false, "name is the first reversible profile guide step");
  assert.equal(componentSource.includes('avatar_crop: "avatar"'), false, "crop modal owns its own temporary state");
  assert.equal(componentSource.includes("function handleProfileGuideBack()"), true);
  assert.equal(componentSource.includes("moveProfileGuideTo(previousStep)"), true);
  assert.equal(componentSource.includes('aria-label="ひとつ前の案内に戻る"'), true);

  const backLabelIndex = componentSource.indexOf("戻る");
  const collapseLabelIndex = componentSource.indexOf("小さく");
  assert.equal(backLabelIndex >= 0 && backLabelIndex < collapseLabelIndex, true, "戻る must be left of 小さく");
});

test("名前の自動進行後に戻った時は再び勝手に進まず、手動で名前を直せる", () => {
  assert.equal(
    nameAutoAdvanceSource.includes('input.setAttribute(PROFILE_NAME_AUTO_ADVANCED_ATTRIBUTE, "true")'),
    true,
  );
  assert.equal(
    nameAutoAdvanceSource.includes("!hasAutoAdvanced"),
    true,
    "auto advance must remain one-shot after returning to the name guide",
  );
  assert.equal(
    componentSource.includes("removeAttribute(PROFILE_NAME_AUTO_ADVANCED_ATTRIBUTE)"),
    false,
    "back navigation must not re-arm the name auto advance timer",
  );
});

test("既存のプロフィール前進動線は名前から保存まで維持する", () => {
  const forwardSteps = [
    'moveProfileGuideTo("username")',
    'moveProfileGuideTo("avatar")',
    'moveProfileGuideTo("bio")',
    'moveProfileGuideTo("star_chart")',
    'moveProfileGuideTo("save")',
  ];

  let previousIndex = -1;
  for (const token of forwardSteps) {
    const currentIndex = componentSource.indexOf(token, previousIndex + 1);
    assert.notEqual(currentIndex, -1, `missing forward transition: ${token}`);
    assert.equal(currentIndex > previousIndex, true, `out-of-order forward transition: ${token}`);
    previousIndex = currentIndex;
  }

  for (const token of [
    'onAdvance("welcome_completed"',
    "shouldOfferNotificationSkip(progress)",
    "onSkipNotifications(getNotificationSkipStatus(progress))",
    "getOnboardingStepDefinition(progress.current_step, displayName)",
  ]) {
    assert.equal(componentSource.includes(token), true, `existing onboarding flow changed unexpectedly: ${token}`);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getProfileGuideStepDefinition,
  isIosHomeScreenRequiredForPush,
} from "../../../src/onboarding.js";

const componentSource = readFileSync("src/InteractiveOnboarding.jsx", "utf8");

test("My Const.を名前・星影・自己紹介・My Star Chart・保存の順で案内する", () => {
  assert.deepEqual(getProfileGuideStepDefinition("name").lines, [
    "まずは、あなたの名前を書いてね！",
    "これからちあが呼ぶ、大切な名前だよ✨",
  ]);
  assert.deepEqual(getProfileGuideStepDefinition("avatar").lines, [
    "次は、あなたの星影を写してね！",
    "好きな写真やイラストを選んでみて✨",
  ]);
  assert.deepEqual(getProfileGuideStepDefinition("avatar_crop").lines, [
    "画像を動かして、星影にしたい位置を合わせてね！",
    "大きさも調整できるよ。決まったら「この星影を使う」を押してね✨",
  ]);
  assert.equal(getProfileGuideStepDefinition("bio").optionalLabel, "自己紹介はあとで");
  assert.equal(getProfileGuideStepDefinition("star_chart").optionalLabel, "My Star Chartはあとで");
  assert.equal(getProfileGuideStepDefinition("save").targetKey, "save");
});

test("iPhone Safariではホーム画面追加を案内し、PWAでは通常の通知導線へ進む", () => {
  const iosEnvironment = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
    platform: "iPhone",
    maxTouchPoints: 5,
  };

  assert.equal(isIosHomeScreenRequiredForPush({ ...iosEnvironment, standalone: false }), true);
  assert.equal(isIosHomeScreenRequiredForPush({ ...iosEnvironment, standalone: true }), false);
  assert.equal(
    isIosHomeScreenRequiredForPush({
      userAgent: "Mozilla/5.0 (Linux; Android 16)",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
      standalone: false,
    }),
    false,
  );
});

test("操作案内は対象ごとに小型化でき、邪魔な時は折りたためる", () => {
  for (const token of [
    'const PROFILE_DYNAMIC_TARGET = "profile-guide-active"',
    "data-onboarding-dynamic-target",
    'data-guide-variant={isCompact ? "compact" : "story"}',
    "ちあの案内を小さくする",
    "ちあの案内を見る",
    "ホーム画面への追加方法を見る",
    "Safari下部の共有ボタンを押す",
    "通知はあとで設定する",
  ]) {
    assert.equal(componentSource.includes(token), true, `missing refined onboarding UI: ${token}`);
  }
});

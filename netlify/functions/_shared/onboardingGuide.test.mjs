import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getHomeScreenInstallMode,
  getProfileGuideStepDefinition,
  isIosHomeScreenRequiredForPush,
} from "../../../src/onboarding.js";

const componentSource = readFileSync("src/InteractiveOnboarding.jsx", "utf8");

test("My Const.を名前・ユーザー名・星影・自己紹介・My Star Chart・保存の順で案内する", () => {
  assert.deepEqual(getProfileGuideStepDefinition("name").lines, [
    "ここで、あなたの名前を教えてね！",
    "星空Villageでみんなに見える名前だよ✨",
  ]);
  assert.deepEqual(getProfileGuideStepDefinition("username").lines, [
    "ユーザー名は、一時的にちあが考えたよ！",
    "独自のユーザー名にしたかったら変更してね。半角英数字と「_」で、あとからでも変えられるよ✨",
  ]);
  assert.equal(getProfileGuideStepDefinition("username").targetKey, "username");
  assert.deepEqual(getProfileGuideStepDefinition("avatar").lines, [
    "次は、あなたの星影を写してね！",
    "好きな写真やイラストを選んでみて✨",
  ]);
  assert.equal(getProfileGuideStepDefinition("avatar").optionalLabel, "今は設定しない");
  assert.deepEqual(getProfileGuideStepDefinition("avatar_crop").lines, [
    "画像を動かして、星影にしたい位置を合わせてね！",
    "大きさも調整できるよ。決まったら「この星影を使う」を押してね✨",
  ]);
  assert.equal(getProfileGuideStepDefinition("bio").optionalLabel, "自己紹介はあとで");
  assert.equal(getProfileGuideStepDefinition("star_chart").optionalLabel, "My Star Chartはあとで");
  assert.equal(getProfileGuideStepDefinition("save").targetKey, "save");

  assert.equal(componentSource.indexOf('moveProfileGuideTo("username")') < componentSource.indexOf('moveProfileGuideTo("avatar")'), true);
});

test("iPhoneとAndroidでホーム画面追加導線を出し、PWA起動中は出さない", () => {
  const iosEnvironment = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
    platform: "iPhone",
    maxTouchPoints: 5,
  };
  const androidEnvironment = {
    userAgent: "Mozilla/5.0 (Linux; Android 16)",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
  };

  assert.equal(getHomeScreenInstallMode({ ...iosEnvironment, standalone: false }), "ios");
  assert.equal(getHomeScreenInstallMode({ ...androidEnvironment, standalone: false }), "android");
  assert.equal(getHomeScreenInstallMode({ ...iosEnvironment, standalone: true }), "");
  assert.equal(getHomeScreenInstallMode({ ...androidEnvironment, standalone: true }), "");
  assert.equal(isIosHomeScreenRequiredForPush({ ...iosEnvironment, standalone: false }), true);
  assert.equal(isIosHomeScreenRequiredForPush({ ...iosEnvironment, standalone: true }), false);
  assert.equal(isIosHomeScreenRequiredForPush({ ...androidEnvironment, standalone: false }), false);
});

test("ホーム画面追加ボタンはAndroid標準PromptとiPhone手順案内を使い分ける", () => {
  for (const token of [
    'window.addEventListener("beforeinstallprompt"',
    "event.preventDefault()",
    "await promptEvent.prompt()",
    "星空Villageをホーム画面に追加",
    "あとちょっとだよ！✨",
    "Safariの「…」から「共有」を開いて、",
    "下にスクロールして「ホーム画面に追加」を選んでね！",
    "右上の「︙」から「アプリをインストール」または「ホーム画面に追加」を選んでね！",
    "通知はあとで設定する",
  ]) {
    assert.equal(componentSource.includes(token), true, `missing install guidance: ${token}`);
  }
});

test("プロフィール案内は現在の入力だけを操作可能にして星影をスキップできる", () => {
  for (const token of [
    "applyProfileGuideInteractionLock",
    "getProfileGuideAllowedControls",
    "data-onboarding-locked",
    'step === "name"',
    'step === "username"',
    'step === "avatar"',
    'profileGuideStep === "avatar"',
    '? "bio"',
    "今は設定しない",
  ]) {
    assert.equal(componentSource.includes(token), true, `missing guided profile interaction: ${token}`);
  }
});

test("オンボーディングの操作ロックはReact側の保存中disabledを上書きしない", () => {
  for (const token of [
    'const wasLocked = control.hasAttribute("data-onboarding-locked")',
    "if (!locked)",
    "if (wasLocked)",
    'control.setAttribute("data-onboarding-locked", "true")',
  ]) {
    assert.equal(componentSource.includes(token), true, `missing lock ownership guard: ${token}`);
  }

  assert.equal(
    componentSource.includes("control.disabled = originallyDisabled || locked"),
    false,
    "allowed controls must keep the disabled state owned by React/app logic",
  );
});

test("操作案内は対象ごとに小型化でき、邪魔な時は折りたためる", () => {
  for (const token of [
    'const PROFILE_DYNAMIC_TARGET = "profile-guide-active"',
    "data-onboarding-dynamic-target",
    'data-guide-variant={isCompact ? "compact" : "story"}',
    "ちあの案内を小さくする",
    "ちあの案内を見る",
  ]) {
    assert.equal(componentSource.includes(token), true, `missing refined onboarding UI: ${token}`);
  }
});

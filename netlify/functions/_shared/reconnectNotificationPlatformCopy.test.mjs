import assert from "node:assert/strict";
import test from "node:test";

import {
  getReconnectNotificationCopy,
  getReconnectNotificationPlatform,
} from "../../../src/reconnectNotificationPlatformCopy.js";

test("iPhone向けRe:Connect通知案内を返す", () => {
  const environment = {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile/15E148 Safari/604.1",
  };

  assert.equal(getReconnectNotificationPlatform(environment), "ios");
  assert.deepEqual(getReconnectNotificationCopy(environment), {
    description: "この端末でRe:Connect通知を表示できるか確認します。",
    note: "⚠️ iPhoneでは、星空Villageをホーム画面に追加しないと通知を受け取れません。",
    title: "iPhone Re:Connectテスト",
  });
});

test("Android向けRe:Connect通知案内を返す", () => {
  const environment = {
    userAgent:
      "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Chrome/151.0 Mobile Safari/537.36",
  };

  assert.equal(getReconnectNotificationPlatform(environment), "android");
  assert.deepEqual(getReconnectNotificationCopy(environment), {
    description: "この端末でRe:Connect通知を表示できるか確認します。",
    note: "ホーム画面に追加すると、星空Villageをよりアプリらしく楽しめます。",
    title: "Android Re:Connectテスト",
  });
});

test("その他の表示環境では汎用の通知テスト案内を返す", () => {
  const environment = {
    maxTouchPoints: 0,
    platform: "MacIntel",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  };

  assert.equal(getReconnectNotificationPlatform(environment), "other");
  assert.deepEqual(getReconnectNotificationCopy(environment), {
    description: "この端末でRe:Connect通知を表示できるか確認します。",
    note: "",
    title: "スマホ通知テスト",
  });
});

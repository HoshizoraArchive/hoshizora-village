import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.jsx", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/rConnectPolish.css", "utf8");

const rConnectScope = "main.mx-auto.max-w-3xl > section.glass-panel:has(> p.normal-case)";

test("R.Connect cardless polish is loaded and remains scoped to the R.Connect panel", () => {
  assert.match(mainSource, /import "\.\/rConnectPolish\.css";/);
  assert.equal(cssSource.includes(rConnectScope), true);
  assert.equal(cssSource.includes(".my-universe-page"), false);
  assert.equal(cssSource.includes(".archive-page"), false);
  assert.equal(cssSource.includes(".post-card-panel"), false);
});

test("R.Connect cardless polish does not hide, reposition, or disable interactive controls", () => {
  assert.equal(/\bbutton\b/.test(cssSource), false, "R.Connect operational buttons must keep their existing styles");
  assert.equal(cssSource.includes("pointer-events"), false);
  assert.equal(cssSource.includes("display: none"), false);
  assert.equal(cssSource.includes("position:"), false);
});

test("R.Connect keeps notification permission, registration, re-registration, test delivery, and read actions", () => {
  for (const token of [
    "function PushNotificationTestCard({ onboarding, session })",
    "onClick={handleRequestPermission}",
    "onClick={handleRegisterDevice}",
    "onClick={handleReRegisterDevice}",
    "onClick={handleSendTestNotification}",
    "subscribeToPushNotifications",
    "reRegisterPushNotifications",
    "sendPushNotificationTest",
    "onClick={() => onMarkRead(notification.id)}",
    "通知を許可",
    "この端末を登録",
    "通知端末を再登録",
    "テスト通知",
    "既読にする",
  ]) {
    assert.equal(appSource.includes(token), true, `missing protected R.Connect behavior: ${token}`);
  }
});

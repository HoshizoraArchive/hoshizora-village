import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAndroidInstallButtonLabel } from "../../../src/pwaInstallPromptBridge.js";

const bridgeSource = readFileSync("src/pwaInstallPromptBridge.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("AndroidはPromptの有無でホーム画面追加ボタンの意味を明示する", () => {
  assert.equal(
    getAndroidInstallButtonLabel({ hasPrompt: true, isAndroid: true }),
    "星空Villageをホーム画面に追加",
  );
  assert.equal(
    getAndroidInstallButtonLabel({ hasPrompt: false, isAndroid: true }),
    "ホーム画面への追加方法を見る",
  );
  assert.equal(
    getAndroidInstallButtonLabel({ hasPrompt: false, isAndroid: false }),
    "星空Villageをホーム画面に追加",
  );
});

test("Install Prompt bridgeはReact起動前からbrowser eventを保持する", () => {
  assert.equal(mainSource.includes('import "./pwaInstallPromptBridge.js";'), true);

  for (const token of [
    'window.addEventListener("beforeinstallprompt"',
    'window.addEventListener("appinstalled"',
    "event.preventDefault()",
    "deferredInstallPrompt = event",
    "await promptEvent.prompt()",
    "await promptEvent.userChoice",
    'document.addEventListener("click", handleInstallActionClick, true)',
    "ホーム画面への追加方法を見る",
  ]) {
    assert.equal(bridgeSource.includes(token), true, `missing install prompt bridge token: ${token}`);
  }
});

test("Promptを使えないAndroidでは既存Reactの手動案内へフォールバックする", () => {
  assert.equal(
    bridgeSource.includes("if (!deferredInstallPrompt || typeof deferredInstallPrompt.prompt !== \"function\")"),
    true,
  );
  assert.equal(bridgeSource.includes("return;"), true);
  assert.equal(bridgeSource.includes("button.click();"), true);
});

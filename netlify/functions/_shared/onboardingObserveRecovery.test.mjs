import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recoverySource = readFileSync("src/onboardingObserveRecovery.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("共鳴と星文保存後に観測オンボーディングをDBから再同期する", () => {
  for (const token of [
    'data-onboarding-step="archive_prompt"',
    'data-onboarding-target="onboarding-archive-post"',
    'includes("共鳴")',
    'textarea[placeholder="この流星便に星文を残す"]',
    'window.dispatchEvent(new Event("focus"))',
    "RESYNC_DELAYS_MS = [350, 900, 1800]",
  ]) {
    assert.equal(recoverySource.includes(token), true, `missing recovery behavior: ${token}`);
  }

  assert.equal(mainSource.includes('import "./onboardingObserveRecovery.js";'), true);
});

test("再同期タイマーは重複せず画面離脱時に解除する", () => {
  assert.equal(recoverySource.includes("clearPendingTimers();"), true);
  assert.equal(recoverySource.includes('window.addEventListener("pagehide", clearPendingTimers);'), true);
});

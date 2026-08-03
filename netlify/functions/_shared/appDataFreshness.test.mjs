import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS,
  OBSERVE_REFRESH_ACTIVE_TEXT,
  normalizeActiveTabLabel,
  shouldRefreshAfterForeground,
  shouldRefreshForObserveStatus,
  shouldRestoreUiSnapshot,
} from "../../../src/appDataFreshness.js";

const boundarySource = readFileSync("src/AppDataFreshnessBoundary.jsx", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("観測欄の既存更新が完了したら投稿カード全体のsoft refreshへ接続する", () => {
  assert.equal(shouldRefreshForObserveStatus(OBSERVE_REFRESH_ACTIVE_TEXT), true);
  assert.equal(shouldRefreshForObserveStatus("  ✦  流星便を観測中…  "), true);
  assert.equal(shouldRefreshForObserveStatus("✦ 離して更新"), false);

  assert.equal(boundarySource.includes(".observe-timeline-refresh-status"), true);
  assert.equal(boundarySource.includes("observeRefreshActiveRef.current = true"), true);
  assert.equal(boundarySource.includes("requestSoftRefresh();"), true);
  assert.equal(boundarySource.includes("new MutationObserver"), true);
});

test("iPhone/PWAがバックグラウンドから戻った時だけ安全に再同期する", () => {
  const hiddenAt = 10_000;
  const readyAt = hiddenAt + APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS;

  assert.equal(
    shouldRefreshAfterForeground({ hiddenAt, now: readyAt, visibilityState: "visible" }),
    true,
  );
  assert.equal(
    shouldRefreshAfterForeground({ hiddenAt, now: readyAt - 1, visibilityState: "visible" }),
    false,
  );
  assert.equal(
    shouldRefreshAfterForeground({ hiddenAt, now: readyAt, visibilityState: "hidden" }),
    false,
  );
  assert.equal(
    shouldRefreshAfterForeground({ hiddenAt, now: readyAt, onboardingVisible: true }),
    false,
  );
  assert.equal(
    shouldRefreshAfterForeground({ hiddenAt, now: readyAt, unsafeInteraction: true }),
    false,
  );

  for (const listener of ["visibilitychange", "pagehide", "pageshow", "focus"]) {
    assert.equal(boundarySource.includes(`\"${listener}\"`), true, `missing ${listener} listener`);
  }
});

test("再同期はブラウザreloadではなくAppだけを再マウントし、同じ画面ならタブとスクロールを戻す", () => {
  assert.equal(shouldRestoreUiSnapshot({ beforeHref: "https://village.test/", afterHref: "https://village.test/" }), true);
  assert.equal(shouldRestoreUiSnapshot({ beforeHref: "https://village.test/", afterHref: "https://village.test/meteor/1" }), false);
  assert.equal(normalizeActiveTabLabel("  R.Connect  "), "R.Connect");

  assert.equal(boundarySource.includes("window.location.reload"), false);
  assert.equal(boundarySource.includes("setRevision((current) => current + 1)"), true);
  assert.equal(boundarySource.includes("targetButton.click()"), true);
  assert.equal(boundarySource.includes("window.scrollTo"), true);
  assert.equal(boundarySource.includes('activeTabLabel === "流星便"'), true);
  assert.equal(boundarySource.includes("プロフィール編集"), true);
  assert.equal(boundarySource.includes("hasVisibleOnboardingUi()"), true);
});

test("mainは全データ再同期境界の内側でAppを起動する", () => {
  assert.equal(mainSource.includes('import AppDataFreshnessBoundary from "./AppDataFreshnessBoundary.jsx"'), true);
  assert.equal(mainSource.includes("<AppDataFreshnessBoundary AppComponent={App} />"), true);
});

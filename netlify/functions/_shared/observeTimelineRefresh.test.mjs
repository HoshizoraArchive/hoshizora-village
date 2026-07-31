import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OBSERVE_PULL_REFRESH_THRESHOLD_PX,
  OBSERVE_TIMELINE_POLL_INTERVAL_MS,
  getObservePullGesture,
  isPublicPostNewer,
  isUnseenPublicTimelinePost,
  runObserveTimelineSingleFlight,
  shouldTriggerObservePullRefresh,
} from "../../../src/observeTimelineRefresh.js";

const appSource = readFileSync("src/App.jsx", "utf8");
const cssSource = readFileSync("src/observePolish.css", "utf8");

test("observe pull refresh waits for the vertical threshold and ignores horizontal gestures", () => {
  const belowThreshold = getObservePullGesture({
    currentX: 4,
    currentY: OBSERVE_PULL_REFRESH_THRESHOLD_PX - 1,
    startX: 0,
    startY: 0,
  });
  const readyGesture = getObservePullGesture({
    currentX: 4,
    currentY: OBSERVE_PULL_REFRESH_THRESHOLD_PX,
    startX: 0,
    startY: 0,
  });
  const horizontalGesture = getObservePullGesture({
    currentX: 90,
    currentY: 50,
    startX: 0,
    startY: 0,
  });

  assert.equal(belowThreshold.ready, false);
  assert.equal(shouldTriggerObservePullRefresh({ gesture: belowThreshold }), false);
  assert.equal(readyGesture.ready, true);
  assert.equal(shouldTriggerObservePullRefresh({ gesture: readyGesture }), true);
  assert.equal(shouldTriggerObservePullRefresh({ gesture: readyGesture, triggered: true }), false);
  assert.equal(horizontalGesture.distance, 0);
  assert.equal(horizontalGesture.ready, false);
});

test("observe realtime and lightweight checks only surface unseen public posts", () => {
  const knownPostIds = new Set(["already-visible"]);

  assert.equal(
    isUnseenPublicTimelinePost({ id: "already-visible", visibility: "public" }, knownPostIds),
    false,
  );
  assert.equal(isUnseenPublicTimelinePost({ id: "private", visibility: "private" }, knownPostIds), false);
  assert.equal(isUnseenPublicTimelinePost({ id: "new-public", visibility: "public" }, knownPostIds), true);
  assert.equal(
    isPublicPostNewer(
      { id: "b", created_at: "2026-07-31T00:01:00.000Z" },
      { id: "a", createdAt: "2026-07-31T00:00:00.000Z" },
    ),
    true,
  );
});

test("observe background checks fetch only lightweight post freshness fields", () => {
  assert.match(
    appSource,
    /const PUBLIC_POST_FRESHNESS_SELECT_COLUMNS = "id, author_id, created_at, visibility, type"/,
  );
  assert.doesNotMatch(
    appSource.match(/async function readLatestPublicPost\(\)[\s\S]*?\n\}/)?.[0] ?? "",
    /body/,
  );
});

test("observe refresh uses one shared loader and cleans up realtime, polling, and touch listeners", () => {
  assert.match(appSource, /const refreshPublicPosts = useCallback/);
  assert.match(appSource, /void refreshPublicPosts\(\{ initial: true \}\)/);
  assert.match(appSource, /publicPostsRefreshInFlightRef\.current/);
  assert.match(appSource, /setPostsLoading\(true\)[\s\S]*setTimelineRefreshing\(true\)/);
  assert.match(appSource, /supabase\.removeChannel\(channel\)/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(appSource, /window\.addEventListener\("focus", handleFocus\)/);
  assert.match(appSource, /window\.setInterval\(checkForNewPublicPosts, OBSERVE_TIMELINE_POLL_INTERVAL_MS\)/);
  assert.match(appSource, /const stopPolling = \(\) => \{[\s\S]*window\.clearInterval\(pollTimer\)/);
  assert.match(appSource, /window\.removeEventListener\("touchstart", handleTouchStart\)/);
  assert.match(appSource, /window\.removeEventListener\("touchmove", handleTouchMove\)/);
  assert.match(appSource, /window\.removeEventListener\("touchend", handleTouchEnd\)/);
  assert.equal(OBSERVE_TIMELINE_POLL_INTERVAL_MS, 45_000);
});

test("observe focus and visible returns check immediately while keeping one freshness request in flight", async () => {
  let resolveFirstCheck;
  let calls = 0;
  const inFlightRef = { current: false };
  const firstCheck = runObserveTimelineSingleFlight(inFlightRef, async () => {
    calls += 1;
    await new Promise((resolve) => {
      resolveFirstCheck = resolve;
    });
    return true;
  });
  const overlappingFocusOrPollCheck = await runObserveTimelineSingleFlight(inFlightRef, async () => {
    calls += 1;
    return true;
  });

  assert.equal(overlappingFocusOrPollCheck, false);
  assert.equal(calls, 1);
  resolveFirstCheck();
  assert.equal(await firstCheck, true);
  assert.equal(inFlightRef.current, false);
  assert.match(
    appSource,
    /const handleFocus = \(\) => \{[\s\S]*void checkForNewPublicPosts\(\);[\s\S]*ensurePollingStarted\(\);/,
  );
  assert.match(
    appSource,
    /if \(document\.visibilityState === "visible"\) \{[\s\S]*void checkForNewPublicPosts\(\);[\s\S]*ensurePollingStarted\(\);/,
  );
  assert.match(appSource, /const ensurePollingStarted = \(\) => \{[\s\S]*pollTimer === null/);
  assert.match(appSource, /runObserveTimelineSingleFlight\(publicPostsFreshnessCheckInFlightRef/);
});

test("observe refresh banner reloads without shifting readers until they choose it", () => {
  assert.match(appSource, /✦ 新しい流星便があります/);
  assert.match(appSource, /timelineRefresh\.onRefresh\(\{ scrollToTop: true \}\)/);
  assert.match(appSource, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(appSource, /✦ 流星便を観測中…/);
  assert.match(appSource, /↓ 引いて更新/);
  assert.match(appSource, /✦ 離して更新/);
  assert.match(cssSource, /\.observe-timeline-refresh-slot\s*\{[\s\S]*position: sticky/);
  assert.match(cssSource, /\.observe-timeline-new-posts-button[\s\S]*pointer-events: auto/);
});

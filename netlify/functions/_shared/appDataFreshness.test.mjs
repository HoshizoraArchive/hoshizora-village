import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS,
  createEntityRequestVersionStore,
  reconcileRefreshedPosts,
  shouldRefreshAfterForeground,
} from "../../../src/appDataFreshness.js";

const appSource = readFileSync("src/App.jsx", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("観測更新はApp全体をremountせずサーバーデータrevisionを直接進める", () => {
  assert.equal(appSource.includes("const [serverDataRevision, setServerDataRevision] = useState(0)"), true);
  assert.equal(appSource.includes("setServerDataRevision((current) => current + 1)"), true);
  assert.equal(appSource.includes("const refreshed = await refreshPublicPosts();"), true);
  assert.equal(mainSource.includes("<App />"), true);
  assert.equal(mainSource.includes("AppDataFreshnessBoundary"), false);
  assert.equal(existsSync("src/AppDataFreshnessBoundary.jsx"), false);
  assert.equal(appSource.includes("new MutationObserver"), false);
});

test("共鳴・星文・Archive・各post viewは同じrevisionで再取得する", () => {
  for (const dependency of [
    "[allPostIdsKey, serverDataRevision]",
    "[allPostIdsKey, profileFrames, serverDataRevision]",
    "[session?.user?.id, profileFrames, serverDataRevision]",
    "[detailPostId, profileFrames, serverDataRevision]",
    "[publicProfileUsername, profileFrames, serverDataRevision]",
    "[activeTab, session?.user?.id, profileFrames, resonanceDataRevision, serverDataRevision]",
  ]) {
    assert.equal(appSource.includes(dependency), true, `missing freshness dependency: ${dependency}`);
  }

  assert.equal(appSource.includes('.from("resonances")'), true);
  assert.equal(appSource.includes('.from("star_letters")'), true);
  assert.equal(appSource.includes('.from("archives")'), true);
  assert.equal(appSource.includes("applyResonanceCountsEverywhere(postIds, countsByPost, requestTokens)"), true);
  assert.equal(appSource.includes("markStarLetterMutationCommitted()"), true);
});

test("post snapshotの置換はpost取得が所有しない共鳴数を上書きしない", () => {
  const currentPosts = [
    { id: "post-1", text: "before", resonanceCount: 10 },
    { id: "post-2", text: "before", resonanceCount: 3 },
  ];
  const refreshedPosts = [
    { id: "post-1", text: "after", resonanceCount: 0 },
    { id: "post-2", text: "after", resonanceCount: 0 },
    { id: "post-3", text: "new", resonanceCount: 0 },
  ];

  assert.deepEqual(reconcileRefreshedPosts(currentPosts, refreshedPosts), [
    { id: "post-1", text: "after", resonanceCount: 10 },
    { id: "post-2", text: "after", resonanceCount: 3 },
    { id: "post-3", text: "new", resonanceCount: 0 },
  ]);
  assert.deepEqual(
    reconcileRefreshedPosts([], [{ id: "post-1", resonanceCount: 0 }], new Map([["post-1", 7]])),
    [{ id: "post-1", resonanceCount: 7 }],
  );
  assert.equal(appSource.includes("reconcilePostSnapshots(currentPosts, visiblePosts)"), true);
  assert.equal(appSource.includes("reconcilePostSnapshots(currentPosts, hydratedArchives)"), true);
});

test("entity request versionは後発取得と成功mutationだけをcurrentにする", () => {
  const versions = createEntityRequestVersionStore();
  assert.equal(versions.isCurrent(new Map(), "post-1"), false);
  const firstRequest = versions.begin(["post-1", "post-2"]);
  const laterRequest = versions.begin(["post-1"]);

  assert.equal(versions.isCurrent(firstRequest, "post-1"), false);
  assert.equal(versions.isCurrent(firstRequest, "post-2"), true);
  assert.equal(versions.isCurrent(laterRequest, "post-1"), true);

  versions.invalidate("post-1");
  assert.equal(versions.isCurrent(laterRequest, "post-1"), false);

  const afterMutationRequest = versions.begin(["post-1"]);
  assert.equal(versions.isCurrent(afterMutationRequest, "post-1"), true);
});

test("iPhone/PWA復帰は一定時間バックグラウンドだった場合だけ全データ再同期する", () => {
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

  for (const listener of ["visibilitychange", "pagehide", "pageshow", "focus"]) {
    assert.equal(appSource.includes(`\"${listener}\"`), true, `missing ${listener} listener`);
  }

  assert.equal(appSource.includes("void refreshObserveTimeline();"), true);
});

test("再同期はローカル下書きstateを初期化する処理を持たない", () => {
  const foregroundBlockStart = appSource.indexOf("const markHidden = () => {");
  const foregroundBlockEnd = appSource.indexOf("const checkForNewPublicPosts", foregroundBlockStart);
  assert.notEqual(foregroundBlockStart, -1);
  assert.notEqual(foregroundBlockEnd, -1);
  const foregroundBlock = appSource.slice(foregroundBlockStart, foregroundBlockEnd);

  for (const setter of [
    "setPostDraft(",
    "setStarLetterDrafts(",
    "setStarLetterEditDrafts(",
    "setStarLetterReplyComposer(",
    "setActiveTab(",
    "setRoute(",
  ]) {
    assert.equal(foregroundBlock.includes(setter), false, `foreground refresh must not reset ${setter}`);
  }

  assert.equal(appSource.includes("window.location.reload"), false);
});

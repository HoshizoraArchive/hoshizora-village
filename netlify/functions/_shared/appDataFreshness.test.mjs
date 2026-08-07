import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS,
  canApplyRevisionVector,
  createEntityRequestVersionStore,
  createEntityRevisionStore,
  isRevisionComponentBehind,
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
    "[allPostIdsKey, resonanceDataRevision, serverDataRevision]",
    "[allPostIdsKey, profileFrames, serverDataRevision]",
    "[session?.user?.id, profileFrames, serverDataRevision]",
    "[detailPostId, profileFrames, serverDataRevision, sessionUserId]",
    "[publicProfileUsername, profileFrames, serverDataRevision, sessionUserId]",
    "[meteorTagRouteName, profileFrames, serverDataRevision, sessionUserId]",
    "[activeTab, session?.user?.id, profileFrames, resonanceDataRevision, serverDataRevision]",
  ]) {
    assert.equal(appSource.includes(dependency), true, `missing freshness dependency: ${dependency}`);
  }

  assert.equal(appSource.includes("readPostEngagementSnapshots(supabase, postIds)"), true);
  assert.equal(appSource.includes("readStarThreadSnapshots(supabase, postIds)"), true);
  assert.equal(appSource.includes("readArchivedPostSnapshots(supabase, knownPostIds)"), true);
  assert.match(
    appSource,
    /applyResonanceCountsEverywhere\(\s*acceptedPostIds,\s*countsByPost,\s*viewerResonatedPostIdsFromSnapshot,\s*requestTokens,\s*\);/,
  );
  assert.equal(appSource.includes("markStarLetterMutationCommitted("), true);
  assert.equal(appSource.includes("postMutationVersionRef"), false);
  assert.equal(appSource.includes("starLetterMutationVersionRef"), false);
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
  assert.equal(appSource.includes("...hydratedArchives"), true);
  assert.equal(appSource.includes("...currentPosts.filter((post) => rejectedPostIds.has(post.id))"), true);
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

test("viewer projectionはdomainとviewer contextの複合versionで判定する", () => {
  const current = {
    epoch: "epoch-1",
    domainRevision: "7",
    viewerRevision: "3",
    viewerContextRevision: "4",
  };

  assert.equal(canApplyRevisionVector(current, { ...current, viewerContextRevision: "5" }), true);
  assert.equal(canApplyRevisionVector(current, { ...current, domainRevision: "6" }), false);
  assert.equal(canApplyRevisionVector(current, { ...current, viewerRevision: "2" }), false);
  assert.equal(canApplyRevisionVector(current, { ...current, epoch: "epoch-2" }), false);
});

test("viewer context mutationは全entity共通floorを進め古いprojectionを拒否する", () => {
  const revisions = createEntityRevisionStore();
  revisions.beginSession("user-a:1");
  assert.equal(revisions.apply("post-1", {
    epoch: "epoch-1",
    domainRevision: "4",
    viewerContextRevision: "1",
  }, "user-a:1"), true);

  assert.equal(revisions.advanceViewerContext({
    epoch: "epoch-1",
    viewerContextRevision: "3",
  }, "user-a:1"), true);
  assert.equal(revisions.get("post-1").viewerContextRevision, "3");
  assert.deepEqual(revisions.get("post-2"), {
    epoch: "epoch-1",
    domainRevision: "0",
    viewerRevision: "0",
    viewerContextRevision: "3",
  });
  assert.equal(revisions.apply("post-1", {
    epoch: "epoch-1",
    domainRevision: "99",
    viewerContextRevision: "2",
  }, "user-a:1"), false);
  assert.equal(revisions.apply("post-1", {
    epoch: "epoch-1",
    domainRevision: "4",
    viewerContextRevision: "3",
  }, "user-a:1"), true);
  assert.equal(revisions.advanceViewerContext({
    epoch: "epoch-1",
    viewerContextRevision: "4",
  }, "user-b:2"), false);
  assert.equal(revisions.advanceViewerContext({
    epoch: "epoch-1",
    viewerContextRevision: "invalid",
  }, "user-a:1"), false);

  revisions.beginSession("user-b:2");
  assert.equal(revisions.get("post-1"), null);
});

test("mutationは所有componentを巻き戻さず独立componentのfloorをmergeする", () => {
  const revisions = createEntityRevisionStore();
  revisions.beginSession("user-a:1");
  assert.equal(revisions.apply("post-1", {
    epoch: "epoch-1",
    domainRevision: "8",
    viewerRevision: "2",
    viewerContextRevision: "5",
  }, "user-a:1"), true);

  assert.equal(revisions.applyMutation("post-1", {
    epoch: "epoch-1",
    domainRevision: "7",
    viewerRevision: "3",
    viewerContextRevision: "4",
  }, ["viewerRevision"], "user-a:1"), true);
  assert.deepEqual(revisions.get("post-1"), {
    epoch: "epoch-1",
    domainRevision: "8",
    viewerRevision: "3",
    viewerContextRevision: "5",
  });
  assert.equal(revisions.applyMutation("post-1", {
    epoch: "epoch-1",
    domainRevision: "9",
    viewerRevision: "2",
    viewerContextRevision: "5",
  }, ["viewerRevision"], "user-a:1"), false);

  assert.equal(isRevisionComponentBehind(
    { epoch: "epoch-1", domainRevision: "8", viewerRevision: "3", viewerContextRevision: "5" },
    { epoch: "epoch-1", domainRevision: "9", viewerRevision: "4", viewerContextRevision: "4" },
    "viewerContextRevision",
  ), true);
});

test("entity revision floorは古いsnapshotを拒否し新しい0件を受理する", () => {
  const revisions = createEntityRevisionStore();
  revisions.beginSession("user-a:1");
  assert.equal(revisions.applyMutation("post-1", {
    epoch: "epoch-1",
    domainRevision: "5",
  }, ["domainRevision"], "user-a:1"), true);
  assert.equal(revisions.apply("post-1", {
    epoch: "epoch-1",
    domainRevision: "4",
  }, "user-a:1"), false);
  assert.equal(revisions.apply("post-1", {
    epoch: "epoch-1",
    domainRevision: "6",
  }, "user-a:1"), true);
});

test("post reconciliationはentityごとに本文・tombstone・asset ownershipを守る", () => {
  const contentRevisions = createEntityRevisionStore();
  const assetRevisions = createEntityRevisionStore();
  contentRevisions.beginSession("user-a:1");
  assetRevisions.beginSession("user-a:1");
  contentRevisions.applyMutation("post-a", {
    epoch: "epoch-1",
    domainRevision: "5",
  }, ["domainRevision"], "user-a:1");
  assetRevisions.applyMutation("post-a", {
    epoch: "epoch-1",
    domainRevision: "5",
  }, ["domainRevision"], "user-a:1");

  const current = [{
    id: "post-a",
    text: "edited",
    media: ["existing-media"],
    tags: ["existing-tag"],
    resonanceCount: 1,
  }];
  const reconciled = reconcileRefreshedPosts(current, [
    {
      id: "post-a",
      revisionEpoch: "epoch-1",
      contentRevision: "4",
      assetsRevision: "4",
      text: "stale",
      media: [],
      tags: [],
    },
    {
      id: "post-b",
      revisionEpoch: "epoch-1",
      contentRevision: "1",
      assetsRevision: "1",
      text: "unrelated new post",
      media: [],
      tags: [],
    },
  ], new Map(), {
    assetsRevisionStore: assetRevisions,
    contentRevisionStore: contentRevisions,
    expectedSessionKey: "user-a:1",
  });

  assert.equal(reconciled.find((post) => post.id === "post-a").text, "edited");
  assert.equal(reconciled.find((post) => post.id === "post-b").text, "unrelated new post");

  const independentlyNewerAssets = reconcileRefreshedPosts(current, [{
    id: "post-a",
    revisionEpoch: "epoch-1",
    contentRevision: "4",
    assetsRevision: "6",
    text: "stale",
    media: ["new-media"],
    mediaLoaded: true,
    tags: ["new-tag"],
    tagsLoaded: true,
  }], new Map(), {
    assetsRevisionStore: assetRevisions,
    contentRevisionStore: contentRevisions,
    expectedSessionKey: "user-a:1",
  });
  assert.equal(independentlyNewerAssets[0].text, "edited");
  assert.deepEqual(independentlyNewerAssets[0].media, ["new-media"]);
  assert.deepEqual(independentlyNewerAssets[0].tags, ["new-tag"]);

  const assetFailure = reconcileRefreshedPosts(current, [{
    id: "post-a",
    revisionEpoch: "epoch-1",
    contentRevision: "6",
    assetsRevision: "6",
    text: "new body",
    media: [],
    mediaLoaded: false,
    tags: [],
    tagsLoaded: false,
  }], new Map(), {
    assetsRevisionStore: assetRevisions,
    contentRevisionStore: contentRevisions,
    expectedSessionKey: "user-a:1",
  });
  assert.deepEqual(assetFailure[0].media, ["existing-media"]);
  assert.deepEqual(assetFailure[0].tags, ["existing-tag"]);

  const tombstone = reconcileRefreshedPosts(current, [{
    id: "post-a",
    revisionEpoch: "epoch-1",
    contentRevision: "7",
    assetsRevision: "6",
    tombstoned: true,
  }], new Map(), {
    assetsRevisionStore: assetRevisions,
    contentRevisionStore: contentRevisions,
    expectedSessionKey: "user-a:1",
  });
  assert.deepEqual(tombstone, []);
});

test("session切替は旧sessionのrevision responseを受理しない", () => {
  const revisions = createEntityRevisionStore();
  revisions.beginSession("user-a:1");
  assert.equal(revisions.apply("post-1", { epoch: "epoch-1", domainRevision: "1" }, "user-a:1"), true);
  revisions.beginSession("user-b:2");
  assert.equal(revisions.get("post-1"), null);
  assert.equal(revisions.apply("post-1", { epoch: "epoch-1", domainRevision: "2" }, "user-a:1"), false);
  assert.equal(revisions.apply("post-1", { epoch: "epoch-1", domainRevision: "1" }, "user-b:2"), true);
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

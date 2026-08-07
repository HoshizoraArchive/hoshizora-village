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
  assert.equal(versions.isCurrent(laterRequest, "post-2"), false);

  versions.invalidate("post-1");
  assert.equal(versions.isCurrent(laterRequest, "post-1"), false);
});

test("viewer projectionはdomainとviewer contextの複合versionで判定する", () => {
  const revisions = createEntityRevisionStore();
  const first = { domainRevision: 2, viewerContextRevision: 3 };
  const staleViewer = { domainRevision: 3, viewerContextRevision: 2 };
  const nextViewer = { domainRevision: 2, viewerContextRevision: 4 };

  assert.equal(revisions.apply("post-1", first, "session-a"), true);
  assert.equal(revisions.apply("post-1", staleViewer, "session-a"), false);
  assert.equal(revisions.apply("post-1", nextViewer, "session-a"), true);
  assert.equal(revisions.apply("post-1", first, "session-b"), true);
});

test("viewer context mutationは全entity共通floorを進め古いprojectionを拒否する", () => {
  const revisions = createEntityRevisionStore();
  assert.equal(revisions.apply("post-1", { domainRevision: 5, viewerContextRevision: 5 }, "session-a"), true);
  assert.equal(revisions.apply("post-2", { domainRevision: 2, viewerContextRevision: 2 }, "session-a"), true);

  revisions.advanceViewerContextFloor(6, "session-a");

  assert.equal(revisions.apply("post-2", { domainRevision: 3, viewerContextRevision: 5 }, "session-a"), false);
  assert.equal(revisions.apply("post-2", { domainRevision: 3, viewerContextRevision: 6 }, "session-a"), true);
});

test("mutationは所有componentを巻き戻さず独立componentのfloorをmergeする", () => {
  const revisions = createEntityRevisionStore();
  assert.equal(revisions.apply("post-1", { domainRevision: 5, viewerContextRevision: 7 }, "session-a"), true);

  assert.equal(
    revisions.applyMutation(
      "post-1",
      { domainRevision: 6, viewerContextRevision: 2 },
      ["domainRevision"],
      "session-a",
    ),
    true,
  );
  assert.deepEqual(revisions.get("post-1"), { domainRevision: 6, viewerContextRevision: 7 });
});

test("entity revision floorは古いsnapshotを拒否し新しい0件を受理する", () => {
  const revisions = createEntityRevisionStore();
  assert.equal(revisions.apply("post-1", 5, "session-a"), true);
  assert.equal(revisions.apply("post-1", 4, "session-a"), false);
  assert.equal(revisions.apply("post-1", 6, "session-a"), true);
  assert.equal(revisions.apply("post-2", 0, "session-a"), true);
});

test("post reconciliationはentityごとに本文・tombstone・asset ownershipを守る", () => {
  const contentRevisions = createEntityRevisionStore();
  const assetsRevisions = createEntityRevisionStore();
  contentRevisions.apply("post-1", 5, "session-a");
  assetsRevisions.apply("post-1", 5, "session-a");

  const result = reconcileRefreshedPosts(
    [{ id: "post-1", text: "newer", deletedAt: null, media: [{ id: "new-media" }] }],
    [{ id: "post-1", text: "stale", deletedAt: "2026-01-01", media: [{ id: "stale-media" }] }],
    new Map(),
    {
      assetsRevisionStore: assetsRevisions,
      contentRevisionStore: contentRevisions,
      expectedSessionKey: "session-a",
      incomingAssetsRevision: 4,
      incomingContentRevision: 4,
    },
  );

  assert.equal(result[0].text, "newer");
  assert.equal(result[0].deletedAt, null);
  assert.deepEqual(result[0].media, [{ id: "new-media" }]);
});

test("session切替は旧sessionのrevision responseを受理しない", () => {
  assert.equal(canApplyRevisionVector("session-a", "session-a"), true);
  assert.equal(canApplyRevisionVector("session-a", "session-b"), false);
});

test("iPhone/PWA復帰は一定時間バックグラウンドだった場合だけ全データ再同期する", () => {
  assert.equal(shouldRefreshAfterForeground(0), false);
  assert.equal(shouldRefreshAfterForeground(APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS - 1), false);
  assert.equal(shouldRefreshAfterForeground(APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS), true);
});

test("再同期はローカル下書きstateを初期化する処理を持たない", () => {
  assert.equal(appSource.includes("setPostDraft(\"\")"), false);
  assert.equal(appSource.includes("setStarLetterDrafts({})"), false);
});

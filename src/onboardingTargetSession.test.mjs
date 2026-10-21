import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const src = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
const app = ast.program.body.find((node) => node.type === "FunctionDeclaration" && node.id?.name === "App");
assert.ok(app, "App declaration exists");
const targetEffect = app.body.body.find((node) =>
  node.type === "ExpressionStatement" &&
  node.expression.callee?.name === "useEffect" &&
  src.slice(node.start, node.end).includes("async function readOnboardingTargetPost()"),
);
assert.ok(targetEffect, "real target-fetching effect exists");
const effectSource = src.slice(targetEffect.expression.arguments[0].start, targetEffect.expression.arguments[0].end);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

function harness({ post = deferred(), profile = deferred(), assets = deferred(), targetId = "post-1" } = {}) {
  const live = { userId: "A", key: "A:1" };
  const state = { savedPosts: [], onboardingError: "" };
  const progressRef = { current: { user_id: "A", current_step: "archive_prompt", target_post_id: targetId } };
  const calls = { readPost: 0, readProfile: 0, assets: 0, ensureTarget: 0, logs: [] };
  let pendingUpdater = null;
  let holdSavedPostsUpdater = false;
  const env = {
    sessionOnboardingProgress: { ...progressRef.current },
    onboardingProgressRef: progressRef,
    authIdentityEpoch: 1,
    savedPosts: [], archivedPosts: [], profileFrames: {},
    captureDataMutationSession: () => ({ userId: live.userId, sessionKey: live.key }),
    isCurrentDataMutationSession: (ticket) => ticket?.userId === live.userId && ticket?.sessionKey === live.key,
    isOnboardingActive: (p) => Boolean(p),
    advanceInitialOnboarding: () => { calls.ensureTarget++; return Promise.resolve(); },
    runPostQuery: async (callback) => {
      calls.readPost++;
      assert.equal(typeof callback, "function");
      return post.promise;
    },
    runProfileQuery: async (callback) => {
      calls.readProfile++;
      assert.equal(typeof callback, "function");
      return profile.promise;
    },
    hydratePostsWithAssets: async (posts) => {
      calls.assets++;
      assert.equal(posts.length, 1);
      return assets.promise;
    },
    mapSavedPost: (p, author) => ({ ...p, author }),
    reconcilePostSnapshots: (_current, entries) => entries,
    setSavedPosts: (updater) => {
      if (holdSavedPostsUpdater) {
        pendingUpdater = updater;
      } else {
        state.savedPosts = typeof updater === "function" ? updater(state.savedPosts) : updater;
      }
    },
    setOnboardingError: (message) => { state.onboardingError = message; },
    logSafeError: (...values) => { calls.logs.push(values); },
    ERROR_OPERATION: { POST_LOAD: "post_load", MEDIA_LOAD: "media_load" },
    isMissingPostMediaError: () => false,
    isMissingMeteorTagsError: () => false,
    // The query chains are callbacks passed to runPostQuery / runProfileQuery;
    // they must never make real Supabase requests in this harness.
    supabase: {},
    applyVisiblePostTypeFilter: (query) => query,
    PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME: "id,display_name,frame",
    PROFILE_BASIC_SELECT_COLUMNS: "id,display_name",
  };
  const effect = new Function(...Object.keys(env), "return (" + effectSource + ")")(...Object.values(env));
  return {
    live, state, progressRef, calls, post, profile, assets,
    start: () => effect(),
    switchAndReturn: () => {
      live.userId = "B"; live.key = "B:2";
      live.userId = "A"; live.key = "A:3";
    },
    changeTarget: (target) => { progressRef.current = { ...progressRef.current, target_post_id: target }; },
    holdUpdater: () => { holdSavedPostsUpdater = true; },
    applyUpdater: () => {
      assert.ok(pendingUpdater, "updater should have been enqueued");
      state.savedPosts = pendingUpdater(state.savedPosts);
    },
  };
}
const fetchedPost = { id: "post-1", author_id: "author-1" };
const fetchedProfile = { id: "author-1", display_name: "Writer" };
const hydratedPost = { ...fetchedPost, author: fetchedProfile, asset: "cover" };

test("A→B→A without React render rejects old target-post response", async () => {
  const c = harness();
  c.start();
  c.switchAndReturn();
  c.post.resolve({ data: fetchedPost, error: null });
  await flush();
  assert.deepEqual(c.state.savedPosts, []);
  assert.equal(c.calls.readProfile, 0);
  assert.equal(c.calls.assets, 0);
});
test("A→B→A ignores stale target fetch failure and its error message", async () => {
  const c = harness();
  c.start();
  c.switchAndReturn();
  c.post.resolve({ data: null, error: { code: "old-A-error" } });
  await flush();
  assert.equal(c.state.onboardingError, "");
  assert.equal(c.calls.logs.length, 0);
});
test("A→B→A ignores stale missing target instead of requesting new RPC target", async () => {
  const c = harness();
  c.start();
  c.switchAndReturn();
  c.post.resolve({ data: null, error: null });
  await flush();
  assert.equal(c.calls.ensureTarget, 0);
});
test("A→B→A during author lookup cannot insert old post into new account", async () => {
  const c = harness();
  c.start();
  c.post.resolve({ data: fetchedPost, error: null });
  await flush();
  assert.equal(c.calls.readProfile, 1);
  c.switchAndReturn();
  c.profile.resolve({ data: fetchedProfile });
  await flush();
  assert.deepEqual(c.state.savedPosts, []);
  assert.equal(c.calls.assets, 0);
});
test("A→B→A during asset hydration cannot insert old media or stale errors", async () => {
  const c = harness();
  c.start();
  c.post.resolve({ data: fetchedPost, error: null });
  await flush();
  c.profile.resolve({ data: fetchedProfile });
  await flush();
  assert.equal(c.calls.assets, 1);
  c.switchAndReturn();
  c.assets.resolve({ posts: [hydratedPost], error: new Error("old media") });
  await flush();
  assert.deepEqual(c.state.savedPosts, []);
  assert.equal(c.calls.logs.length, 0);
});
test("progress switching to another target in same session discards previous response", async () => {
  const c = harness();
  c.start();
  c.changeTarget("post-2");
  c.post.resolve({ data: fetchedPost, error: null });
  await flush();
  assert.deepEqual(c.state.savedPosts, []);
  assert.equal(c.calls.readProfile, 0);
});
test("queued React functional updater rechecks session before touching new account posts", async () => {
  const c = harness();
  c.holdUpdater();
  c.start();
  c.post.resolve({ data: fetchedPost, error: null }); await flush();
  c.profile.resolve({ data: fetchedProfile }); await flush();
  c.assets.resolve({ posts: [hydratedPost], error: null }); await flush();
  c.switchAndReturn();
  c.state.savedPosts = [{ id: "B-saved", author_id: "B" }];
  c.applyUpdater();
  assert.deepEqual(c.state.savedPosts, [{ id: "B-saved", author_id: "B" }]);
});
test("normal same-session load hydrates target and preserves surrounding posts", async () => {
  const c = harness();
  c.state.savedPosts = [{ id: "existing" }];
  c.start();
  c.post.resolve({ data: fetchedPost, error: null }); await flush();
  c.profile.resolve({ data: fetchedProfile }); await flush();
  c.assets.resolve({ posts: [hydratedPost], error: null }); await flush();
  assert.deepEqual(c.state.savedPosts.map((p) => p.id), ["post-1", "existing"]);
  assert.equal(c.state.savedPosts[0].asset, "cover");
});
test("missing post same session still calls ensure_target once", async () => {
  const c = harness();
  c.start();
  c.post.resolve({ data: null, error: null });
  await flush();
  assert.equal(c.calls.ensureTarget, 1);
});
test("error same session displays safe message without adding partial post", async () => {
  const c = harness();
  c.start();
  c.post.resolve({ data: null, error: new Error("transport") });
  await flush();
  assert.match(c.state.onboardingError, /読み込めませんでした/);
  assert.deepEqual(c.state.savedPosts, []);
});
test("target effect is refreshed when auth identity epoch changes even if step and post ID stay same", () => {
  const dependencies = targetEffect.expression.arguments[1]?.elements?.map((n) => src.slice(n.start, n.end));
  assert.ok(dependencies.includes("authIdentityEpoch"), "auth generation must be tracked for A→B→A");
});
test("current post-fetch rejection is caught and displays a safe user error", async () => {
  const c = harness();
  c.start();
  c.post.reject(new Error("internal URL or token"));
  await flush();
  assert.match(c.state.onboardingError, /読み込めませんでした/);
  assert.equal(c.calls.logs.length, 1);
  assert.deepEqual(c.state.savedPosts, []);
});
test("stale post-fetch rejection is ignored after A→B→A", async () => {
  const c = harness();
  c.start();
  c.switchAndReturn();
  c.post.reject(new Error("old private error"));
  await flush();
  assert.equal(c.state.onboardingError, "");
  assert.equal(c.calls.logs.length, 0);
});
test("current author-fetch rejection does not leave unhandled Promise", async () => {
  const c = harness();
  c.start();
  c.post.resolve({ data: fetchedPost, error: null }); await flush();
  c.profile.reject(new Error("private profile read"));
  await flush();
  assert.match(c.state.onboardingError, /読み込めませんでした/);
  assert.equal(c.calls.logs.length, 1);
});
test("stale author-fetch rejection does not affect the switched account", async () => {
  const c = harness();
  c.start();
  c.post.resolve({ data: fetchedPost, error: null }); await flush();
  c.switchAndReturn();
  c.profile.reject(new Error("old A profile error"));
  await flush();
  assert.equal(c.state.onboardingError, "");
  assert.equal(c.calls.logs.length, 0);
});
test("current media hydration failure shows safe error without inserting partial post", async () => {
  const c = harness();
  c.start();
  c.post.resolve({ data: fetchedPost, error: null }); await flush();
  c.profile.resolve({ data: fetchedProfile }); await flush();
  c.assets.reject(new Error("private media detail")); await flush();
  assert.match(c.state.onboardingError, /読み込めませんでした/);
  assert.deepEqual(c.state.savedPosts, []);
});
test("onboarding target never mutates posts after effect cleanup", async () => {
  const c = harness();
  const stop = c.start();
  stop();
  c.post.resolve({ data: fetchedPost, error: null });
  await flush();
  assert.equal(c.calls.readProfile, 0);
  assert.deepEqual(c.state.savedPosts, []);
});

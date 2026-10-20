import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";
import { createPostMediaTaskGate } from "./lib/postMediaTaskGate.js";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const ast = parse(appSource, { sourceType: "module", plugins: ["jsx"] });
const app = ast.program.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === "App");
assert.ok(app, "App component exists");
const functionNames = [
  "currentPostMediaSessionKey",
  "capturePostMediaTask",
  "isCurrentPostMediaTask",
  "invalidatePendingPostMediaWork",
  "cancelPostMediaConversionSafely",
  "prepareAutomaticVideoCoverDraft",
  "handlePostVideoFileChange",
  "handleUseTrimmedPostVideo",
  "handleUsePostCoverCrop",
];
const functions = functionNames.map((name) => {
  const node = app.body.body.find((n) => n.type === "FunctionDeclaration" && n.id.name === name);
  assert.ok(node, `missing real handler ${name}`);
  return appSource.slice(node.start, node.end);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createHarness(overrides = {}) {
  const calls = [];
  const ctx = {
    dataSessionKeyRef: { current: "A:1" },
    activeSessionUserIdRef: { current: "A" },
    appMountedRef: { current: true },
    postMediaTaskGateRef: { current: createPostMediaTaskGate() },
    automaticCoverGenerationRef: { current: 0 },
    postVideoTrimCancelRequestedRef: { current: false },
    postVideoTrimConversionRef: { current: null },
    postVideoDraftRef: { current: null },
    postThumbnailDraftRef: { current: null },
    logSafeError: (...args) => calls.push(["log", ...args]),
    ERROR_OPERATION: { VIDEO_TRIM: "trim", VIDEO_THUMBNAIL: "thumbnail" },
    createVideoCoverFile: async () => null,
    setPostThumbnailDraft: (v) => calls.push(["thumbnail", v]),
    revokePostThumbnailDraft: (v) => calls.push(["revoke-thumbnail", v]),
    ...overrides,
  };
  const api = new Function(...Object.keys(ctx), `
    ${functions.join("\n\n")}
    return { ${functionNames.join(", ")} };
  `)(...Object.values(ctx));
  return { ctx, api, calls };
}

test("gate invalidates pending work after account switch, including same-account refresh", () => {
  const gate = createPostMediaTaskGate();
  const first = gate.capture("user-A:session-1");
  assert.equal(gate.isCurrent(first, "user-A:session-1"), true);
  assert.equal(gate.isCurrent(first, "user-B:session-2"), false);
  gate.invalidate();
  assert.equal(gate.isCurrent(first, "user-A:session-1"), false);
  const second = gate.capture("user-A:session-1");
  assert.equal(gate.isCurrent(second, "user-A:session-1"), true);
  assert.equal(gate.isCurrent(null, "user-A:session-1"), false);
});

test("late automatic cover is revoked, never applied after logout", async () => {
  const pendingCover = deferred();
  const originalVideo = { id: "old-video" };
  const discardedCover = { previewUrl: "blob:old-thumbnail" };
  const { api, ctx, calls } = createHarness({
    postVideoDraftRef: { current: originalVideo },
    createVideoCoverFile: () => pendingCover.promise,
  });
  const task = api.capturePostMediaTask();
  const work = api.prepareAutomaticVideoCoverDraft({}, 30, originalVideo, task);
  ctx.activeSessionUserIdRef.current = "B";
  api.invalidatePendingPostMediaWork();
  pendingCover.resolve(discardedCover);
  await work;
  assert.deepEqual(calls, [["revoke-thumbnail", discardedCover]]);
  assert.equal(ctx.postThumbnailDraftRef.current, null);
});

test("manual thumbnail selection wins over still-running automatic cover", async () => {
  const pendingCover = deferred();
  const originalVideo = { id: "video" };
  const manualCover = { previewUrl: "blob:manual" };
  const autoCover = { previewUrl: "blob:auto" };
  const { api, ctx, calls } = createHarness({
    postVideoDraftRef: { current: originalVideo },
    createVideoCoverFile: () => pendingCover.promise,
  });
  const task = api.capturePostMediaTask();
  const work = api.prepareAutomaticVideoCoverDraft({}, 30, originalVideo, task);
  ctx.automaticCoverGenerationRef.current += 1;
  ctx.postThumbnailDraftRef.current = manualCover;
  pendingCover.resolve(autoCover);
  await work;
  assert.equal(ctx.postThumbnailDraftRef.current, manualCover);
  assert.deepEqual(calls, [["revoke-thumbnail", autoCover]]);
});

test("pending video metadata cannot open trim UI or modify next account", async () => {
  const pendingMetadata = deferred();
  const preparingCalls = [];
  const messages = [];
  const { api, ctx } = createHarness({
    postSaving: false,
    postVideoPreparing: false,
    postImageDrafts: [],
    METEOR_VIDEO_ALLOWED_TYPES: { "video/mp4": true },
    METEOR_VIDEO_SOURCE_MAX_SIZE_BYTES: 500_000_000,
    METEOR_VIDEO_MAX_DURATION_SECONDS: 35,
    METEOR_VIDEO_MAX_SIZE_BYTES: 100_000_000,
    setPostVideoPreparing: (v) => preparingCalls.push(v),
    setPostMessage: (v) => messages.push(v),
    setPostError: (v) => messages.push(v),
    loadVideoMetadataFromFile: () => pendingMetadata.promise,
    openPostVideoTrimDraft: () => assert.fail("stale file must not open trim UI"),
    applySelectedPostVideo: () => assert.fail("stale file must not become a selected draft"),
  });
  const event = { target: { files: [{ type: "video/mp4", name: "old.mp4", size: 1000 }], value: "old" } };
  const work = api.handlePostVideoFileChange(event);
  assert.deepEqual(preparingCalls, [true]);
  ctx.activeSessionUserIdRef.current = "B";
  api.invalidatePendingPostMediaWork();
  pendingMetadata.resolve({ durationSeconds: 50 });
  await work;
  assert.deepEqual(preparingCalls, [true], "old finally must not reset a new account's loading state");
  assert.deepEqual(messages, ["", ""]);
});

test("logout invalidates an in-flight conversion, and late results cannot publish", async () => {
  const pendingConversion = deferred();
  let canceled = 0;
  let progress;
  const { api, ctx } = createHarness({
    postVideoTrimDraft: { durationSeconds: 70, name: "old", file: { name: "old.mp4" } },
    postVideoTrimProcessing: false,
    postVideoTrimLength: 12,
    postVideoTrimStart: 0,
    clampNumber: (n, min, max) => Math.min(max, Math.max(min, n)),
    METEOR_VIDEO_MAX_DURATION_SECONDS: 35,
    setPostVideoTrimProcessing: () => {},
    setPostVideoTrimProgress: () => {},
    setPostVideoTrimError: () => {},
    setPostError: () => {},
    setPostMessage: (message) => {
      if (message) assert.fail("stale work cannot show success");
    },
    createTrimmedVideoFile: ({ onConversionReady, onProgress }) => {
      progress = onProgress;
      onConversionReady({ cancel: async () => { canceled += 1; } });
      return pendingConversion.promise;
    },
    loadVideoMetadataFromFile: () => assert.fail("old result must not continue to metadata"),
    applySelectedPostVideo: () => assert.fail("old result must not become a draft"),
  });
  const work = api.handleUseTrimmedPostVideo();
  ctx.activeSessionUserIdRef.current = "B";
  api.invalidatePendingPostMediaWork();
  await Promise.resolve();
  assert.equal(canceled, 1);
  progress(0.5);
  pendingConversion.resolve({ size: 10 });
  await work;
});

test("conversion initialized after session invalidation is canceled immediately", async () => {
  const pendingConversion = deferred();
  let ready;
  let cancelCalls = 0;
  const { api, ctx } = createHarness({
    postVideoTrimDraft: { durationSeconds: 70, name: "old", file: { name: "old.mp4" } },
    postVideoTrimProcessing: false,
    postVideoTrimLength: 12,
    postVideoTrimStart: 0,
    clampNumber: (n, min, max) => Math.min(max, Math.max(min, n)),
    METEOR_VIDEO_MAX_DURATION_SECONDS: 35,
    setPostVideoTrimProcessing: () => {},
    setPostVideoTrimProgress: () => {},
    setPostVideoTrimError: () => {},
    setPostError: () => {},
    setPostMessage: (message) => { if (message) assert.fail("stale task displayed message"); },
    createTrimmedVideoFile: ({ onConversionReady }) => {
      ready = onConversionReady;
      return pendingConversion.promise;
    },
  });
  const work = api.handleUseTrimmedPostVideo();
  ctx.activeSessionUserIdRef.current = "B";
  api.invalidatePendingPostMediaWork();
  ready({ cancel: () => { cancelCalls += 1; return Promise.resolve(); } });
  assert.equal(cancelCalls, 1, "cancel is requested before the conversion starts executing");
  pendingConversion.resolve({ size: 10 });
  await work;
  assert.equal(ctx.postVideoTrimConversionRef.current, null, "stale conversion never becomes current");
});

test("late cover crop must not replace the next session's thumbnail", async () => {
  const crop = deferred();
  const calls = [];
  const { api, ctx } = createHarness({
    postCoverCropFile: { name: "manual.png" },
    postCoverCropFrameSize: { width: 320, height: 180 },
    postCoverCropOffset: { x: 0, y: 0 },
    postCoverCropZoom: 1,
    createCroppedPostCoverBlob: () => crop.promise,
    createFileFromBlob: () => ({ name: "cover.jpg" }),
    createVideoCoverFileName: (name) => name,
    METEOR_VIDEO_THUMBNAIL_TYPE: "image/jpeg",
    setPostCoverCropPreparing: (value) => calls.push(["preparing", value]),
    setPostMessage: () => {},
    setPostError: (value) => { if (value) assert.fail("stale crop cannot show errors"); },
    createPostThumbnailDraft: () => assert.fail("stale crop cannot create a thumbnail URL"),
  });
  const work = api.handleUsePostCoverCrop();
  ctx.activeSessionUserIdRef.current = "B";
  api.invalidatePendingPostMediaWork();
  crop.resolve({});
  await work;
  assert.deepEqual(calls, [["preparing", true]]);
});

test("logout resets trim and cover drafts as well as existing media drafts", () => {
  const region = appSource.slice(appSource.indexOf('useEffect(() => {\n    if (previousDataSessionUserIdRef.current === sessionUserId)'), appSource.indexOf('}, [sessionUserId]);'));
  for (const action of [
    "invalidatePendingPostMediaWork();",
    "clearPostImageDrafts();",
    "clearPostVideoDraft();",
    "clearPostThumbnailDraft();",
    "clearPostVideoTrimDraft();",
    "clearPostCoverCropDraft();",
    "setPostVideoPreparing(false);",
  ]) {
    assert.ok(region.includes(action), `session reset is missing ${action}`);
  }
  assert.ok(appSource.includes('appMountedRef.current = false;\n      invalidatePendingPostMediaWork();'));
});

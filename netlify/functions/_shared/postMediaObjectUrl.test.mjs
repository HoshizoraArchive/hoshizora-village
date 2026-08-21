import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.jsx", "utf8");

function findMatchingDelimiter(source, startIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      const lineEnd = source.indexOf("\n", index + 2);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 1;
      continue;
    }

    if (character === openCharacter) {
      depth += 1;
    } else if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`unmatched ${openCharacter} at ${startIndex}`);
}

function extractNamedFunction(name) {
  const marker = `function ${name}(`;
  let startIndex = appSource.indexOf(marker);
  assert.notEqual(startIndex, -1, `missing function: ${name}`);

  if (appSource.slice(startIndex - 6, startIndex) === "async ") {
    startIndex -= 6;
  }

  const parametersStart = appSource.indexOf("(", startIndex);
  const parametersEnd = findMatchingDelimiter(appSource, parametersStart, "(", ")");
  const bodyStart = appSource.indexOf("{", parametersEnd);
  const bodyEnd = findMatchingDelimiter(appSource, bodyStart, "{", "}");
  return appSource.slice(startIndex, bodyEnd + 1);
}

function evaluateNamedFunction(name, scope = {}) {
  const scopeNames = Object.keys(scope);
  const factory = new Function(
    ...scopeNames,
    `"use strict";\n${extractNamedFunction(name)}\nreturn ${name};`,
  );
  return factory(...scopeNames.map((scopeName) => scope[scopeName]));
}

function getCallArguments(name) {
  const argumentsList = [];
  const marker = `${name}(`;
  let searchIndex = 0;

  while (searchIndex < appSource.length) {
    const callIndex = appSource.indexOf(marker, searchIndex);
    if (callIndex === -1) {
      break;
    }

    const argumentsStart = callIndex + name.length;
    const argumentsEnd = findMatchingDelimiter(appSource, argumentsStart, "(", ")");
    argumentsList.push(appSource.slice(argumentsStart + 1, argumentsEnd));
    searchIndex = argumentsEnd + 1;
  }

  return argumentsList;
}

function createObjectUrlTracker() {
  const created = [];
  const revoked = [];

  return {
    created,
    revoked,
    URL: {
      createObjectURL(file) {
        const objectUrl = `blob:test-${created.length + 1}`;
        created.push({ file, objectUrl });
        return objectUrl;
      },
      revokeObjectURL(objectUrl) {
        revoked.push(objectUrl);
      },
    },
  };
}

function createStrictModeState(initialValue) {
  let currentValue = initialValue;
  let functionalUpdaterCalls = 0;

  return {
    get value() {
      return currentValue;
    },
    get functionalUpdaterCalls() {
      return functionalUpdaterCalls;
    },
    set(nextValue) {
      if (typeof nextValue === "function") {
        functionalUpdaterCalls += 2;
        nextValue(currentValue);
        currentValue = nextValue(currentValue);
        return;
      }

      currentValue = nextValue;
    },
  };
}

function createFile(name, type = "image/jpeg", size = 1024) {
  return { name, size, type };
}

test("media draftのstate updaterはObject URL副作用を持たない", () => {
  for (const setterName of [
    "setPostImageDrafts",
    "setPostVideoDraft",
    "setPostThumbnailDraft",
    "setPostVideoTrimDraft",
  ]) {
    for (const callArguments of getCallArguments(setterName)) {
      if (!callArguments.includes("=>")) {
        continue;
      }

      assert.doesNotMatch(
        callArguments,
        /URL\.|createPost(?:Image|Video|Thumbnail)Draft|revokePost(?:Image|Video|Thumbnail)Draft|setPostError\(/,
        `${setterName} updater must stay pure`,
      );
    }
  }

  const imageHandlerSource = extractNamedFunction("handlePostImageFileChange");
  const videoHandlerSource = extractNamedFunction("applySelectedPostVideo");
  const trimHandlerSource = extractNamedFunction("openPostVideoTrimDraft");
  const coverHandlerSource = extractNamedFunction("handleUsePostCoverCrop");

  assert.ok(imageHandlerSource.indexOf("createPostImageDraft(file)") < imageHandlerSource.indexOf("setPostImageDrafts(nextDrafts)"));
  assert.ok(videoHandlerSource.indexOf("createPostVideoDraft(file, metadata)") < videoHandlerSource.indexOf("setPostVideoDraft(nextDraft)"));
  assert.ok(trimHandlerSource.indexOf("URL.createObjectURL(file)") < trimHandlerSource.indexOf("setPostVideoTrimDraft(nextDraft)"));
  assert.ok(coverHandlerSource.indexOf("createPostThumbnailDraft(coverFile") < coverHandlerSource.indexOf("setPostThumbnailDraft(nextDraft)"));
});

test("StrictMode相当でも画像は1ファイル1URLで、複数追加・削除・clear時に解放する", () => {
  const tracker = createObjectUrlTracker();
  let nextId = 0;
  const createPostImageDraft = evaluateNamedFunction("createPostImageDraft", {
    URL: tracker.URL,
    createClientId: () => `image-${++nextId}`,
  });
  const revokePostImageDraft = evaluateNamedFunction("revokePostImageDraft", { URL: tracker.URL });
  const postImageDraftsRef = { current: [] };
  const imageState = createStrictModeState([]);
  const commonScope = {
    METEOR_IMAGE_ALLOWED_TYPES: { "image/jpeg": true },
    METEOR_IMAGE_MAX_COUNT: 4,
    METEOR_IMAGE_MAX_SIZE_BYTES: 8 * 1024 * 1024,
    createPostImageDraft,
    postImageDraftsRef,
    postSaving: false,
    postVideoDraft: null,
    setPostError() {},
    setPostImageDrafts: imageState.set,
    setPostMessage() {},
  };
  const handlePostImageFileChange = evaluateNamedFunction("handlePostImageFileChange", commonScope);

  handlePostImageFileChange({ target: { files: [createFile("one.jpg")], value: "selected" } });
  assert.equal(tracker.created.length, 1);
  assert.deepEqual(imageState.value.map((draft) => draft.name), ["one.jpg"]);

  handlePostImageFileChange({
    target: { files: [createFile("two.jpg"), createFile("three.jpg")], value: "selected" },
  });
  assert.equal(tracker.created.length, 3);
  assert.deepEqual(imageState.value.map((draft) => draft.name), ["one.jpg", "two.jpg", "three.jpg"]);
  assert.equal(imageState.functionalUpdaterCalls, 0);

  const removedDraft = imageState.value[1];
  const handleRemovePostImageDraft = evaluateNamedFunction("handleRemovePostImageDraft", {
    postImageDraftsRef,
    postSaving: false,
    revokePostImageDraft,
    setPostImageDrafts: imageState.set,
  });
  handleRemovePostImageDraft(removedDraft.id);
  assert.deepEqual(tracker.revoked, [removedDraft.previewUrl]);

  const clearPostImageDrafts = evaluateNamedFunction("clearPostImageDrafts", {
    postImageDraftsRef,
    revokePostImageDraft,
    setPostImageDrafts: imageState.set,
  });
  const remainingUrls = imageState.value.map((draft) => draft.previewUrl);
  clearPostImageDrafts();

  assert.deepEqual(imageState.value, []);
  assert.deepEqual(new Set(tracker.revoked), new Set([removedDraft.previewUrl, ...remainingUrls]));
});

test("動画draftは選択ごとに1URLだけ生成し、置換とclearで旧URLを解放する", async () => {
  const tracker = createObjectUrlTracker();
  let nextId = 0;
  const getSafeDisplayFileName = (name, fallback) => name || fallback;
  const createPostVideoDraft = evaluateNamedFunction("createPostVideoDraft", {
    URL: tracker.URL,
    createClientId: () => `video-${++nextId}`,
    getSafeDisplayFileName,
  });
  const revokePostVideoDraft = evaluateNamedFunction("revokePostVideoDraft", { URL: tracker.URL });
  const postVideoDraftRef = { current: null };
  const videoState = createStrictModeState(null);
  const applySelectedPostVideo = evaluateNamedFunction("applySelectedPostVideo", {
    clearPostThumbnailDraft() {},
    createPostVideoDraft,
    postVideoDraftRef,
    prepareAutomaticVideoCoverDraft: async () => {},
    revokePostVideoDraft,
    setPostVideoDraft: videoState.set,
  });
  const metadata = { durationSeconds: 10 };

  await applySelectedPostVideo(createFile("one.mp4", "video/mp4"), metadata);
  await applySelectedPostVideo(createFile("two.mp4", "video/mp4"), metadata);

  assert.equal(tracker.created.length, 2);
  assert.deepEqual(tracker.revoked, ["blob:test-1"]);
  assert.equal(videoState.value.name, "two.mp4");
  assert.equal(videoState.functionalUpdaterCalls, 0);

  const clearPostVideoDraft = evaluateNamedFunction("clearPostVideoDraft", {
    postVideoDraftRef,
    revokePostVideoDraft,
    setPostVideoDraft: videoState.set,
  });
  clearPostVideoDraft();

  assert.equal(videoState.value, null);
  assert.deepEqual(tracker.revoked, ["blob:test-1", "blob:test-2"]);
});

test("動画トリミングdraftは置換・modal closeで解放し余分なURLを生成しない", () => {
  const tracker = createObjectUrlTracker();
  const revokePostVideoTrimDraft = evaluateNamedFunction("revokePostVideoTrimDraft", { URL: tracker.URL });
  const postVideoTrimDraftRef = { current: null };
  const trimState = createStrictModeState(null);
  const postVideoTrimConversionRef = { current: null };
  const postVideoTrimCancelRequestedRef = { current: false };
  const noOp = () => {};
  const openPostVideoTrimDraft = evaluateNamedFunction("openPostVideoTrimDraft", {
    METEOR_VIDEO_MAX_DURATION_SECONDS: 35,
    URL: tracker.URL,
    getSafeDisplayFileName: (name, fallback) => name || fallback,
    postVideoTrimCancelRequestedRef,
    postVideoTrimConversionRef,
    postVideoTrimDraftRef,
    revokePostVideoTrimDraft,
    setPostVideoTrimDraft: trimState.set,
    setPostVideoTrimError: noOp,
    setPostVideoTrimLength: noOp,
    setPostVideoTrimProcessing: noOp,
    setPostVideoTrimProgress: noOp,
    setPostVideoTrimStart: noOp,
  });

  openPostVideoTrimDraft(createFile("long-one.mp4", "video/mp4"), { durationSeconds: 60 });
  openPostVideoTrimDraft(createFile("long-two.mp4", "video/mp4"), { durationSeconds: 55 });

  assert.equal(tracker.created.length, 2);
  assert.deepEqual(tracker.revoked, ["blob:test-1"]);
  assert.equal(trimState.functionalUpdaterCalls, 0);

  const clearPostVideoTrimDraft = evaluateNamedFunction("clearPostVideoTrimDraft", {
    METEOR_VIDEO_MAX_DURATION_SECONDS: 35,
    postVideoTrimCancelRequestedRef,
    postVideoTrimConversionRef,
    postVideoTrimDraftRef,
    revokePostVideoTrimDraft,
    setPostVideoTrimDraft: trimState.set,
    setPostVideoTrimError: noOp,
    setPostVideoTrimLength: noOp,
    setPostVideoTrimProcessing: noOp,
    setPostVideoTrimProgress: noOp,
    setPostVideoTrimStart: noOp,
  });
  clearPostVideoTrimDraft();

  assert.equal(trimState.value, null);
  assert.deepEqual(tracker.revoked, ["blob:test-1", "blob:test-2"]);
});

test("表紙draftは置換・clear・非同期中のunmountで解放する", async () => {
  const tracker = createObjectUrlTracker();
  let nextId = 0;
  const createPostThumbnailDraft = evaluateNamedFunction("createPostThumbnailDraft", {
    URL: tracker.URL,
    createClientId: () => `thumbnail-${++nextId}`,
    getSafeDisplayFileName: (name, fallback) => name || fallback,
  });
  const revokePostThumbnailDraft = evaluateNamedFunction("revokePostThumbnailDraft", { URL: tracker.URL });
  const postThumbnailDraftRef = { current: { previewUrl: "blob:old-thumbnail" } };
  const thumbnailState = createStrictModeState(postThumbnailDraftRef.current);
  const appMountedRef = { current: true };
  const prepareAutomaticVideoCoverDraft = evaluateNamedFunction("prepareAutomaticVideoCoverDraft", {
    ERROR_OPERATION: { VIDEO_THUMBNAIL: "video_thumbnail" },
    appMountedRef,
    createVideoCoverFile: async (file) => createPostThumbnailDraft(file, { displayName: "自動表紙" }),
    logSafeError() {},
    postThumbnailDraftRef,
    revokePostThumbnailDraft,
    setPostThumbnailDraft: thumbnailState.set,
  });

  await prepareAutomaticVideoCoverDraft(createFile("cover-one.jpg"), 10);
  assert.equal(tracker.created.length, 1);
  assert.deepEqual(tracker.revoked, ["blob:old-thumbnail"]);
  assert.equal(thumbnailState.functionalUpdaterCalls, 0);

  const clearPostThumbnailDraft = evaluateNamedFunction("clearPostThumbnailDraft", {
    postThumbnailDraftRef,
    revokePostThumbnailDraft,
    setPostThumbnailDraft: thumbnailState.set,
  });
  clearPostThumbnailDraft();
  assert.deepEqual(tracker.revoked, ["blob:old-thumbnail", "blob:test-1"]);

  appMountedRef.current = false;
  await prepareAutomaticVideoCoverDraft(createFile("cover-after-unmount.jpg"), 10);
  assert.equal(tracker.created.length, 2);
  assert.deepEqual(tracker.revoked, ["blob:old-thumbnail", "blob:test-1", "blob:test-2"]);
  assert.equal(thumbnailState.value, null);
});

test("App unmountは残存する画像・動画・表紙・トリミングURLをすべて解放する", () => {
  const tracker = createObjectUrlTracker();
  const revokePostImageDraft = evaluateNamedFunction("revokePostImageDraft", { URL: tracker.URL });
  const revokePostVideoDraft = evaluateNamedFunction("revokePostVideoDraft", { URL: tracker.URL });
  const revokePostThumbnailDraft = evaluateNamedFunction("revokePostThumbnailDraft", { URL: tracker.URL });
  const revokePostVideoTrimDraft = evaluateNamedFunction("revokePostVideoTrimDraft", { URL: tracker.URL });
  const revokePostMediaDrafts = evaluateNamedFunction("revokePostMediaDrafts", {
    revokePostImageDraft,
    revokePostThumbnailDraft,
    revokePostVideoDraft,
    revokePostVideoTrimDraft,
  });

  revokePostMediaDrafts({
    imageDrafts: [{ previewUrl: "blob:image-1" }, { previewUrl: "blob:image-2" }],
    thumbnailDraft: { previewUrl: "blob:thumbnail" },
    videoDraft: { previewUrl: "blob:video" },
    videoTrimDraft: { previewUrl: "blob:trim" },
  });

  assert.deepEqual(tracker.revoked, [
    "blob:image-1",
    "blob:image-2",
    "blob:video",
    "blob:thumbnail",
    "blob:trim",
  ]);
  for (const token of [
    "imageDrafts: postImageDraftsRef.current",
    "thumbnailDraft: postThumbnailDraftRef.current",
    "videoDraft: postVideoDraftRef.current",
    "videoTrimDraft: postVideoTrimDraftRef.current",
  ]) {
    assert.equal(appSource.includes(token), true, `unmount cleanup is missing: ${token}`);
  }
  assert.match(appSource, /if \(postCoverCropPreviewUrl\) \{\s+URL\.revokeObjectURL\(postCoverCropPreviewUrl\)/);
});

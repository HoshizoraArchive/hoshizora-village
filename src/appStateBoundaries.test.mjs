import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { useVillageRouteViewState } from "./hooks/useVillageRouteViewState.js";
import { usePostMediaDraftState } from "./hooks/usePostMediaDraftState.js";
import { useStarLetterUiState } from "./hooks/useStarLetterUiState.js";
import { useFeedbackUiState } from "./hooks/useFeedbackUiState.js";

function renderHook(hook) {
  let result;
  function HookHarness() {
    result = hook();
    return React.createElement("span", null, "hook-ok");
  }
  assert.match(renderToStaticMarkup(React.createElement(HookHarness)), /hook-ok/);
  return result;
}

test("navigation state initializes from a lazy route getter, with isolated profile and tag views", () => {
  let routeReads = 0;
  const route = { name: "meteor", postId: "post-1" };
  const state = renderHook(() => useVillageRouteViewState(() => {
    routeReads += 1;
    return route;
  }));
  assert.equal(routeReads, 1);
  assert.equal(state.activeTab, "observe");
  assert.equal(state.route, route);
  assert.deepEqual(state.publicProfilePosts, []);
  assert.deepEqual(state.publicProfileTags, []);
  assert.deepEqual(state.meteorTagPosts, []);
  assert.equal(state.detailPostLoading, false);
  assert.equal(state.shareMessage, "");
  assert.equal(state.profileShareError, "");
  assert.equal(typeof state.setRoute, "function");
});

test("post media draft state keeps separate stable ref containers and crop defaults", () => {
  const state = renderHook(() => usePostMediaDraftState({ coverFallbackHeight: 180, coverFallbackWidth: 320 }));
  assert.equal(state.postDraft, "");
  assert.deepEqual(state.postImageDrafts, []);
  assert.equal(state.postVideoDraft, null);
  assert.equal(state.postVideoTrimLength, 35);
  assert.deepEqual(state.postCoverCropOffset, { x: 0, y: 0 });
  assert.deepEqual(state.postCoverCropFrameSize, { height: 180, width: 320 });
  assert.equal(state.postCoverCropZoom, 1);
  assert.notEqual(state.postVideoDraftRef, state.postThumbnailDraftRef);
  assert.notEqual(state.postVideoTrimConversionRef, state.postVideoTrimCancelRequestedRef);
  assert.equal(typeof state.setPostVideoTrimDraft, "function");
});

test("star letter UI state retains thread refs and per-session revision stores", () => {
  const first = renderHook(useStarLetterUiState);
  const second = renderHook(useStarLetterUiState);
  assert.deepEqual(first.starLettersByPostId, {});
  assert.deepEqual(first.starLetterDrafts, {});
  assert.equal(first.openStarLetterPostId, null);
  assert.equal(first.starLetterSavingPostId, null);
  assert.equal(first.starLetterUpdatingId, null);
  assert.equal(first.highlightedStarLetterId, null);
  assert.equal(first.starLetterRequestIdsRef.current !== undefined, true);
  assert.equal(first.starLetterRequestVersionsRef.current !== undefined, true);
  assert.equal(first.archivedStarLettersRequestVersionRef.current, 0);
  assert.notEqual(first.starLetterRequestIdsRef, second.starLetterRequestIdsRef);
  assert.notEqual(first.starLetterRequestVersionsRef, second.starLetterRequestVersionsRef);
});

test("feedback UI state preserves first option and status initializers", () => {
  const state = renderHook(() => useFeedbackUiState(["不具合", "改善案"]));
  assert.equal(state.feedbackType, "不具合");
  assert.equal(state.feedbackBody, "");
  assert.equal(state.feedbackSaving, false);
  assert.equal(state.feedbackMessage, "");
  assert.equal(state.feedbackError, "");
  assert.equal(typeof state.setFeedbackType, "function");
});

test("App invokes the four state hooks unconditionally in original top-level order", () => {
  const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  for (const name of ["useVillageRouteViewState", "usePostMediaDraftState", "useStarLetterUiState", "useFeedbackUiState"]) {
    assert.match(source, new RegExp('import \\{ ' + name + ' \\} from "\\./hooks/' + name + '\\.js";'));
  }
  const positions = ["useVillageRouteViewState(getRouteFromLocation)", "usePostMediaDraftState({", "useStarLetterUiState()", "useFeedbackUiState(FEEDBACK_TYPES)"].map((needle) => source.indexOf(needle, source.indexOf("function App()")));
  assert.ok(positions.every((value) => value >= 0), "each hook called inside App");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.ok(positions[0] < source.indexOf("const [initialAuthCallback]", positions[0]));
  assert.ok(positions[2] < source.indexOf("const detailPostId =", positions[2]));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STAR_MOVIE_OBSERVATION_HISTORY_KEY,
  STAR_MOVIE_OBSERVATION_MEDIA_QUERY,
  createStarMovieObservationHistoryState,
  createUploadMovieObservationMedia,
  createYouTubeMovieObservationMedia,
  getStarMovieObservationFocusTargetIndex,
  isStarMovieObservationHistoryState,
  isStarMovieObservationViewport,
} from "../../../src/starMovieObservation.js";

const repositoryRoot = new URL("../../../", import.meta.url);
const appUrl = new URL("src/App.jsx", repositoryRoot);
const modeUrl = new URL("src/StarMovieObservationMode.jsx", repositoryRoot);
const cssUrl = new URL("src/index.css", repositoryRoot);

test("observation mode uses the responsive 1024px desktop boundary", () => {
  assert.equal(STAR_MOVIE_OBSERVATION_MEDIA_QUERY, "(min-width: 1024px)");
  assert.equal(isStarMovieObservationViewport(() => ({ matches: true })), true);
  assert.equal(isStarMovieObservationViewport(() => ({ matches: false })), false);
  assert.equal(isStarMovieObservationViewport(undefined), false);
});

test("upload and YouTube media are accepted without introducing autoplay", () => {
  assert.deepEqual(
    createUploadMovieObservationMedia({
      id: "video-1",
      mediaType: "video",
      thumbnailUrl: "https://example.com/poster.jpg",
      url: "https://example.com/movie.mp4",
    }),
    {
      id: "video-1",
      kind: "upload",
      posterUrl: "https://example.com/poster.jpg",
      src: "https://example.com/movie.mp4",
    },
  );
  assert.equal(createUploadMovieObservationMedia({ mediaType: "image", url: "https://example.com/image.jpg" }), null);

  assert.deepEqual(createYouTubeMovieObservationMedia("dQw4w9WgXcQ"), {
    id: "youtube:dQw4w9WgXcQ",
    kind: "youtube",
    posterUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    videoId: "dQw4w9WgXcQ",
  });
  assert.equal(createYouTubeMovieObservationMedia("invalid"), null);
});

test("history marker identifies only the active observation entry", () => {
  const nextState = createStarMovieObservationHistoryState({ hoshizoraRoute: "meteor" }, "observation-1");

  assert.equal(nextState.hoshizoraRoute, "meteor");
  assert.equal(nextState[STAR_MOVIE_OBSERVATION_HISTORY_KEY], "observation-1");
  assert.equal(isStarMovieObservationHistoryState(nextState, "observation-1"), true);
  assert.equal(isStarMovieObservationHistoryState(nextState, "observation-2"), false);
  assert.equal(isStarMovieObservationHistoryState(null, "observation-1"), false);
});

test("focus trap wraps Tab and Shift+Tab at the dialog boundaries", () => {
  assert.equal(
    getStarMovieObservationFocusTargetIndex({
      activeIndex: 2,
      focusableCount: 3,
      shiftKey: false,
    }),
    0,
  );
  assert.equal(
    getStarMovieObservationFocusTargetIndex({
      activeIndex: 0,
      focusableCount: 3,
      shiftKey: true,
    }),
    2,
  );
  assert.equal(
    getStarMovieObservationFocusTargetIndex({
      activeIndex: 1,
      focusableCount: 3,
      shiftKey: false,
    }),
    null,
  );
  assert.equal(
    getStarMovieObservationFocusTargetIndex({
      activeIndex: -1,
      focusableCount: 3,
      shiftKey: false,
    }),
    0,
  );
  assert.equal(
    getStarMovieObservationFocusTargetIndex({
      activeIndex: -1,
      focusableCount: 3,
      shiftKey: true,
    }),
    2,
  );
  assert.equal(
    getStarMovieObservationFocusTargetIndex({
      activeIndex: -1,
      focusableCount: 0,
      shiftKey: false,
    }),
    -1,
  );
});

test("dialog supports close, Escape, scroll lock, focus restoration, and existing playback coordination", async () => {
  const [app, mode] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(modeUrl, "utf8"),
  ]);

  assert.match(mode, /role="dialog"/);
  assert.match(mode, /aria-modal="true"/);
  assert.match(mode, /aria-label="星映観測モードを閉じる"/);
  assert.match(mode, /event\.key === "Escape"/);
  assert.match(mode, /event\.key !== "Tab"/);
  assert.match(mode, /getStarMovieObservationFocusTargetIndex/);
  assert.match(mode, /window\.addEventListener\("focusin", handleFocusIn\)/);
  assert.match(mode, /window\.removeEventListener\("focusin", handleFocusIn\)/);
  assert.match(mode, /document\.body\.style\.overflow = "hidden"/);
  assert.match(mode, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(mode, /POST_INLINE_VIDEO_PLAY_EVENT/);
  assert.doesNotMatch(mode, /\bautoPlay\b/);
  assert.match(app, /window\.requestAnimationFrame\(\(\) => trigger\?\.focus\?\.\(\)\)/);
  assert.match(app, /window\.history\.back\(\)/);
});

test("desktop observation entry and unchanged mobile playback are rendered as exclusive responsive branches", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /function useStarMovieObservationViewport\(\)/);
  assert.match(app, /if \(!isDesktopObservationViewport\)/);
  assert.match(app, /window\.matchMedia\(STAR_MOVIE_OBSERVATION_MEDIA_QUERY\)/);
  assert.match(app, /www\.youtube-nocookie\.com\/embed/);
  assert.match(app, /requestInlinePlay/);
  assert.match(app, /onOpenObservation\?\.\(videoItem, triggerElement\)/);
  assert.match(app, /onOpenObservation\?\.\(event\.currentTarget\)/);
  assert.match(app, /createUploadMovieObservationMedia/);
  assert.match(app, /createYouTubeMovieObservationMedia/);
});

test("observation mode presents one immersive movie with details below instead of a side card", async () => {
  const [mode, css] = await Promise.all([
    readFile(modeUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(mode, /cosmic-background[\s\S]*cosmic-haze[\s\S]*moon[\s\S]*stars-layer/);
  assert.match(mode, /star-movie-observation-stage/);
  assert.match(mode, /star-movie-observation-frame/);
  assert.match(mode, /star-movie-observation-details/);
  assert.doesNotMatch(mode, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(340px,410px\)\]/);
  assert.doesNotMatch(mode, /<aside/);
  assert.match(css, /\.star-movie-observation-frame::after[\s\S]*pointer-events: none/);
  assert.match(css, /\.star-movie-observation-details::before[\s\S]*linear-gradient/);
});

test("uploaded movies keep their intrinsic ratio while YouTube remains 16:9", async () => {
  const [mode, css] = await Promise.all([
    readFile(modeUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(mode, /star-movie-observation-youtube-frame[^"]*aspect-video/);
  assert.match(mode, /star-movie-observation-upload-frame/);
  assert.doesNotMatch(mode, /star-movie-observation-upload-frame[^"]*aspect-video/);
  assert.doesNotMatch(mode, /star-movie-observation-upload-video[^"]*bg-black/);
  assert.match(css, /\.star-movie-observation-upload-video\s*\{[\s\S]*width: auto;[\s\S]*height: auto;/);
  assert.match(css, /\.star-movie-observation-upload-video\s*\{[\s\S]*max-width: 100%;[\s\S]*max-height: min\(72vh, 760px\);/);
  assert.match(css, /\.star-movie-observation-upload-video\s*\{[\s\S]*opacity: 0\.985;[\s\S]*mask-image: radial-gradient/);
});

test("ambient image glow respects reduced motion", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /\.star-movie-observation-glow\s*\{/);
  assert.match(css, /mask-image:\s*radial-gradient/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.star-movie-observation-glow[\s\S]*animation: none/);
});

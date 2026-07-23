import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const windowUrl = new URL("src/StarMovieObservationWindow.jsx", repositoryRoot);
const cssUrl = new URL("src/index.css", repositoryRoot);
const frameAssetUrl = new URL(
  "public/images/star-movie-observation-window-frame.png",
  repositoryRoot,
);

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

test("inline playback stays available and only dedicated desktop controls open observation mode", async () => {
  const app = await readFile(appUrl, "utf8");
  const requestInlinePlayBlock = app.match(/function requestInlinePlay\(event\)[\s\S]*?function handleOpenViewer/)?.[0] ?? "";
  const observationOpenCalls = app.match(/onOpenObservation\?\.\(event\.currentTarget\)/g) ?? [];

  assert.match(app, /function useStarMovieObservationViewport\(\)/);
  assert.match(app, /window\.matchMedia\(STAR_MOVIE_OBSERVATION_MEDIA_QUERY\)/);
  assert.match(app, /www\.youtube-nocookie\.com\/embed/);
  assert.match(requestInlinePlayBlock, /setHasLoadedVideo\(true\)/);
  assert.doesNotMatch(requestInlinePlayBlock, /onOpenObservation/);
  assert.match(app, /aria-label="流星便の星映を再生"[\s\S]*?onClick=\{requestInlinePlay\}/);
  assert.match(app, /aria-label="YouTubeを星映観測モードで開く"/);
  assert.match(app, /aria-label="アップロード動画を星映観測モードで開く"/);
  assert.match(app, /func: "pauseVideo"/);
  assert.match(app, /enablejsapi=1/);
  assert.equal(observationOpenCalls.length, 2);
  assert.doesNotMatch(app, /aria-label="YouTubeの星映を観測する"/);
  assert.doesNotMatch(app, /aria-label="流星便の星映を観測する"/);
  assert.match(app, /onOpenObservation\?\.\(videoItem, triggerElement\)/);
  assert.match(app, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(app, /createUploadMovieObservationMedia/);
  assert.match(app, /createYouTubeMovieObservationMedia/);
});

test("observation mode presents only the cosmic movie surface and close control", async () => {
  const [mode, observationWindow, css] = await Promise.all([
    readFile(modeUrl, "utf8"),
    readFile(windowUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(mode, /cosmic-background[\s\S]*cosmic-haze[\s\S]*moon[\s\S]*stars-layer/);
  assert.match(mode, /star-movie-observation-stage/);
  assert.match(mode, /StarMovieObservationWindow/);
  assert.match(observationWindow, /star-movie-observation-frame/);
  assert.match(observationWindow, /star-movie-observation-window-art/);
  assert.match(mode, /className="sr-only"[^>]*>[\s\S]*星映観測モード[\s\S]*<\/h2>/);
  assert.match(mode, /aria-label="星映観測モードを閉じる"/);
  assert.doesNotMatch(mode, /ObservationActionButton/);
  assert.doesNotMatch(mode, /star-movie-observation-details/);
  assert.doesNotMatch(mode, /authorAvatar|starLettersPanel|resonance|archive|post\.text|post\.tags/);
  assert.doesNotMatch(mode, /<aside/);
  assert.doesNotMatch(css, /\.star-movie-observation-details/);
});

test("uploaded movies keep their intrinsic ratio while YouTube remains 16:9", async () => {
  const [mode, observationWindow, css] = await Promise.all([
    readFile(modeUrl, "utf8"),
    readFile(windowUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(observationWindow, /star-movie-observation-youtube-frame/);
  assert.match(observationWindow, /star-movie-observation-upload-frame h-full w-full/);
  assert.doesNotMatch(observationWindow, /star-movie-observation-upload-frame[^"]*aspect-video/);
  assert.doesNotMatch(mode, /star-movie-observation-upload-video[^"]*bg-black/);
  assert.doesNotMatch(observationWindow, /star-movie-observation-youtube-frame[^"]*bg-black/);
  assert.match(css, /\.star-movie-observation-youtube-frame\s*\{[\s\S]*aspect-ratio: 16 \/ 9;/);
  assert.match(css, /\.star-movie-observation-upload-video\s*\{[\s\S]*width: auto;[\s\S]*height: auto;/);
  assert.match(css, /\.star-movie-observation-upload-video\s*\{[\s\S]*max-width: 100%;[\s\S]*max-height: 100%;/);
});

test("observation movies keep the shared uniform surface opacity used by inline playback", async () => {
  const [mode, observationWindow, css] = await Promise.all([
    readFile(modeUrl, "utf8"),
    readFile(windowUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  const app = await readFile(appUrl, "utf8");
  const observationFrameRule =
    css.match(/\.star-movie-observation-frame\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(observationWindow, /star-movie-observation-frame/);
  assert.match(mode, /className="star-movie-surface h-full w-full"/);
  assert.match(mode, /className="star-movie-observation-upload-video star-movie-surface block"/);
  assert.match(app, /className="star-movie-surface h-full w-full"/);
  assert.match(app, /className="star-movie-surface h-full w-full bg-black object-contain"/);
  assert.doesNotMatch(app, /star-movie-observation-surface/);
  assert.doesNotMatch(mode, /star-movie-observation-surface/);
  assert.match(css, /\.star-movie-surface\s*\{\s*opacity: 1;\s*\}/);
  assert.match(css, /@media \(min-width: 1024px\)\s*\{[\s\S]*?\.star-movie-surface\s*\{\s*opacity: 0\.9;\s*\}/);
  assert.doesNotMatch(css, /\.star-movie-observation-surface/);
  assert.match(css, /\.star-movie-observation-frame\s*\{[\s\S]*background: transparent;[\s\S]*border: 0;[\s\S]*box-shadow: none;/);
  assert.doesNotMatch(observationFrameRule, /mask-image:/);
  assert.doesNotMatch(observationFrameRule, /mix-blend-mode:/);
  assert.doesNotMatch(css, /\.star-movie-observation-glow/);
  assert.doesNotMatch(mode, /star-movie-observation-glow/);
  assert.doesNotMatch(css, /\.star-movie-observation-frame::after/);
});

test("observation window overlays the provided PNG unchanged and stays non-interactive", async () => {
  const [observationWindow, css, frameAsset] = await Promise.all([
    readFile(windowUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(frameAssetUrl),
  ]);
  const frameArtRule =
    css.match(/\.star-movie-observation-window-art\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(observationWindow, /export default function StarMovieObservationWindow/);
  assert.match(
    observationWindow,
    /STAR_MOVIE_OBSERVATION_FRAME_ASSET\s*=\s*[\s\S]*"\/images\/star-movie-observation-window-frame\.png"/,
  );
  assert.match(observationWindow, /<img[\s\S]*aria-hidden="true"[\s\S]*draggable="false"/);
  assert.match(css, /--observation-window-frame-aspect-ratio: 1536 \/ 743;/);
  assert.match(css, /--observation-window-opening-top:/);
  assert.match(css, /--observation-window-opening-right:/);
  assert.match(css, /--observation-window-opening-bottom:/);
  assert.match(css, /--observation-window-opening-left:/);
  assert.match(frameArtRule, /pointer-events: none;/);
  assert.match(frameArtRule, /object-fit: contain;/);
  assert.doesNotMatch(frameArtRule, /filter|mask|mix-blend-mode|opacity|transform/);
  assert.equal(
    createHash("sha256").update(frameAsset).digest("hex"),
    "6142068721e08a8a1ab0344a337cf56dee65c1a30c6c424e00903261433b99dd",
  );
});

test("observation mode does not add vignette, radial mask, blend, or blur effects", async () => {
  const [mode, observationWindow, css] = await Promise.all([
    readFile(modeUrl, "utf8"),
    readFile(windowUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  const observationFrameRule =
    css.match(/\.star-movie-observation-frame\s*\{([^}]*)\}/)?.[1] ?? "";
  const frameArtRule =
    css.match(/\.star-movie-observation-window-art\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.doesNotMatch(mode, /blur-\[|mix-blend|star-movie-observation-glow/);
  assert.doesNotMatch(observationWindow, /blur-\[|mix-blend|star-movie-observation-glow/);
  assert.doesNotMatch(observationFrameRule, /radial-gradient|mask-image|mix-blend-mode|filter|blur/);
  assert.doesNotMatch(frameArtRule, /radial-gradient|mask-image|mix-blend-mode|filter|blur/);
  assert.doesNotMatch(css, /\.star-movie-observation-glow/);
});

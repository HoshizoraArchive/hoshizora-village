import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.jsx", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/mobileMediaGlass.css", "utf8");

test("mobile media glass stylesheet is loaded after the shared post-card glass", () => {
  const postCardGlassImport = mainSource.indexOf('import "./postCardCelestialGlass.css";');
  const mobileMediaGlassImport = mainSource.indexOf('import "./mobileMediaGlass.css";');

  assert.notEqual(postCardGlassImport, -1);
  assert.notEqual(mobileMediaGlassImport, -1);
  assert.equal(mobileMediaGlassImport > postCardGlassImport, true);
});

test("YouTube and uploaded 星映 use the stronger transparent mobile media pane without changing desktop", () => {
  assert.match(cssSource, /@media \(max-width: 1023px\)/);
  assert.match(cssSource, /\.post-video-shell\s*\{/);
  assert.match(cssSource, /backdrop-filter: blur\(2px\) saturate\(1\.08\)/);
  assert.match(cssSource, /-webkit-backdrop-filter: blur\(2px\) saturate\(1\.08\)/);
  assert.match(cssSource, /\.post-video-youtube > \.star-movie-surface\s*\{[\s\S]*?opacity: 0\.22/);
  assert.match(cssSource, /\.post-video-upload \.post-video-viewport > \.star-movie-surface\s*\{[\s\S]*?opacity: 0\.20/);
  assert.match(cssSource, /\.post-video-upload \.post-video-viewport > button > img\s*\{[\s\S]*?opacity: 0\.22/);

  assert.equal(appSource.includes("post-video-shell post-video-youtube"), true);
  assert.equal(appSource.includes("post-video-shell post-video-upload"), true);
});

test("uploaded video preview keeps the play control above the light night tint", () => {
  assert.match(cssSource, /> button > span:first-of-type[\s\S]*z-index: 1/);
  assert.match(cssSource, /> button > span:nth-of-type\(2\)[\s\S]*z-index: 2/);
  assert.match(cssSource, /pointer-events: none/);
  assert.equal(appSource.includes('aria-label="流星便の星映を再生"'), true);
});

test("mobile media glass stays scoped away from post copy, onboarding, and notifications", () => {
  assert.doesNotMatch(cssSource, /\.post-card-content|\.onboarding|\.rconnect|notification/i);
  assert.doesNotMatch(cssSource, /(?:^|\n)\s*color\s*:/m);
  assert.doesNotMatch(cssSource, /(?:^|\n)\s*(?:width|height|margin|padding)\s*:/m);
});

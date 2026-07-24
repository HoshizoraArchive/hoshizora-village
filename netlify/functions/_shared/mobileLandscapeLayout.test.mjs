import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const appUrl = new URL("src/App.jsx", repositoryRoot);
const cssUrl = new URL("src/index.css", repositoryRoot);

const MOBILE_LANDSCAPE_QUERY =
  "@media (orientation: landscape) and (max-width: 1023px) and (max-height: 500px)";

function getMobileLandscapeRule(css, selector) {
  const mediaStart = css.indexOf(MOBILE_LANDSCAPE_QUERY);
  assert.notEqual(mediaStart, -1, "mobile landscape media query must exist");

  const mediaCss = css.slice(mediaStart, css.indexOf("\n  .cosmic-background", mediaStart));
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return mediaCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

test("mobile landscape hides bottom navigation and removes its reserved page space", async () => {
  const [app, css] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(app, /app-shell-with-bottom-nav[\s\S]*pb-28/);
  assert.match(app, /bottom-navigation fixed inset-x-0 bottom-0/);
  assert.match(getMobileLandscapeRule(css, ".bottom-navigation"), /display: none;/);
  assert.match(getMobileLandscapeRule(css, ".app-shell.app-shell-with-bottom-nav"), /padding: 0;/);
  assert.equal(css.match(new RegExp(MOBILE_LANDSCAPE_QUERY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length, 1);
});

test("mobile landscape video layout uses dynamic viewport height and safe areas", async () => {
  const [app, css] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  const appContentRule = getMobileLandscapeRule(css, ".app-shell .app-main-content");
  const videoShellRule = getMobileLandscapeRule(css, ".post-video-shell");
  const videoViewportRule = getMobileLandscapeRule(css, ".post-video-youtube,\n    .post-video-viewport");

  assert.match(app, /post-video-shell post-video-youtube/);
  assert.match(app, /post-video-shell post-video-upload/);
  assert.match(app, /post-video-viewport relative aspect-video/);
  assert.match(appContentRule, /env\(safe-area-inset-left\)/);
  assert.match(appContentRule, /env\(safe-area-inset-right\)/);
  assert.match(appContentRule, /env\(safe-area-inset-bottom\)/);
  assert.match(videoShellRule, /100dvh/);
  assert.match(videoShellRule, /env\(safe-area-inset-top\)/);
  assert.match(videoShellRule, /env\(safe-area-inset-bottom\)/);
  assert.match(videoShellRule, /16 \/ 9/);
  assert.match(videoViewportRule, /max-height:/);
  assert.doesNotMatch(videoShellRule, /100vh(?!d)/);
});

test("landscape changes are CSS-only so rotation does not recreate video elements", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.doesNotMatch(app, /matchMedia\([^)]*orientation:\s*landscape/);
  assert.doesNotMatch(app, /isMobileLandscape|setIsMobileLandscape/);
});

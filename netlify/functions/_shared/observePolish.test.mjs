import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/observePolish.css", "utf8");
const appSource = readFileSync("src/App.jsx", "utf8");
const headerSource = readFileSync("src/ObserveBrandHeader.jsx", "utf8");

test("observe header polish stays scoped and preserves the starry background", () => {
  assert.match(
    mainSource,
    /import "\.\/titlePlateSquareFix\.css";\s*import "\.\/observePolish\.css";/,
  );
  assert.match(appSource, /function ObserveScreen[\s\S]*<ObserveBrandHeader\s*\/>/);
  assert.match(headerSource, /import hoshizoraVillageLogo from "\.\/assets\/branding\/hoshizora-village-logo\.png"/);
  assert.match(headerSource, /<img[\s\S]*alt="星空Village"[\s\S]*src=\{hoshizoraVillageLogo\}/);
  assert.match(headerSource, /onError=\{\(\) => setIsLogoAvailable\(false\)\}/);
  assert.match(headerSource, /observe-brand-header-fallback[\s\S]*星空Village/);
  assert.match(headerSource, /window\.addEventListener\("scroll", scheduleScrollState, \{ passive: true \}\)/);
  assert.match(cssSource, /\.observe-brand-header\s*\{[\s\S]*background: transparent/);
  assert.match(cssSource, /\.observe-brand-header\.is-scrolled[\s\S]*backdrop-filter: blur\(7px\)/);
  assert.match(cssSource, /\.observe-brand-header-logo[\s\S]*height: var\(--observe-brand-logo-source-height\)/);
  assert.doesNotMatch(headerSource, /createObjectURL|data:image|dangerouslySetInnerHTML|backgroundImage/);
  assert.doesNotMatch(cssSource, /\.observe-screen::before/);
  assert.match(cssSource, /\.observe-screen[\s\S]*border-inline: 0/);
  assert.match(
    cssSource,
    /\.observe-screen \.timeline-post-list > \* \+ \*[\s\S]*margin-top: 0\.9rem !important/,
  );
  assert.doesNotMatch(cssSource, /cosmic-background|stars-layer|distant-stars|foreground-stardust/);
});

test("the starry post surface is shared by every PostCard context", () => {
  assert.ok((appSource.match(/<PostCard/g) ?? []).length >= 6);
  assert.match(
    cssSource,
    /\.post-card-panel\s*\{[\s\S]*border-top: 1px solid rgb\(210 232 255 \/ 0\.055\)[\s\S]*border-bottom: 1px solid rgb\(210 232 255 \/ 0\.04\)[\s\S]*border-radius: 0[\s\S]*backdrop-filter: none/,
  );
  assert.match(cssSource, /\.post-card-panel > div:first-child[\s\S]*opacity: 0\.14/);
  assert.match(
    cssSource,
    /\.post-card-panel\.is-clickable:focus-visible[\s\S]*outline: 2px solid rgb\(125 223 255 \/ 0\.45\)/,
  );
  assert.match(
    cssSource,
    /\.space-y-5 > \.post-card-panel \+ \.post-card-panel[\s\S]*margin-top: 0\.9rem !important/,
  );
  assert.doesNotMatch(cssSource, /\.observe-screen \.post-card-panel\s*\{/);
});

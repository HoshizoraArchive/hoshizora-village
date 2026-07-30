import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/observePolish.css", "utf8");
const appSource = readFileSync("src/App.jsx", "utf8");
const headerSource = readFileSync("src/ObserveBrandHeader.jsx", "utf8");

test("observe screen polish stays scoped and preserves the starry background", () => {
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
  assert.match(cssSource, /\.observe-brand-header\.is-scrolled[\s\S]*backdrop-filter: blur\(10px\)/);
  assert.match(cssSource, /\.observe-brand-header-logo[\s\S]*height: var\(--observe-brand-logo-source-height\)/);
  assert.doesNotMatch(headerSource, /createObjectURL|data:image|dangerouslySetInnerHTML|backgroundImage/);
  assert.doesNotMatch(cssSource, /\.observe-screen::before/);
  assert.match(cssSource, /\.observe-screen[\s\S]*border-inline: 0/);
  assert.match(
    cssSource,
    /\.observe-screen \.timeline-post-list > \* \+ \*[\s\S]*margin-top: 0 !important/,
  );
  assert.match(
    cssSource,
    /\.observe-screen \.post-card-panel[\s\S]*border-radius: 0[\s\S]*box-shadow: none/,
  );
  assert.doesNotMatch(cssSource, /cosmic-background|stars-layer|distant-stars|foreground-stardust/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/observePolish.css", "utf8");
const logoSource = readFileSync("src/observeLogoData.js", "utf8");

test("observe screen polish stays scoped and preserves the starry background", () => {
  assert.match(mainSource, /import "\.\/observeLogoData\.js";/);
  assert.match(
    mainSource,
    /import "\.\/titlePlateSquareFix\.css";\s*import "\.\/observePolish\.css";/,
  );
  assert.match(cssSource, /\.observe-screen::before[\s\S]*background-image: var\(--observe-logo-image\)/);
  assert.match(cssSource, /\.observe-screen::before[\s\S]*background-color: transparent/);
  assert.match(cssSource, /\.observe-screen::before[\s\S]*content: ""/);
  assert.match(logoSource, /new Blob\(\[bytes\], \{ type: "image\/png" \}\)/);
  assert.match(logoSource, /URL\.createObjectURL/);
  assert.match(logoSource, /--observe-logo-image/);
  assert.match(logoSource, /observeLogoReady/);
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

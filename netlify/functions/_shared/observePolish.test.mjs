import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/observePolish.css", "utf8");

test("observe screen polish stays scoped and preserves the starry background", () => {
  assert.match(
    mainSource,
    /import "\.\/titlePlateSquareFix\.css";\s*import "\.\/observePolish\.css";/,
  );
  assert.match(cssSource, /\.observe-screen::before[\s\S]*content: "星空Village"/);
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

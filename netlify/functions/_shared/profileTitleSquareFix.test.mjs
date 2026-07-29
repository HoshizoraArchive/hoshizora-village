import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/titlePlateSquareFix.css", "utf8");

test("celestial guide title stays square, anchored to the avatar corner, and visibly shimmers", () => {
  assert.match(
    mainSource,
    /import "\.\/index\.css";\s*import "\.\/titlePlateSquareFix\.css";/,
  );
  assert.match(
    cssSource,
    /profile-title-badge-celestial-guide[\s\S]*border-radius: 0\.125rem/,
  );
  assert.match(
    cssSource,
    /profile-avatar-title-plate[\s\S]*left: 3\.85rem[\s\S]*bottom: -0\.25rem/,
  );
  assert.match(
    cssSource,
    /profileTitleGuideShimmerStrong 3\.4s ease-in-out infinite/,
  );
  assert.match(
    cssSource,
    /@keyframes profileTitleGuideShimmerStrong[\s\S]*opacity: 0\.88[\s\S]*translate3d\(220%, -62%, 0\)/,
  );
  assert.match(
    cssSource,
    /prefers-reduced-motion[\s\S]*profile-title-badge-celestial-guide::before[\s\S]*animation: none/,
  );
});

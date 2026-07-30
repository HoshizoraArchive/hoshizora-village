import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/unifiedFeedPolish.css", "utf8");

test("My Universe and Archive load the shared observation-style feed polish", () => {
  assert.match(mainSource, /import "\.\/unifiedFeedPolish\.css";/);
  assert.match(cssSource, /\[aria-label="My Universeの記録"\]/);
  assert.match(cssSource, /\[aria-label="Archiveの種類"\]/);
});

test("shared feed rows remove nested cards and keep the observation surface", () => {
  assert.match(cssSource, /border-bottom: 1px solid rgb\(255 255 255 \/ 0\.075\)/);
  assert.match(cssSource, /border-radius: 0/);
  assert.match(cssSource, /rgb\(4 10 24 \/ 0\.52\)/);
  assert.match(cssSource, /box-shadow: none/);
  assert.match(cssSource, /margin-top: 0 !important/);
});

test("My Universe activity panel no longer renders as a nested glass card", () => {
  assert.match(
    cssSource,
    /section\.glass-panel:has\(\[aria-label="My Universeの記録"\]\)[\s\S]*background: transparent[\s\S]*backdrop-filter: none/,
  );
});

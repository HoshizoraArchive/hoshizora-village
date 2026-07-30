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

test("My Universe tabs and entries share one continuous surface", () => {
  assert.match(
    cssSource,
    /section\.glass-panel:has\(\[aria-label="My Universeの記録"\]\)[\s\S]*border-radius: 2rem[\s\S]*rgb\(4 10 24 \/ 0\.52\)/,
  );
  assert.match(cssSource, /\[aria-label="My Universeの記録"\][\s\S]*margin: 0[\s\S]*border-bottom:/);
});

test("Archive heading, tabs and entries share the same parent surface", () => {
  assert.match(
    cssSource,
    /main\.mx-auto\.max-w-3xl:has\(\[aria-label="Archiveの種類"\]\)[\s\S]*border-radius: 2rem[\s\S]*rgb\(4 10 24 \/ 0\.52\)/,
  );
  assert.match(
    cssSource,
    /> section\.glass-panel\.mb-4[\s\S]*margin-bottom: 0[\s\S]*background: transparent/,
  );
});

test("feed entries are rows rather than separate cards", () => {
  assert.match(cssSource, /border-top: 1px solid rgb\(255 255 255 \/ 0\.075\)/);
  assert.match(cssSource, /border-radius: 0/);
  assert.match(cssSource, /background: linear-gradient\(180deg, rgb\(255 255 255 \/ 0\.028\), transparent 34%\)/);
  assert.match(cssSource, /margin-top: 0 !important/);
  assert.match(cssSource, /box-shadow: none/);
});

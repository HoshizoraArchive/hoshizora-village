import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/unifiedFeedPolish.css", "utf8");

test("My Universe and Archive load the shared feed-shell polish", () => {
  assert.match(mainSource, /import "\.\/unifiedFeedPolish\.css";/);
  assert.match(cssSource, /\[aria-label="My Universeの記録"\]/);
  assert.match(cssSource, /\[aria-label="Archiveの種類"\]/);
});

test("feed shells stay connected without becoming dark glass containers", () => {
  assert.match(cssSource, /rgb\(10 25 56 \/ 0\.14\)/);
  assert.match(cssSource, /rgb\(7 13 35 \/ 0\.06\)/);
  assert.match(cssSource, /border: 1px solid rgb\(210 232 255 \/ 0\.06\)/);
  assert.match(cssSource, /box-shadow: none/);
  assert.match(cssSource, /backdrop-filter: none/);
  assert.doesNotMatch(cssSource, /rgb\(7 16 36 \/ 0\.72\)|blur\(24px\)/);
});

test("My Universe joins the profile card, tabs, and feed into one light surface", () => {
  assert.match(cssSource, /section\.glass-panel:first-of-type[\s\S]*border-bottom-right-radius: 0/);
  assert.match(cssSource, /section\.glass-panel:has\(\[aria-label="My Universeの記録"\]\)[\s\S]*border-radius: 0 0 24px 24px/);
  assert.match(cssSource, /section\.glass-panel:has\(\[aria-label="My Universeの記録"\]\)[\s\S]*margin-top: 0 !important/);
});

test("Archive wraps its header, tabs, and feed in one light surface", () => {
  assert.match(cssSource, /main\.mx-auto\.max-w-3xl:has\(> section\.glass-panel \[aria-label="Archiveの種類"\]\)[\s\S]*border-radius: 24px/);
  assert.match(cssSource, /> section\.glass-panel\.mb-4[\s\S]*margin-bottom: 0/);
  assert.match(cssSource, /> section\.space-y-5[\s\S]*padding: 0 0 2\.5rem/);
});

test("public profiles join their profile and meteor feed without restyling non-post cards", () => {
  assert.match(cssSource, /section\.glass-panel:has\(> \.profile-card-header\)[\s\S]*border-bottom-left-radius: 0/);
  assert.match(cssSource, /\+ section\.glass-panel[\s\S]*border-top-left-radius: 0/);
  assert.doesNotMatch(cssSource, /article\.glass-panel|\.post-card-panel/);
});

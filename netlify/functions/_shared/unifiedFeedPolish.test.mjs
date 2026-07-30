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

test("My Universe joins the profile card, tabs, and feed into one continuous surface", () => {
  assert.match(cssSource, /section\.glass-panel:first-of-type[\s\S]*border-bottom-right-radius: 0/);
  assert.match(cssSource, /section\.glass-panel:has\(\[aria-label="My Universeの記録"\]\)[\s\S]*border-radius: 0 0 24px 24px/);
  assert.match(cssSource, /section\.glass-panel:has\(\[aria-label="My Universeの記録"\]\)[\s\S]*margin-top: 0 !important/);
});

test("Archive wraps its header, tabs, and feed in one glass surface", () => {
  assert.match(cssSource, /main\.mx-auto\.max-w-3xl:has\(> section\.glass-panel \[aria-label="Archiveの種類"\]\)[\s\S]*border-radius: 24px/);
  assert.match(cssSource, /> section\.glass-panel\.mb-4[\s\S]*margin-bottom: 0/);
  assert.match(cssSource, /> section\.space-y-5[\s\S]*padding: 0 0 2\.5rem/);
});

test("public profiles also join their profile and meteor feed panels", () => {
  assert.match(cssSource, /section\.glass-panel:has\(> \.profile-card-header\)[\s\S]*border-bottom-left-radius: 0/);
  assert.match(cssSource, /\+ section\.glass-panel[\s\S]*border-top-left-radius: 0/);
});

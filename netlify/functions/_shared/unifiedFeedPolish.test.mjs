import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const cssSource = readFileSync("src/unifiedFeedPolish.css", "utf8");

test("My Universe and Archive load the shared content-surface polish", () => {
  assert.match(mainSource, /import "\.\/unifiedFeedPolish\.css";/);
  for (const selector of [
    ".content-page",
    ".profile-surface",
    ".feed-section",
    ".content-tabs",
    ".content-feed-list",
    ".star-letter-panel",
    ".empty-state",
  ]) {
    assert.match(cssSource, new RegExp(selector.replaceAll(".", "\\.")));
  }
});

test("content surfaces use air and subtle rules instead of dark glass containers", () => {
  assert.match(cssSource, /background: rgb\(7 13 35 \/ 0\.025\)/);
  assert.match(cssSource, /border-top: 1px solid rgb\(210 232 255 \/ 0\.06\)/);
  assert.match(cssSource, /margin-top: 0\.9rem !important/);
  assert.doesNotMatch(cssSource, /box-shadow|backdrop-filter|blur\(|rgb\(7 16 36 \/ 0\.72\)/);
});

test("shared polish does not join unrelated panels through page-specific selectors", () => {
  assert.doesNotMatch(cssSource, /:has\(|\.glass-panel|border-radius: 24px/);
});

test("My Universe, Archive, and public profiles use the same lightweight page roles", () => {
  const appSource = readFileSync("src/App.jsx", "utf8");
  for (const token of [
    'className="content-page my-universe-page mx-auto max-w-2xl"',
    'className="content-page archive-page mx-auto max-w-3xl"',
    'className="content-page public-profile-page mx-auto max-w-3xl"',
    'className="profile-surface overflow-hidden"',
    'className="feed-section"',
    'className="content-tabs mb-5 grid grid-cols-3"',
    'className="content-tabs mt-5 grid grid-cols-2"',
  ]) {
    assert.equal(appSource.includes(token), true, `missing shared content role: ${token}`);
  }
});

test("letter rows and thread items use the same quiet feed vocabulary", () => {
  const appSource = readFileSync("src/App.jsx", "utf8");
  assert.match(appSource, /className="content-letter-row overflow-hidden p-4 sm:p-5"/);
  assert.match(appSource, /className=\{`star-letter-item px-3 py-3/);
  assert.match(cssSource, /\.star-letter-item-reply[\s\S]*border-left: 2px solid/);
});

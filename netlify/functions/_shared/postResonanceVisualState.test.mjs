import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.jsx", "utf8");
const dataApiSource = readFileSync("src/dataRevisionApi.js", "utf8");

test("post resonance visual state uses the existing viewer-specific engagement projection", () => {
  assert.match(appSource, /viewer_resonance_count \?\? 0/);
  assert.match(appSource, /viewerResonatedPostIdsFromSnapshot\.add\(snapshot\.post_id\)/);
  assert.match(appSource, /resonatedPostIds: viewerResonatedPostIds/);
  assert.match(appSource, /setViewerResonatedPostIds\(new Set\(\)\)/);
});

test("successful resonance becomes visibly active without changing the repeated-resonance action", () => {
  assert.match(appSource, /setViewerResonatedPostIds\(\(currentIds\) => new Set\(currentIds\)\.add\(postId\)\)/);
  assert.match(appSource, /active=\{hasViewerResonated\}/);
  assert.match(appSource, /icon=\{hasViewerResonated \? "♥" : "♡"\}/);
  assert.match(appSource, /variant="resonance"/);
  assert.match(appSource, /disabled=\{isResonanceSaving \|\| !resonance\?\.onResonate\}/);
  assert.match(appSource, /onClick=\{\(\) => resonance\?\.onResonate\?\.\(post\.id\)\}/);
  assert.match(dataApiSource, /"add_post_resonance_v1"/);
  assert.doesNotMatch(appSource, /removePostResonance/);
});

test("resonated post styling is pink while the untouched state remains the existing neutral action", () => {
  assert.match(appSource, /variant === "resonance"/);
  assert.match(appSource, /border-sakura\/55 bg-sakura\/15 text-sakura/);
  assert.match(appSource, /variant === "resonance" && active \? "text-sakura" : "text-comet"/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const experienceSource = readFileSync("src/myStarChartPreviewExperience.js", "utf8");
const cssSource = readFileSync("src/myStarChartPreview.css", "utf8");

test("My Star Chart card opens a dedicated placeholder experience", () => {
  assert.match(mainSource, /import "\.\/myStarChartPreviewExperience\.js";/);
  assert.match(mainSource, /import "\.\/myStarChartPreview\.css";/);
  assert.match(experienceSource, /STAR_CHART_ENTRY_LABEL = "My Star Chart"/);
  assert.match(experienceSource, /ここはまだ実装途中です。/);
  assert.match(experienceSource, /My Universeへ戻る/);
  assert.match(experienceSource, /role", "dialog"/);
  assert.match(experienceSource, /event\.key === "Escape"/);
  assert.match(cssSource, /\.my-star-chart-preview\s*\{[\s\S]*position: fixed[\s\S]*min-height: 100dvh/);
  assert.match(cssSource, /\.my-star-chart-preview__constellation/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
});

test("My Star Chart is available from every rendered profile", () => {
  assert.match(experienceSource, /function getProfileSection\(entryCard\)/);
  assert.match(experienceSource, /startsWith\("@"\)/);
  assert.match(experienceSource, /const profileSection = getProfileSection\(entryCard\)/);
  assert.doesNotMatch(experienceSource, /星座URLを共有/);
  assert.doesNotMatch(experienceSource, /getOwnProfileSection/);
});

test("My Star Chart placeholder stays client-only and avoids risky image or data work", () => {
  assert.doesNotMatch(experienceSource, /createObjectURL|data:image|new Blob|dangerouslySetInnerHTML/);
  assert.doesNotMatch(experienceSource, /supabase|fetch\(|localStorage|sessionStorage/);
  assert.doesNotMatch(cssSource, /url\(/);
});

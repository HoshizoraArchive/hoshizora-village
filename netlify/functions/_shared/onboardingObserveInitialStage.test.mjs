import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bootstrapSource = readFileSync("src/onboardingObserveBootstrap.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("観測オンボーディングはArchiveより先に共鳴案内を描画する", () => {
  for (const token of [
    'data-onboarding-step="archive_prompt"',
    "まずは、この流星便に「共鳴」を押してみて！",
    "共鳴は何回でも押せるよ✨",
    'guide.setAttribute("data-onboarding-observe-stage", "resonance")',
    'label.includes("共鳴")',
    'element.removeAttribute("data-onboarding-target")',
  ]) {
    assert.equal(bootstrapSource.includes(token), true, `missing initial resonance guard: ${token}`);
  }
});

test("DB基準の観測ガイドより先に初期共鳴ガードを読み込む", () => {
  const bootstrapIndex = mainSource.indexOf('import "./onboardingObserveBootstrap.js";');
  const experienceIndex = mainSource.indexOf('import "./onboardingObserveExperience.js";');

  assert.notEqual(bootstrapIndex, -1);
  assert.notEqual(experienceIndex, -1);
  assert.equal(bootstrapIndex < experienceIndex, true);
});

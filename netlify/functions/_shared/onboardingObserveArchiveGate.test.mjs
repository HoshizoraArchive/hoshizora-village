import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gateSource = readFileSync("src/onboardingObserveArchiveGate.js", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("共鳴と星文の案内が終わるまではArchiveを押せない", () => {
  for (const token of [
    'const shouldGate = stage !== "archive"',
    "archiveButton.disabled = true",
    'archiveButton.setAttribute(GATED_ATTRIBUTE, "true")',
    "restoreArchiveButton()",
  ]) {
    assert.equal(gateSource.includes(token), true, `missing archive gate behavior: ${token}`);
  }
});

test("ArchiveゲートをDB基準ガイドより先に読み込む", () => {
  const gateIndex = mainSource.indexOf('import "./onboardingObserveArchiveGate.js";');
  const experienceIndex = mainSource.indexOf('import "./onboardingObserveExperience.js";');

  assert.notEqual(gateIndex, -1);
  assert.notEqual(experienceIndex, -1);
  assert.equal(gateIndex < experienceIndex, true);
});

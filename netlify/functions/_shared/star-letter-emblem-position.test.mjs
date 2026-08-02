import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const observeCss = readFileSync(new URL("../../../src/observePolish.css", import.meta.url), "utf8");
const unifiedFeedCss = readFileSync(new URL("../../../src/unifiedFeedPolish.css", import.meta.url), "utf8");

function getRuleBody(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

function getDeclaration(ruleBody, property) {
  const match = ruleBody.match(new RegExp(`(?:^|\\n)\\s*${property}\\s*:\\s*([^;]+);`));
  assert.ok(match, `missing CSS declaration: ${property}`);
  return match[1].trim();
}

test("star-letter emblem uses the same corner geometry as Observe meteor cards", () => {
  const meteorRule = getRuleBody(observeCss, ".observe-screen .profile-title-emblem-post-card-slot");
  const starLetterRule = getRuleBody(
    unifiedFeedCss,
    ".star-letter-item > .flex > .min-w-0 > .flex > .profile-title-emblem-compact",
  );

  for (const property of ["top", "right", "width", "height"]) {
    assert.equal(
      getDeclaration(starLetterRule, property),
      getDeclaration(meteorRule, property),
      `${property} must match the Observe meteor-card emblem`,
    );
  }
});

test("star-letter emblem reserves identity-row space only when an emblem exists", () => {
  const starLetterRule = getRuleBody(
    unifiedFeedCss,
    ".star-letter-item > .flex > .min-w-0 > .flex > .profile-title-emblem-compact",
  );

  assert.equal(getDeclaration(starLetterRule, "position"), "absolute");
  assert.match(unifiedFeedCss, /\.star-letter-item\s*\{[^}]*position:\s*relative;/s);
  assert.match(
    unifiedFeedCss,
    /\.star-letter-item:has\(> \.flex > \.min-w-0 > \.flex > \.profile-title-emblem-compact\)[^{]*\{[^}]*padding-right:\s*5rem;/s,
  );
});

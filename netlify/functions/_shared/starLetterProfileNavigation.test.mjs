import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.jsx", "utf8");
const navigationSource = readFileSync("src/starLetterProfileNavigation.js", "utf8");
const cssSource = readFileSync("src/starLetterProfileNavigation.css", "utf8");

test("star-letter authors link to the existing public profile route", () => {
  assert.match(mainSource, /import "\.\/starLetterProfileNavigation\.js";/);
  assert.match(mainSource, /import "\.\/starLetterProfileNavigation\.css";/);
  assert.match(navigationSource, /article\[id\^="star-letter-"\]/);
  assert.match(navigationSource, /data-star-letter-profile-username/);
  assert.match(navigationSource, /\/stars\/\$\{encodeURIComponent\(normalized\)\}/);
  assert.match(navigationSource, /hoshizoraRoute: "starProfile"/);
  assert.match(navigationSource, /new PopStateEvent\("popstate"/);
});

test("avatar, display name, and handle are all keyboard-accessible profile links", () => {
  assert.match(navigationSource, /makeProfileLink\(avatarElement, username, displayName\)/);
  assert.match(navigationSource, /makeProfileLink\(nameElement, username, displayName\)/);
  assert.match(navigationSource, /makeProfileLink\(handleElement, username, displayName\)/);
  assert.match(navigationSource, /element\.setAttribute\("role", "button"\)/);
  assert.match(navigationSource, /element\.tabIndex = 0/);
  assert.match(navigationSource, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(cssSource, /\.star-letter-profile-link:focus-visible/);
});

test("profile navigation stays client-only and does not touch data APIs", () => {
  assert.doesNotMatch(navigationSource, /supabase|fetch\(|localStorage|sessionStorage|dangerouslySetInnerHTML/);
});

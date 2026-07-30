import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildStarProfilePath,
  extractUsernameFromText,
} from "../../../src/starLetterProfileNavigation.js";

const mainSource = readFileSync("src/main.jsx", "utf8");
const appSource = readFileSync("src/App.jsx", "utf8");
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

test("all current account username formats are extracted without account-specific exceptions", () => {
  assert.equal(extractUsernameFromText("@SoratoHoshizora"), "SoratoHoshizora");
  assert.equal(extractUsernameFromText("@chia_hoshizora"), "chia_hoshizora");
  assert.equal(extractUsernameFromText("@Hoshikun_Stellar"), "Hoshikun_Stellar");
  assert.equal(extractUsernameFromText("星空ちあ @chia_hoshizora"), "chia_hoshizora");
  assert.equal(buildStarProfilePath("@Hoshikun_Stellar"), "/stars/Hoshikun_Stellar");
});

test("thread and My Constellation star-letter cards both expose profile entrances", () => {
  assert.match(navigationSource, /decorateThreadStarLetter/);
  assert.match(navigationSource, /decorateSentStarLetterCard/);
  assert.match(navigationSource, /SENT_STAR_LETTER_SOURCE_LABEL = "元の流星便"/);
  assert.match(navigationSource, /makeProfileLink\(avatarElement, username, displayName\)/);
  assert.match(navigationSource, /makeProfileLink\(identityRow, username, displayName\)/);
  assert.match(navigationSource, /makeProfileLink\(sourceIdentity, sourceUsername/);
  assert.match(navigationSource, /element\.setAttribute\("role", "button"\)/);
  assert.match(navigationSource, /element\.tabIndex = 0/);
  assert.match(cssSource, /\.star-letter-profile-link:focus-visible/);
});

test("profile events use capture because StarLettersPanel stops bubbling", () => {
  assert.match(appSource, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(appSource, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(navigationSource, /document\.addEventListener\("click", handleProfileLinkClick, true\)/);
  assert.match(navigationSource, /document\.addEventListener\("keydown", handleProfileLinkKeydown, true\)/);
  assert.match(navigationSource, /decorateArticle\(article\)/);
});

test("profile navigation stays client-only and does not touch data APIs", () => {
  assert.doesNotMatch(navigationSource, /supabase|fetch\(|localStorage|sessionStorage|dangerouslySetInnerHTML/);
});

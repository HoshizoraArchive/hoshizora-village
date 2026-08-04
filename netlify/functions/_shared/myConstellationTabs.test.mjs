import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/App.jsx", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");
const myUniverseCssSource = readFileSync("src/myUniversePolish.css", "utf8");

test("My Universeは流星便・共鳴・星文の3タブを切り替える", () => {
  for (const token of [
    'const [myConstellationView, setMyConstellationView] = useState("posts")',
    'myConstellation?.onViewChange?.("posts")',
    'myConstellation?.onViewChange?.("resonated")',
    'myConstellation?.onViewChange?.("starLetters")',
    'aria-label="My Universeの記録"',
    'function SentStarLetterCard({ item, onOpenStarLetterThread })',
    'onOpenStarLetterThread?.(item.postId, item.id)',
  ]) {
    assert.equal(source.includes(token), true, `missing My Universe behavior: ${token}`);
  }
});

test("共鳴一覧と送った星文はログイン中の本人に限定して取得する", () => {
  for (const token of [
    '.from("resonances")\n        .select("id, post_id, profile_id, resonance_type, created_at")\n        .eq("profile_id", userId)',
    '.from("star_letters")\n          .select(columns)\n          .eq("author_id", userId)',
    'query = query.is("deleted_at", null)',
    'const resonanceRowsByPostId = new Map()',
    '!resonanceRowsByPostId.has(row.post_id)',
  ]) {
    assert.equal(source.includes(token), true, `missing owner-scoped My Constellation query: ${token}`);
  }
});

test("My Universeの投稿カードは既存の操作・メディア・星文表示を再利用する", () => {
  for (const token of [
    'const currentPosts = isResonatedView ? myConstellation.resonatedPosts : ownPosts',
    '<PostCard',
    'onOpenMedia={onOpenPostMedia}',
    'resonance={resonance}',
    'starLetters={starLetters}',
    'const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts)',
    'setResonatedPosts((currentPosts) => reconcilePostSnapshots(currentPosts, hydratedPosts))',
    'mediaLoaded: true',
    'tagsLoaded: true',
  ]) {
    assert.equal(source.includes(token), true, `missing shared post behavior: ${token}`);
  }
});

test("My Universe uses the asterism navigation icon and keeps My Star Chart distinct", () => {
  for (const token of [
    '{ id: "profile", label: "My Universe", ariaLabel: "My Universe", icon: "asterism" }',
    'わたしだけの宇宙',
    'if (icon === "asterism")',
    '<svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">',
  ]) {
    assert.equal(source.includes(token), true, `missing My Universe UI: ${token}`);
  }

  assert.equal(source.includes("My Star Chart"), true, "My Star Chart must remain available");
});

test("My Universe keeps its heading, scopes the mobile full-bleed hero, and removes the purple cover band", () => {
  assert.match(mainSource, /import "\.\/myUniversePolish\.css";/);
  assert.match(source, /<PageIntro subtitle="わたしだけの宇宙" title="My Universe" \/>/);
  assert.match(source, /className="content-page my-universe-page mx-auto max-w-2xl"/);
  assert.match(source, /className="content-page public-profile-page mx-auto max-w-3xl"/);
  assert.match(
    myUniverseCssSource,
    /@media \(max-width: 639px\) \{[\s\S]*\.my-universe-page > \.page-intro \{[\s\S]*width: 100vw;/,
  );
  assert.doesNotMatch(myUniverseCssSource, /\.public-profile-page > \.content-flow > \.page-intro/);
  assert.match(
    myUniverseCssSource,
    /\.my-universe-page \.profile-card-header > div:first-child,[\s\S]*display: none/,
  );
  assert.match(myUniverseCssSource, /\.public-profile-page \.profile-card-header-actions[\s\S]*display: none/);
  assert.match(myUniverseCssSource, /\.my-universe-page \.profile-title-emblem-header-slot/);
  assert.match(myUniverseCssSource, /\.public-profile-page \.profile-title-emblem-header-slot/);
  assert.doesNotMatch(myUniverseCssSource, /:has\(|content:|text-shadow/);
});
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
    'const seenPostIds = new Set()',
    'seenPostIds.has(post.id)',
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
    'setResonatedPosts((currentPosts) => attachMediaToPosts(currentPosts, mediaByPostId))',
    'setResonatedPosts((currentPosts) => attachMeteorTagsToPosts(currentPosts, tagsByPostId))',
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

test("My Universe is a real page heading above both owner and public profile headers", () => {
  assert.match(mainSource, /import "\.\/myUniversePolish\.css";/);
  assert.match(source, /function PageIntro\(\{ subtitle, title \}\)/);
  assert.match(source, /<PageIntro subtitle="わたしだけの宇宙" title="My Universe" \/>/);
  assert.match(source, /className="content-page my-universe-page mx-auto max-w-2xl"/);
  assert.match(source, /className="content-page public-profile-page mx-auto max-w-3xl"/);
  assert.match(myUniverseCssSource, /\.page-intro h1/);
  assert.match(myUniverseCssSource, /\.page-intro p/);
  assert.match(myUniverseCssSource, /color: rgb\(158 220 255\)/);
  assert.doesNotMatch(myUniverseCssSource, /:has\(|content:|display: none|text-shadow/);
});

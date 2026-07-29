import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/App.jsx", "utf8");

test("My Constellationは流星便・共鳴・星文の3タブを切り替える", () => {
  for (const token of [
    'const [myConstellationView, setMyConstellationView] = useState("posts")',
    'myConstellation?.onViewChange?.("posts")',
    'myConstellation?.onViewChange?.("resonated")',
    'myConstellation?.onViewChange?.("starLetters")',
    'aria-label="My Constellationの記録"',
    'function SentStarLetterCard({ item, onOpenStarLetterThread })',
    'onOpenStarLetterThread?.(item.postId, item.id)',
  ]) {
    assert.equal(source.includes(token), true, `missing My Constellation behavior: ${token}`);
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

test("My Constellationの投稿カードは既存の操作・メディア・星文表示を再利用する", () => {
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

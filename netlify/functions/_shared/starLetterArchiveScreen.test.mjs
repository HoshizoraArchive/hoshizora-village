import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/App.jsx", "utf8");

test("Archive画面で流星便と星文を切り替え、保存した星文へ戻れる", () => {
  for (const token of [
    '.from("star_letter_archives")',
    '.select("id, profile_id, star_letter_id, post_id, created_at")',
    'archive.activeView === "starLetters"',
    'archive.onViewChange?.("posts")',
    'archive.onViewChange?.("starLetters")',
    'archive.onOpenStarLetterThread?.(item.postId, item.id)',
    'archive.onToggleStarLetterArchive?.(item)',
    'まだArchiveされた星文はありません。',
    '元の流星便',
  ]) {
    assert.equal(source.includes(token), true, `missing star-letter Archive behavior: ${token}`);
  }
});

test("星文Archiveの取得はログイン中の本人行だけに限定する", () => {
  assert.equal(source.includes('.eq("profile_id", userId)'), true);
  assert.equal(source.includes('threadSnapshots = await readStarThreadSnapshots(supabase, postIds)'), true);
  assert.equal(source.includes('.filter((letter) => letter.is_archived)'), true);
  assert.equal(source.includes('setArchivedStarLetters((currentItems) => currentItems.filter((item) => item.id !== letter.id))'), true);
});

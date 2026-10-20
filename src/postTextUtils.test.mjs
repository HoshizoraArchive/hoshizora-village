import assert from "node:assert/strict";
import test from "node:test";
import {
  POST_MAX_LENGTH,
  STAR_LETTER_MAX_LENGTH,
  extractMeteorTags,
  findFirstSunoUrl,
  findFirstYouTubeVideoId,
  getSafeLinkUrl,
  getTrimmedCharacterLength,
  validateMeteorTagsFromText,
} from "./lib/postTextUtils.js";

test("character limits retain code-point counting and post/letter limits", () => {
  assert.equal(getTrimmedCharacterLength("  🌠  "), 1);
  assert.equal(getTrimmedCharacterLength("  星 ✨  "), 3);
  assert.equal(POST_MAX_LENGTH, 500);
  assert.equal(STAR_LETTER_MAX_LENGTH, 500);
});

test("meteor tags exclude URL fragments, deduplicate normalized names and preserve positions", () => {
  const body = "星 #未来 https://example.com/#hidden と #未来 と #大阪";
  assert.deepEqual(extractMeteorTags(body).map((tag) => tag.name), ["未来", "大阪"]);
  const located = extractMeteorTags(body, { includePositions: true });
  assert.equal(body.slice(located[0].start, located[0].end), "#未来");
  assert.equal(body.slice(located[1].start, located[1].end), "#大阪");
});

test("meteor tag limits retain existing messages and counts", () => {
  assert.equal(validateMeteorTagsFromText("#一 #二 #三").error, "");
  assert.equal(validateMeteorTagsFromText("#一 #二 #三 #四").error, "流星タグは3つまで添えられます");
  assert.equal(validateMeteorTagsFromText("#" + "星".repeat(31)).error, "流星タグは30文字以内で入力してください");
});

test("safe links and supported YouTube URLs keep strict host and ID handling", () => {
  assert.equal(getSafeLinkUrl("javascript:alert(1)"), null);
  assert.equal(getSafeLinkUrl("https://example.com/"), "https://example.com/");
  assert.equal(findFirstYouTubeVideoId("参考 https://youtu.be/abcdefghijk。"), "abcdefghijk");
  assert.equal(findFirstYouTubeVideoId("https://notyoutube.com/watch?v=abcdefghijk"), null);
});

test("Suno recognition preserves allowed host and song paths", () => {
  assert.equal(findFirstSunoUrl("曲 https://suno.com/song/example123。"), "https://suno.com/song/example123");
  assert.equal(findFirstSunoUrl("https://suno.evil.example/s/example123"), null);
});

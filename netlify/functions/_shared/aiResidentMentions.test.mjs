import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileMentionUsernames } from "./aiResidentMentions.mjs";

test("extractProfileMentionUsernames returns unique usernames in first-seen order", () => {
  assert.deepEqual(
    extractProfileMentionUsernames("@ash さんと @chia_hoshizora の話。もう一度 @ash"),
    ["ash", "chia_hoshizora"],
  );
});

test("extractProfileMentionUsernames ignores malformed or embedded mention tokens", () => {
  assert.deepEqual(
    extractProfileMentionUsernames(
      "@ valid @-bad @good_name @bad-name @alsoGood123 mail@example.com foo.@embedded",
    ),
    ["good_name", "alsoGood123"],
  );
});

test("extractProfileMentionUsernames handles punctuation boundaries", () => {
  assert.deepEqual(
    extractProfileMentionUsernames("(@ash)、@sora。『@chia_hoshizora』"),
    ["ash", "sora", "chia_hoshizora"],
  );
});

test("extractProfileMentionUsernames handles empty input", () => {
  assert.deepEqual(extractProfileMentionUsernames(""), []);
  assert.deepEqual(extractProfileMentionUsernames(null), []);
});

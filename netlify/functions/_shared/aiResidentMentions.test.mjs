import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileMentionUsernames } from "./aiResidentMentions.mjs";

test("extractProfileMentionUsernames returns unique usernames in first-seen order", () => {
  assert.deepEqual(
    extractProfileMentionUsernames("@ash さんと @chia_hoshizora の話。もう一度 @ash"),
    ["ash", "chia_hoshizora"],
  );
});

test("extractProfileMentionUsernames ignores malformed mention tokens", () => {
  assert.deepEqual(
    extractProfileMentionUsernames("@ valid @-bad @good_name @bad-name @alsoGood123"),
    ["good_name", "bad", "alsoGood123"],
  );
});

test("extractProfileMentionUsernames handles empty input", () => {
  assert.deepEqual(extractProfileMentionUsernames(""), []);
  assert.deepEqual(extractProfileMentionUsernames(null), []);
});

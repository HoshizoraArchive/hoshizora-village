import assert from "node:assert/strict";
import test from "node:test";
import { getAutomaticChiaObservationEligibility } from "./aiAutoObservation.mjs";

const USER_ID = "33333333-3333-4333-8333-333333333333";

function textPost(overrides = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    author_id: USER_ID,
    type: "text",
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    id: USER_ID,
    username: "ordinary_user",
    display_name: "普通の村人",
    ...overrides,
  };
}

test("automatic Chia observation is eligible for operator text posts", () => {
  const result = getAutomaticChiaObservationEligibility({
    userId: USER_ID,
    post: textPost(),
    profile: profile(),
    operatorUserIds: new Set([USER_ID]),
  });

  assert.deepEqual(result, { eligible: true, reason: "operator" });
});

test("automatic Chia observation is eligible for hoshizora hoshikun text posts", () => {
  const result = getAutomaticChiaObservationEligibility({
    userId: USER_ID,
    post: textPost(),
    profile: profile({ username: "hoshizora_hoshikun" }),
    operatorUserIds: new Set(),
  });

  assert.deepEqual(result, { eligible: true, reason: "hoshizora_hoshikun" });
});

test("automatic Chia observation skips non-text posts", () => {
  const result = getAutomaticChiaObservationEligibility({
    userId: USER_ID,
    post: textPost({ type: "image" }),
    profile: profile(),
    operatorUserIds: new Set([USER_ID]),
  });

  assert.deepEqual(result, { eligible: false, reason: "unsupported_type" });
});

test("automatic Chia observation skips non-author and non-allowed users", () => {
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost({ author_id: "99999999-9999-4999-8999-999999999999" }),
      profile: profile(),
      operatorUserIds: new Set([USER_ID]),
    }),
    { eligible: false, reason: "not_author" },
  );
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost(),
      profile: profile(),
      operatorUserIds: new Set(),
    }),
    { eligible: false, reason: "not_allowed" },
  );
});

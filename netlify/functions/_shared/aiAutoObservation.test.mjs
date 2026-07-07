import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoObservationNotBeforeAt,
  getAutomaticChiaObservationEligibility,
  pickAutoObservationDelaySeconds,
} from "./aiAutoObservation.mjs";

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

test("automatic Chia observation is eligible for any author's text posts", () => {
  const result = getAutomaticChiaObservationEligibility({
    userId: USER_ID,
    post: textPost(),
    profile: profile(),
  });

  assert.deepEqual(result, { eligible: true, reason: "public_text_author" });
});

test("automatic Chia observation skips non-text posts", () => {
  const result = getAutomaticChiaObservationEligibility({
    userId: USER_ID,
    post: textPost({ type: "image" }),
    profile: profile(),
  });

  assert.deepEqual(result, { eligible: false, reason: "unsupported_type" });
});

test("automatic Chia observation skips non-author requests", () => {
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost({ author_id: "99999999-9999-4999-8999-999999999999" }),
      profile: profile(),
    }),
    { eligible: false, reason: "not_author" },
  );
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost(),
      profile: profile({ id: "99999999-9999-4999-8999-999999999999" }),
    }),
    { eligible: false, reason: "not_author" },
  );
});

test("automatic Chia observation delay uses configured inclusive range", () => {
  const delay = pickAutoObservationDelaySeconds({
    minDelaySeconds: 60,
    maxDelaySeconds: 900,
    randomInteger(min, maxExclusive) {
      assert.equal(min, 60);
      assert.equal(maxExclusive, 901);
      return 123;
    },
  });

  assert.equal(delay, 123);
});

test("automatic Chia observation builds delayed not-before timestamp", () => {
  const notBeforeAt = buildAutoObservationNotBeforeAt({
    now: new Date("2026-07-07T00:00:00.000Z"),
    minDelaySeconds: 60,
    maxDelaySeconds: 900,
    randomInteger: () => 75,
  });

  assert.equal(notBeforeAt.toISOString(), "2026-07-07T00:01:15.000Z");
});

test("automatic Chia observation rejects invalid delay ranges", () => {
  assert.throws(
    () => pickAutoObservationDelaySeconds({ minDelaySeconds: 0, maxDelaySeconds: 60 }),
    /invalid_auto_observation_delay/,
  );
  assert.throws(
    () => pickAutoObservationDelaySeconds({ minDelaySeconds: 90, maxDelaySeconds: 60 }),
    /invalid_auto_observation_delay/,
  );
});

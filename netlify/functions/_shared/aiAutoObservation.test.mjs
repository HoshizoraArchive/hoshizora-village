import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoObservationNotBeforeAt,
  EARLY_BETA_DELAY_BANDS,
  getAutomaticChiaObservationEligibility,
  pickAutoObservationDelaySeconds,
} from "./aiAutoObservation.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

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

  assert.deepEqual(result, {
    eligible: true,
    reason: "public_text_author",
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
  });
});

test("automatic Chia observation is eligible for image posts", () => {
  const result = getAutomaticChiaObservationEligibility({
    userId: USER_ID,
    post: textPost({ type: "image" }),
    profile: profile(),
  });

  assert.deepEqual(result, {
    eligible: true,
    reason: "public_image_author",
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
  });
});

test("first public image, video, and YouTube posts use the welcome-only route", () => {
  for (const type of ["image", "video", "youtube"]) {
    assert.deepEqual(
      getAutomaticChiaObservationEligibility({
        userId: USER_ID,
        post: textPost({ type }),
        profile: profile(),
        isFirstPostWelcome: true,
      }),
      {
        eligible: true,
        reason: "first_post_welcome",
        observationContext: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
      },
    );
  }
});

test("the first public text post also uses the welcome-only route", () => {
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost(),
      profile: profile(),
      isFirstPostWelcome: true,
    }),
    {
      eligible: true,
      reason: "first_post_welcome",
      observationContext: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
    },
  );
});

test("later image posts are eligible for automatic Chia observation", () => {
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost({ type: "image" }),
      profile: profile(),
      isFirstPostWelcome: false,
    }),
    {
      eligible: true,
      reason: "public_image_author",
      observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    },
  );
});

test("later uploaded-video observations are eligible for automatic Chia observation", () => {
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost({ type: "video" }),
      profile: profile(),
      isFirstPostWelcome: false,
    }),
    {
      eligible: true,
      reason: "public_video_author",
      observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    },
  );
});

test("later YouTube observations are eligible for automatic Chia observation", () => {
  assert.deepEqual(
    getAutomaticChiaObservationEligibility({
      userId: USER_ID,
      post: textPost({ type: "youtube" }),
      profile: profile(),
      isFirstPostWelcome: false,
    }),
    {
      eligible: true,
      reason: "public_youtube_author",
      observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
    },
  );
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

test("early beta timing keeps three natural response bands", () => {
  assert.deepEqual(EARLY_BETA_DELAY_BANDS, [
    { minDelaySeconds: 120, maxDelaySeconds: 180 },
    { minDelaySeconds: 480, maxDelaySeconds: 720 },
    { minDelaySeconds: 1500, maxDelaySeconds: 2100 },
  ]);
});

test("automatic Chia observation chooses the quick 2-3 minute band", () => {
  const calls = [];
  const values = [0, 150];
  const delay = pickAutoObservationDelaySeconds({
    minDelaySeconds: 120,
    maxDelaySeconds: 2100,
    randomInteger(min, maxExclusive) {
      calls.push([min, maxExclusive]);
      return values.shift();
    },
  });

  assert.equal(delay, 150);
  assert.deepEqual(calls, [[0, 3], [120, 181]]);
});

test("automatic Chia observation can choose the around-10-minute band", () => {
  const values = [1, 600];
  const delay = pickAutoObservationDelaySeconds({
    minDelaySeconds: 120,
    maxDelaySeconds: 2100,
    randomInteger: () => values.shift(),
  });

  assert.equal(delay, 600);
});

test("automatic Chia observation can choose the around-30-minute band", () => {
  const values = [2, 1800];
  const delay = pickAutoObservationDelaySeconds({
    minDelaySeconds: 120,
    maxDelaySeconds: 2100,
    randomInteger: () => values.shift(),
  });

  assert.equal(delay, 1800);
});

test("automatic Chia observation respects configured bounds by intersecting timing bands", () => {
  const values = [1, 540];
  const delay = pickAutoObservationDelaySeconds({
    minDelaySeconds: 120,
    maxDelaySeconds: 600,
    randomInteger: () => values.shift(),
  });

  assert.equal(delay, 540);
});

test("automatic Chia observation falls back to configured range when no early-beta band overlaps", () => {
  const calls = [];
  const values = [0, 60];
  const delay = pickAutoObservationDelaySeconds({
    minDelaySeconds: 45,
    maxDelaySeconds: 90,
    randomInteger(min, maxExclusive) {
      calls.push([min, maxExclusive]);
      return values.shift();
    },
  });

  assert.equal(delay, 60);
  assert.deepEqual(calls, [[0, 1], [45, 91]]);
});

test("automatic Chia observation builds delayed not-before timestamp", () => {
  const values = [0, 150];
  const notBeforeAt = buildAutoObservationNotBeforeAt({
    now: new Date("2026-07-07T00:00:00.000Z"),
    minDelaySeconds: 120,
    maxDelaySeconds: 2100,
    randomInteger: () => values.shift(),
  });

  assert.equal(notBeforeAt.toISOString(), "2026-07-07T00:02:30.000Z");
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

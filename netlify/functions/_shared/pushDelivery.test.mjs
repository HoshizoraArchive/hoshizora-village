import assert from "node:assert/strict";
import test from "node:test";
import {
  PUSH_DEFAULT_BADGE,
  PUSH_DEFAULT_ICON,
  buildPushPayload,
  getNextAttemptAt,
  getPushErrorCode,
  isGonePushSubscriptionError,
  isTransientPushError,
  toWebPushSubscription,
} from "./pushDelivery.mjs";

test("buildPushPayload uses R.Connect message and notification metadata", () => {
  const payload = JSON.parse(
    buildPushPayload({
      id: "notification-id",
      post_id: "post-id",
      type: "star_letter",
      message: "あなたの流星便に星文が届きました。",
    }),
  );

  assert.equal(payload.title, "星空Village");
  assert.equal(payload.body, "あなたの流星便に星文が届きました。");
  assert.equal(payload.icon, PUSH_DEFAULT_ICON);
  assert.equal(payload.badge, PUSH_DEFAULT_BADGE);
  assert.equal(payload.url, "/");
  assert.deepEqual(payload.data, {
    url: "/",
    notificationId: "notification-id",
    postId: "post-id",
    type: "star_letter",
  });
});

test("buildPushPayload falls back for every current notification type", () => {
  assert.equal(JSON.parse(buildPushPayload({ type: "resonance", message: "" })).body, "共鳴が届きました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "archive", message: "" })).body, "Archiveに追加されました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "star_letter", message: "" })).body, "星文が届きました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "unknown", message: "" })).body, "R.Connectに新しい通知があります。");
});

test("toWebPushSubscription only exposes endpoint and Web Push keys", () => {
  assert.deepEqual(
    toWebPushSubscription({
      endpoint: "https://push.example/sub",
      p256dh: "p256dh-key",
      auth: "auth-key",
      disabled_at: null,
    }),
    {
      endpoint: "https://push.example/sub",
      keys: {
        p256dh: "p256dh-key",
        auth: "auth-key",
      },
    },
  );
});

test("Push delivery classifies invalid and transient send failures", () => {
  assert.equal(isGonePushSubscriptionError({ statusCode: 404 }), true);
  assert.equal(isGonePushSubscriptionError({ statusCode: 410 }), true);
  assert.equal(isGonePushSubscriptionError({ statusCode: 500 }), false);
  assert.equal(isTransientPushError({ statusCode: 429 }), true);
  assert.equal(isTransientPushError({ statusCode: 503 }), true);
  assert.equal(isTransientPushError({ statusCode: 410 }), false);
  assert.equal(getPushErrorCode({ statusCode: 410 }), "PUSH_SUBSCRIPTION_GONE");
  assert.equal(getPushErrorCode({ statusCode: 503 }), "PUSH_SEND_TEMPORARY_FAILURE");
  assert.equal(getPushErrorCode({ statusCode: 401 }), "PUSH_AUTH_FAILED");
});

test("getNextAttemptAt uses bounded exponential backoff", () => {
  const now = new Date("2026-07-08T00:00:00.000Z");

  assert.equal(getNextAttemptAt(1, now), "2026-07-08T00:00:30.000Z");
  assert.equal(getNextAttemptAt(2, now), "2026-07-08T00:01:00.000Z");
  assert.equal(getNextAttemptAt(10, now), "2026-07-08T00:05:00.000Z");
});

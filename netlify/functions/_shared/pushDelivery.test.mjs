import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import test from "node:test";
import {
  PUSH_DEFAULT_BADGE,
  PUSH_DEFAULT_ICON,
  assertVapidKeyPair,
  buildPushPayload,
  getNextAttemptAt,
  getPushErrorCode,
  isGonePushSubscriptionError,
  isTransientPushError,
  logPushDeliveryFailure,
  toWebPushSubscription,
} from "./pushDelivery.mjs";

function createVapidKeyPair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();

  return {
    privateKey: ecdh.getPrivateKey().toString("base64url"),
    publicKey: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
  };
}

test("buildPushPayload uses Re:Connect message and notification metadata", () => {
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

test("buildPushPayload deep-links AI resident mentions to the meteor", () => {
  const payload = JSON.parse(
    buildPushPayload({
      id: "mention-notification-id",
      post_id: "mention-post-id",
      type: "ai_resident_mention",
      message: "星空ちあが、あなたのことを話してるよ！🌟",
    }),
  );

  assert.equal(payload.title, "星空Village");
  assert.equal(payload.body, "星空ちあが、あなたのことを話してるよ！🌟");
  assert.equal(payload.url, "/meteor/mention-post-id");
  assert.deepEqual(payload.data, {
    url: "/meteor/mention-post-id",
    notificationId: "mention-notification-id",
    postId: "mention-post-id",
    type: "ai_resident_mention",
  });
});

test("buildPushPayload falls back for every current notification type", () => {
  assert.equal(JSON.parse(buildPushPayload({ type: "resonance", message: "" })).body, "共鳴が届きました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "archive", message: "" })).body, "Archiveに追加されました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "star_letter", message: "" })).body, "星文が届きました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "star_letter_reply", message: "" })).body, "星文に返信が届きました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "star_letter_resonance", message: "" })).body, "星文に共鳴が届きました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "content_report", message: "" })).body, "観測局に新しい異常が届きました");
  assert.equal(JSON.parse(buildPushPayload({ type: "chia_post", message: "" })).body, "星空ちあが流星便を放流しました。");
  assert.equal(JSON.parse(buildPushPayload({ type: "ai_resident_mention", message: "" })).body, "AI住人が、あなたのことを話してるよ！🌟");
  assert.equal(JSON.parse(buildPushPayload({ type: "unknown", message: "" })).body, "Re:Connectに新しい通知があります。");
});

test("toWebPushSubscription only exposes endpoint and Web Push keys for an allowed Push service", () => {
  assert.deepEqual(
    toWebPushSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/subscription-id",
      p256dh: "p256dh-key",
      auth: "auth-key",
      disabled_at: null,
    }),
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/subscription-id",
      keys: {
        p256dh: "p256dh-key",
        auth: "auth-key",
      },
    },
  );
});

test("toWebPushSubscription rejects an untrusted network target before web-push can send", () => {
  assert.throws(
    () =>
      toWebPushSubscription({
        endpoint: "https://127.0.0.1/internal",
        p256dh: "p256dh-key",
        auth: "auth-key",
      }),
    (error) => error?.code === "PUSH_ENDPOINT_NOT_ALLOWED" && error?.statusCode === 400,
  );
});

test("Push delivery classifies invalid and transient send failures", () => {
  assert.equal(isGonePushSubscriptionError({ statusCode: 404 }), true);
  assert.equal(isGonePushSubscriptionError({ statusCode: 410 }), true);
  assert.equal(isGonePushSubscriptionError({ statusCode: 500 }), false);
  assert.equal(isTransientPushError({ statusCode: 429 }), true);
  assert.equal(isTransientPushError({ statusCode: 503 }), true);
  assert.equal(isTransientPushError({ statusCode: 410 }), false);
  assert.equal(getPushErrorCode({ code: "PUSH_ENDPOINT_NOT_ALLOWED", statusCode: 400 }), "PUSH_ENDPOINT_NOT_ALLOWED");
  assert.equal(getPushErrorCode({ statusCode: 410 }), "PUSH_SUBSCRIPTION_GONE");
  assert.equal(getPushErrorCode({ statusCode: 503 }), "PUSH_SEND_TEMPORARY_FAILURE");
  assert.equal(getPushErrorCode({ statusCode: 401 }), "PUSH_AUTH_FAILED");
  assert.equal(getPushErrorCode({ statusCode: 403 }), "PUSH_AUTH_FAILED");
  assert.equal(getPushErrorCode({ statusCode: 404 }), "PUSH_SUBSCRIPTION_GONE");
  assert.equal(getPushErrorCode({ statusCode: 429 }), "PUSH_SEND_TEMPORARY_FAILURE");
  assert.equal(getPushErrorCode({ statusCode: 500 }), "PUSH_SEND_TEMPORARY_FAILURE");
  assert.equal(getPushErrorCode({ statusCode: 418 }), "PUSH_SEND_FAILED");
});

test("VAPID delivery configuration accepts only a matching P-256 key pair", () => {
  const pair = createVapidKeyPair();

  assert.doesNotThrow(() => assertVapidKeyPair(pair.publicKey, pair.privateKey));
});

test("VAPID delivery configuration rejects a mismatched P-256 key pair", () => {
  const firstPair = createVapidKeyPair();
  const secondPair = createVapidKeyPair();

  assert.throws(
    () => assertVapidKeyPair(firstPair.publicKey, secondPair.privateKey),
    (error) => error?.code === "PUSH_VAPID_KEY_MISMATCH" && error?.status === 503,
  );
});

test("Push delivery logs only safe failure metadata", () => {
  const originalWarn = console.warn;
  const logged = [];
  const secret = "private-key-must-not-appear";

  try {
    console.warn = (...args) => logged.push(args);
    logPushDeliveryFailure({
      code: "PUSH_AUTH_FAILED",
      error: {
        body: secret,
        statusCode: 401,
      },
      endpoint: `https://fcm.googleapis.com/${secret}`,
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(logged, [
    [
      "Hoshizora Push delivery event",
      {
        code: "PUSH_AUTH_FAILED",
        deployContext: "unknown",
        pushService: "fcm",
        statusCode: 401,
      },
    ],
  ]);
  assert.equal(JSON.stringify(logged).includes(secret), false);
});

test("getNextAttemptAt uses bounded exponential backoff", () => {
  const now = new Date("2026-07-08T00:00:00.000Z");

  assert.equal(getNextAttemptAt(1, now), "2026-07-08T00:00:30.000Z");
  assert.equal(getNextAttemptAt(2, now), "2026-07-08T00:01:00.000Z");
  assert.equal(getNextAttemptAt(10, now), "2026-07-08T00:05:00.000Z");
});

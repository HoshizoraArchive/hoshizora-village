import assert from "node:assert/strict";
import test from "node:test";
import {
  getAllowedPushServiceKind,
  isAllowedPushServiceEndpoint,
} from "./pushEndpointSecurity.mjs";
import { readPushSubscriptionPayload } from "./pushNotifications.mjs";

const TRUSTED_ENDPOINTS = [
  ["https://fcm.googleapis.com/fcm/send/subscription-id", "fcm"],
  ["https://android.googleapis.com/gcm/send/subscription-id", "fcm"],
  ["https://updates.push.services.mozilla.com/wpush/v2/subscription-id", "mozilla"],
  ["https://web.push.apple.com/QM/subscription-id", "apple"],
  ["https://wns2-pn1p.notify.windows.com/w/?token=subscription-id", "microsoft"],
];

for (const [endpoint, service] of TRUSTED_ENDPOINTS) {
  test(`allows trusted Web Push endpoint: ${service}`, () => {
    assert.equal(getAllowedPushServiceKind(endpoint), service);
    assert.equal(isAllowedPushServiceEndpoint(endpoint), true);
  });
}

for (const endpoint of [
  "https://127.0.0.1/internal",
  "https://localhost/internal",
  "https://169.254.169.254/latest/meta-data/",
  "https://fcm.googleapis.com.evil.example/push",
  "https://push.apple.com.evil.example/push",
  "https://evilpush.apple.com/push",
  "https://user:password@fcm.googleapis.com/fcm/send/subscription-id",
  "https://fcm.googleapis.com:8443/fcm/send/subscription-id",
  "http://fcm.googleapis.com/fcm/send/subscription-id",
]) {
  test(`rejects untrusted Web Push endpoint: ${endpoint}`, () => {
    assert.equal(getAllowedPushServiceKind(endpoint), null);
    assert.equal(isAllowedPushServiceEndpoint(endpoint), false);
  });
}

function requestForEndpoint(endpoint) {
  return new Request("https://hoshizora-village.netlify.app/api/push-subscription-register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscription: {
        endpoint,
        keys: {
          p256dh: "p256dh-key",
          auth: "auth-key",
        },
      },
    }),
  });
}

test("trusted registration mode accepts a supported Push service", async () => {
  const payload = await readPushSubscriptionPayload(
    requestForEndpoint("https://fcm.googleapis.com/fcm/send/subscription-id"),
    { requireTrustedEndpoint: true },
  );

  assert.equal(payload.endpoint, "https://fcm.googleapis.com/fcm/send/subscription-id");
});

test("trusted registration mode rejects an arbitrary HTTPS destination", async () => {
  await assert.rejects(
    readPushSubscriptionPayload(requestForEndpoint("https://example.com/internal"), {
      requireTrustedEndpoint: true,
    }),
    (error) => error?.code === "PUSH_ENDPOINT_NOT_ALLOWED" && error?.status === 400,
  );
});

test("default payload parsing remains usable for disabling an existing legacy record", async () => {
  const payload = await readPushSubscriptionPayload(requestForEndpoint("https://example.com/legacy"));
  assert.equal(payload.endpoint, "https://example.com/legacy");
});

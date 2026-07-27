import assert from "node:assert/strict";
import test from "node:test";
import { pushErrorResponse } from "./pushNotifications.mjs";
import { buildPushSubscriptionTestPayload, sendPushSubscriptionTest } from "./pushSubscriptionTest.mjs";

function createTestSupabase({ data, error = null }) {
  const filters = [];
  const updates = [];
  const query = {
    select() {
      return query;
    },
    update(values) {
      updates.push(values);
      return query;
    },
    eq(column, value) {
      filters.push(["eq", column, value]);
      return query;
    },
    is(column, value) {
      filters.push(["is", column, value]);
      return query;
    },
    async maybeSingle() {
      return { data, error };
    },
    then(resolve, reject) {
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };

  return {
    filters,
    updates,
    supabase: {
      from(table) {
        assert.equal(table, "push_subscriptions");
        return query;
      },
    },
  };
}

const subscription = {
  auth: "current-auth",
  endpoint: "https://push.example.test/current-device",
  p256dh: "current-p256dh",
};

test("server Push test targets only the current account's exact subscription, never an old account's record", async () => {
  const mock = createTestSupabase({
    data: {
      id: "current-subscription-id",
      ...subscription,
    },
  });
  const sent = [];

  await sendPushSubscriptionTest({
    profileId: "current-profile-id",
    subscription,
    supabase: mock.supabase,
    webPushClient: {
      async sendNotification(target, payload) {
        sent.push({ payload, target });
      },
    },
  });

  assert.deepEqual(mock.filters, [
    ["eq", "profile_id", "current-profile-id"],
    ["eq", "endpoint", subscription.endpoint],
    ["eq", "p256dh", subscription.p256dh],
    ["eq", "auth", subscription.auth],
    ["is", "disabled_at", null],
  ]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].target.endpoint, subscription.endpoint);
  assert.match(sent[0].payload, /おはちあ！ 星空Villageの通知が届いたよ💕/);
});

test("server Push test refuses an old-account or key-mismatched record without sending", async () => {
  const mock = createTestSupabase({ data: null });
  let sent = false;

  await assert.rejects(
    sendPushSubscriptionTest({
      profileId: "current-profile-id",
      subscription,
      supabase: mock.supabase,
      webPushClient: {
        async sendNotification() {
          sent = true;
        },
      },
    }),
    (error) => error?.code === "PUSH_SUBSCRIPTION_NOT_REGISTERED" && error?.status === 409,
  );
  assert.equal(sent, false);
});

for (const [statusCode, expectedCode] of [
  [401, "PUSH_AUTH_FAILED"],
  [403, "PUSH_AUTH_FAILED"],
  [404, "PUSH_SUBSCRIPTION_GONE"],
  [410, "PUSH_SUBSCRIPTION_GONE"],
  [429, "PUSH_SEND_TEMPORARY_FAILURE"],
  [500, "PUSH_SEND_TEMPORARY_FAILURE"],
]) {
  test(`server Push test returns ${expectedCode} for Push service status ${statusCode}`, async () => {
    const mock = createTestSupabase({
      data: {
        id: "current-subscription-id",
        ...subscription,
      },
    });

    const providerSecret = "provider-response-must-not-be-exposed";
    const originalWarn = console.warn;
    let receivedError;

    try {
      console.warn = () => {};
      await assert.rejects(
        sendPushSubscriptionTest({
          profileId: "current-profile-id",
          subscription,
          supabase: mock.supabase,
          webPushClient: {
            async sendNotification() {
              const error = new Error(providerSecret);
              error.statusCode = statusCode;
              throw error;
            },
          },
        }),
        (error) => {
          receivedError = error;
          return error?.code === expectedCode;
        },
      );
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(receivedError.message.includes(providerSecret), false);
    assert.equal((await pushErrorResponse(receivedError).text()).includes(providerSecret), false);
  });
}

test("server Push test payload contains only the fixed test message", () => {
  const payload = JSON.parse(buildPushSubscriptionTestPayload());

  assert.deepEqual(payload, {
    title: "星空ちあ｜街の案内人",
    body: "おはちあ！ 星空Villageの通知が届いたよ💕",
    icon: "/images/icons/hoshizora-village-icon-192.png",
    badge: "/images/icons/favicon-32.png",
    data: {
      url: "/",
      type: "push_test",
    },
  });
});

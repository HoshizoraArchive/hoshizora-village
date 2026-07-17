import assert from "node:assert/strict";
import test from "node:test";
import { buildPushSubscriptionTestPayload, sendPushSubscriptionTest } from "./pushSubscriptionTest.mjs";

function createTestSupabase({ data, error = null }) {
  const filters = [];
  const query = {
    select() {
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
  };

  return {
    filters,
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
  assert.match(sent[0].payload, /R.Connect通知のテストです。/);
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

test("server Push test payload contains only the fixed test message", () => {
  const payload = JSON.parse(buildPushSubscriptionTestPayload());

  assert.deepEqual(payload, {
    title: "星空Village",
    body: "R.Connect通知のテストです。",
    icon: "/images/icons/hoshizora-village-icon-192.png",
    badge: "/images/icons/favicon-32.png",
    data: {
      url: "/",
      type: "push_test",
    },
  });
});

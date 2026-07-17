import assert from "node:assert/strict";
import test from "node:test";
import { disablePushSubscription } from "./pushSubscriptionDisable.mjs";

function createDisableSupabase({ data, error = null, existingEndpoint = null, existingEndpointError = null }) {
  const filters = [];
  const updates = [];
  let maybeSingleCalls = 0;
  const query = {
    update(values) {
      updates.push(values);
      return query;
    },
    eq(column, value) {
      filters.push(["eq", column, value]);
      return query;
    },
    select() {
      return query;
    },
    async maybeSingle() {
      maybeSingleCalls += 1;
      return maybeSingleCalls === 1 ? { data, error } : { data: existingEndpoint, error: existingEndpointError };
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

test("re-registration disables only a current account record matching endpoint and both Push keys", async () => {
  const mock = createDisableSupabase({ data: { id: "subscription-id" } });

  await disablePushSubscription({
    now: "2026-07-18T00:00:00.000Z",
    profileId: "current-profile-id",
    subscription,
    supabase: mock.supabase,
  });

  assert.deepEqual(mock.updates, [
    {
      disabled_at: "2026-07-18T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(mock.filters, [
    ["eq", "profile_id", "current-profile-id"],
    ["eq", "endpoint", subscription.endpoint],
    ["eq", "p256dh", subscription.p256dh],
    ["eq", "auth", subscription.auth],
  ]);
});

test("re-registration allows a browser-only subscription with no server record to be replaced", async () => {
  const mock = createDisableSupabase({ data: null });

  const result = await disablePushSubscription({
    profileId: "current-profile-id",
    subscription,
    supabase: mock.supabase,
  });

  assert.deepEqual(result, { status: "not_registered" });
  assert.equal(mock.updates.length, 1);
});

test("re-registration never disables another account or a key-mismatched record", async () => {
  const mock = createDisableSupabase({ data: null, existingEndpoint: { id: "other-account-subscription" } });

  await assert.rejects(
    disablePushSubscription({
      profileId: "current-profile-id",
      subscription,
      supabase: mock.supabase,
    }),
    (error) => error?.code === "PUSH_SUBSCRIPTION_NOT_OWNED" && error?.status === 409,
  );
  assert.equal(mock.updates.length, 1);
  assert.equal(mock.filters.some(([, column]) => column === "profile_id"), true);
});

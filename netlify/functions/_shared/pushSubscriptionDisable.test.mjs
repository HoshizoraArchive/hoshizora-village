import assert from "node:assert/strict";
import test from "node:test";
import { disablePushSubscription } from "./pushSubscriptionDisable.mjs";

function createDisableSupabase({ data, error = null, existingEndpoint = null, existingEndpointError = null }) {
  const filters = [];
  const updates = [];
  const limits = [];
  let fromCalls = 0;

  function createQuery(result) {
    return {
      update(values) {
        updates.push(values);
        return this;
      },
      eq(column, value) {
        filters.push(["eq", column, value]);
        return this;
      },
      limit(value) {
        limits.push(value);
        return this;
      },
      select() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
  }

  return {
    filters,
    limits,
    updates,
    supabase: {
      from(table) {
        assert.equal(table, "push_subscriptions");
        fromCalls += 1;
        return fromCalls === 1
          ? createQuery({ data, error })
          : createQuery({ data: existingEndpoint, error: existingEndpointError });
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
  const mock = createDisableSupabase({ data: [{ id: "subscription-id" }] });

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
  const mock = createDisableSupabase({ data: [], existingEndpoint: [] });

  const result = await disablePushSubscription({
    profileId: "current-profile-id",
    subscription,
    supabase: mock.supabase,
  });

  assert.deepEqual(result, { status: "not_registered" });
  assert.equal(mock.updates.length, 1);
});

test("re-registration never disables another account or a key-mismatched record", async () => {
  const mock = createDisableSupabase({ data: [], existingEndpoint: [{ id: "other-account-subscription" }] });

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
  assert.deepEqual(mock.limits, [1]);
});

test("re-registration safely disables matching legacy duplicates without requiring a maybeSingle response", async () => {
  const mock = createDisableSupabase({
    data: [{ id: "matching-subscription-one" }, { id: "matching-subscription-two" }],
  });

  const result = await disablePushSubscription({
    profileId: "current-profile-id",
    subscription,
    supabase: mock.supabase,
  });

  assert.deepEqual(result, { status: "disabled" });
  assert.equal(mock.updates.length, 1);
  assert.deepEqual(mock.limits, []);
});

test("re-registration surfaces a safe update-stage failure without subscription data", async () => {
  const mock = createDisableSupabase({ data: [], error: { code: "database_error" } });

  await assert.rejects(
    disablePushSubscription({
      profileId: "current-profile-id",
      subscription,
      supabase: mock.supabase,
    }),
    (error) =>
      error?.code === "PUSH_REREGISTER_DISABLE_FAILED" &&
      error?.safeLogStage === "update" &&
      !error.message.includes(subscription.endpoint),
  );
});

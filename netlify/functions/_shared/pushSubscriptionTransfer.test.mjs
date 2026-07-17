import assert from "node:assert/strict";
import test from "node:test";
import { transferPushSubscription } from "./pushSubscriptionTransfer.mjs";

function createTransferSupabase({ data, error = null }) {
  const filters = [];
  const updates = [];
  const query = {
    update(values) {
      updates.push(values);
      return query;
    },
    eq(column, value) {
      filters.push(["eq", column, value]);
      return query;
    },
    neq(column, value) {
      filters.push(["neq", column, value]);
      return query;
    },
    select() {
      return query;
    },
    async maybeSingle() {
      return { data, error };
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

test("account transfer atomically matches the current endpoint and Push keys before replacing profile_id", async () => {
  const mock = createTransferSupabase({ data: { id: "subscription-id" } });

  await transferPushSubscription({
    now: "2026-07-17T00:00:00.000Z",
    profileId: "current-profile-id",
    subscription,
    supabase: mock.supabase,
  });

  assert.deepEqual(mock.updates, [
    {
      profile_id: "current-profile-id",
      disabled_at: null,
      updated_at: "2026-07-17T00:00:00.000Z",
      last_seen_at: "2026-07-17T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(mock.filters, [
    ["eq", "endpoint", subscription.endpoint],
    ["eq", "p256dh", subscription.p256dh],
    ["eq", "auth", subscription.auth],
    ["neq", "profile_id", "current-profile-id"],
  ]);
});

test("account transfer rejects a missing or key-mismatched subscription without changing its owner", async () => {
  const mock = createTransferSupabase({ data: null });

  await assert.rejects(
    transferPushSubscription({
      profileId: "current-profile-id",
      subscription,
      supabase: mock.supabase,
    }),
    (error) => error?.code === "PUSH_SUBSCRIPTION_MISMATCH" && error?.status === 409,
  );
  assert.equal(mock.updates.length, 1);
});

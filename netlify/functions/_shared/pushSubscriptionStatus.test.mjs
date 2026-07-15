import assert from "node:assert/strict";
import test from "node:test";
import { getPushSubscriptionRegistrationStatus } from "../../../src/pushNotificationSetup.js";

const subscription = {
  endpoint: "https://push.example.test/subscription",
  toJSON() {
    return {
      keys: {
        auth: "auth-key",
        p256dh: "p256dh-key",
      },
    };
  },
};

function installPushBrowserMock({ responsePayload }) {
  const registration = {
    pushManager: {
      async getSubscription() {
        return subscription;
      },
    },
  };
  const calls = {
    fetch: [],
    ready: 0,
    register: 0,
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      Notification: globalThis.Notification,
      atob(value) {
        return Buffer.from(value, "base64").toString("binary");
      },
      PushManager: class PushManager {},
    },
    writable: true,
  });
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: { permission: "granted" },
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        async register() {
          calls.register += 1;
          return registration;
        },
        get ready() {
          calls.ready += 1;
          return Promise.resolve(registration);
        },
      },
    },
    writable: true,
  });
  globalThis.fetch = async (url, options) => {
    calls.fetch.push({ options, url });
    return new Response(JSON.stringify(responsePayload), { status: 200 });
  };

  return calls;
}

test("existing Push subscription waits for the ready Service Worker and confirms the signed-in server record", async () => {
  const calls = installPushBrowserMock({
    responsePayload: { canRegister: true, status: "registered" },
  });

  const result = await getPushSubscriptionRegistrationStatus({ accessToken: "session-token" });

  assert.deepEqual(result, {
    canRegister: true,
    hasSubscription: true,
    status: "registered",
  });
  assert.equal(calls.ready, 1);
  assert.equal(calls.register, 1);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, "/api/push-subscription-status");
  assert.equal(calls.fetch[0].options.headers.Authorization, "Bearer session-token");
});

test("an existing subscription without a server record remains unregistered but can be safely registered", async () => {
  const calls = installPushBrowserMock({
    responsePayload: { canRegister: true, status: "unregistered" },
  });

  const result = await getPushSubscriptionRegistrationStatus({ accessToken: "session-token" });

  assert.deepEqual(result, {
    canRegister: true,
    hasSubscription: true,
    status: "unregistered",
  });
  assert.equal(calls.fetch.length, 1);
});

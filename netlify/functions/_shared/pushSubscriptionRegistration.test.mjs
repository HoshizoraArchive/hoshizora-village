import assert from "node:assert/strict";
import test from "node:test";

const VAPID_PUBLIC_KEY = "AQIDBA";

function createSubscription(endpoint) {
  return {
    endpoint,
    toJSON() {
      return {
        keys: {
          auth: "auth-key",
          p256dh: "p256dh-key",
        },
      };
    },
  };
}

function installPushBrowserMock({ existingSubscription }) {
  const createdSubscription = createSubscription("https://push.example.test/new-subscription");
  const calls = {
    fetch: [],
    getSubscription: 0,
    register: 0,
    subscribe: [],
  };
  const registration = {
    pushManager: {
      async getSubscription() {
        calls.getSubscription += 1;
        return existingSubscription;
      },
      async subscribe(options) {
        calls.subscribe.push(options);
        return createdSubscription;
      },
    },
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
        ready: Promise.resolve(registration),
      },
    },
    writable: true,
  });
  globalThis.fetch = async (url, options = {}) => {
    calls.fetch.push({ options, url });

    if (url === "/api/push-config") {
      return new Response(JSON.stringify({ enabled: true, publicKey: VAPID_PUBLIC_KEY }), { status: 200 });
    }

    return new Response(JSON.stringify({ status: "registered" }), { status: 200 });
  };

  return { calls, createdSubscription };
}

async function loadPushNotificationSetup() {
  const moduleUrl = new URL("../../../src/pushNotificationSetup.js", import.meta.url);
  return import(`${moduleUrl.href}?push-registration-test=${crypto.randomUUID()}`);
}

test("a new device subscribes once with the ready Service Worker and registers the created subscription", async () => {
  const { calls, createdSubscription } = installPushBrowserMock({ existingSubscription: null });
  const { subscribeToPushNotifications } = await loadPushNotificationSetup();

  const result = await subscribeToPushNotifications({ accessToken: "session-token" });

  assert.deepEqual(result, { status: "registered" });
  assert.equal(calls.getSubscription, 1);
  assert.equal(calls.subscribe.length, 1);
  assert.equal(calls.subscribe[0].userVisibleOnly, true);
  assert.deepEqual([...calls.subscribe[0].applicationServerKey], [1, 2, 3, 4]);
  assert.equal(calls.fetch.length, 2);
  assert.equal(calls.fetch[1].url, "/api/push-subscription-register");
  assert.equal(calls.fetch[1].options.headers.Authorization, "Bearer session-token");
  assert.deepEqual(JSON.parse(calls.fetch[1].options.body), {
    subscription: {
      endpoint: createdSubscription.endpoint,
      keys: {
        auth: "auth-key",
        p256dh: "p256dh-key",
      },
    },
  });
});

test("an existing device subscription is registered without subscribing again", async () => {
  const existingSubscription = createSubscription("https://push.example.test/existing-subscription");
  const { calls } = installPushBrowserMock({ existingSubscription });
  const { subscribeToPushNotifications } = await loadPushNotificationSetup();

  const result = await subscribeToPushNotifications({ accessToken: "session-token" });

  assert.deepEqual(result, { status: "registered" });
  assert.equal(calls.getSubscription, 1);
  assert.equal(calls.subscribe.length, 0);
  assert.equal(calls.fetch[1].url, "/api/push-subscription-register");
  assert.equal(JSON.parse(calls.fetch[1].options.body).subscription.endpoint, existingSubscription.endpoint);
});

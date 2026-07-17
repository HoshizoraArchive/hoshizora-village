import assert from "node:assert/strict";
import test from "node:test";

const VAPID_PUBLIC_KEY = "AQIDBA";

function createSubscription(endpoint) {
  return {
    endpoint,
    toJSON() {
      return {
        keys: {
          auth: `${endpoint}-auth`,
          p256dh: `${endpoint}-p256dh`,
        },
      };
    },
  };
}

function installPushBrowserMock({ disablePayload, existingSubscription = null, subscribeError, unsubscribeError } = {}) {
  const createdSubscription = createSubscription("https://push.example.test/new-subscription");
  let currentSubscription = existingSubscription;
  const calls = {
    fetch: [],
    getSubscription: 0,
    register: 0,
    subscribe: [],
    unsubscribe: 0,
  };

  if (existingSubscription) {
    existingSubscription.unsubscribe = async () => {
      calls.unsubscribe += 1;

      if (unsubscribeError) {
        throw unsubscribeError;
      }

      currentSubscription = null;
      return true;
    };
  }

  const registration = {
    pushManager: {
      async getSubscription() {
        calls.getSubscription += 1;
        return currentSubscription;
      },
      async subscribe(options) {
        calls.subscribe.push(options);

        if (subscribeError) {
          throw subscribeError;
        }

        currentSubscription = createdSubscription;
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

    if (url === "/api/push-subscription-status") {
      return new Response(JSON.stringify({ canRegister: true, status: "registered" }), { status: 200 });
    }

    if (url === "/api/push-subscription-disable") {
      return new Response(JSON.stringify(disablePayload ?? { status: "disabled" }), { status: 200 });
    }

    return new Response(JSON.stringify({ status: "registered" }), { status: 200 });
  };

  return { calls, createdSubscription };
}

async function loadPushNotificationSetup() {
  const moduleUrl = new URL("../../../src/pushNotificationSetup.js", import.meta.url);
  return import(`${moduleUrl.href}?push-registration-test=${crypto.randomUUID()}`);
}

function payloadFor(call) {
  return JSON.parse(call.options.body).subscription;
}

test("a new device subscribes once with the ready Service Worker and registers the created subscription", async () => {
  const { calls, createdSubscription } = installPushBrowserMock();
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
  assert.equal(payloadFor(calls.fetch[1]).endpoint, createdSubscription.endpoint);
});

test("normal registration does not reuse an existing browser subscription without a server record", async () => {
  const existingSubscription = createSubscription("https://push.example.test/existing-subscription");
  const { calls } = installPushBrowserMock({ existingSubscription });
  const { subscribeToPushNotifications } = await loadPushNotificationSetup();

  await assert.rejects(
    subscribeToPushNotifications({ accessToken: "session-token" }),
    (error) => error?.message === "push-subscription-reregister-required",
  );
  assert.equal(calls.getSubscription, 1);
  assert.equal(calls.subscribe.length, 0);
  assert.equal(calls.fetch.length, 0);
});

test("re-registration disables only the current server record, unsubscribes, creates a new subscription, and confirms registration", async () => {
  const existingSubscription = createSubscription("https://push.example.test/old-subscription");
  const { calls, createdSubscription } = installPushBrowserMock({
    disablePayload: { status: "not_registered" },
    existingSubscription,
  });
  const { reRegisterPushNotifications } = await loadPushNotificationSetup();

  const result = await reRegisterPushNotifications({ accessToken: "session-token" });

  assert.deepEqual(result, { status: "registered" });
  assert.equal(calls.unsubscribe, 1);
  assert.equal(calls.subscribe.length, 1);
  assert.deepEqual(
    calls.fetch.map((call) => call.url),
    [
      "/api/push-subscription-disable",
      "/api/push-config",
      "/api/push-subscription-register",
      "/api/push-subscription-status",
    ],
  );
  assert.equal(payloadFor(calls.fetch[0]).endpoint, existingSubscription.endpoint);
  assert.equal(payloadFor(calls.fetch[2]).endpoint, createdSubscription.endpoint);
  assert.equal(calls.subscribe[0].userVisibleOnly, true);
  assert.deepEqual([...calls.subscribe[0].applicationServerKey], [1, 2, 3, 4]);
});

test("re-registration creates and confirms a new subscription when the browser has none", async () => {
  const { calls } = installPushBrowserMock();
  const { reRegisterPushNotifications } = await loadPushNotificationSetup();

  const result = await reRegisterPushNotifications({ accessToken: "session-token" });

  assert.deepEqual(result, { status: "registered" });
  assert.equal(calls.unsubscribe, 0);
  assert.equal(calls.subscribe.length, 1);
  assert.deepEqual(
    calls.fetch.map((call) => call.url),
    ["/api/push-config", "/api/push-subscription-register", "/api/push-subscription-status"],
  );
});

test("re-registration stops before creating a new subscription when unsubscribe fails", async () => {
  const existingSubscription = createSubscription("https://push.example.test/old-subscription");
  const { calls } = installPushBrowserMock({
    existingSubscription,
    unsubscribeError: new Error("browser-unsubscribe-failure"),
  });
  const { reRegisterPushNotifications } = await loadPushNotificationSetup();

  await assert.rejects(
    reRegisterPushNotifications({ accessToken: "session-token" }),
    (error) => error?.message === "PUSH_REREGISTER_UNSUBSCRIBE_FAILED",
  );
  assert.equal(calls.unsubscribe, 1);
  assert.equal(calls.subscribe.length, 0);
  assert.deepEqual(calls.fetch.map((call) => call.url), ["/api/push-subscription-disable"]);
});

test("re-registration stops before registration when new subscription creation fails", async () => {
  const { calls } = installPushBrowserMock({ subscribeError: new Error("browser-subscribe-failure") });
  const { reRegisterPushNotifications } = await loadPushNotificationSetup();

  await assert.rejects(
    reRegisterPushNotifications({ accessToken: "session-token" }),
    (error) => error?.message === "PUSH_REREGISTER_SUBSCRIBE_FAILED",
  );
  assert.equal(calls.subscribe.length, 1);
  assert.deepEqual(calls.fetch.map((call) => call.url), ["/api/push-config"]);
});

test("re-registration errors never include subscription keys or endpoint values", async () => {
  const secretEndpoint = "https://push.example.test/endpoint-must-not-leak";
  const existingSubscription = createSubscription(secretEndpoint);
  const { calls } = installPushBrowserMock({
    existingSubscription,
    unsubscribeError: new Error("unsubscribe-failure"),
  });
  const { reRegisterPushNotifications } = await loadPushNotificationSetup();

  let receivedError;
  await assert.rejects(reRegisterPushNotifications({ accessToken: "session-token" }), (error) => {
    receivedError = error;
    return error?.message === "PUSH_REREGISTER_UNSUBSCRIBE_FAILED";
  });

  assert.equal(receivedError.message.includes(secretEndpoint), false);
  assert.equal(JSON.stringify(calls).includes("session-token"), true);
  assert.equal(receivedError.message.includes("session-token"), false);
});

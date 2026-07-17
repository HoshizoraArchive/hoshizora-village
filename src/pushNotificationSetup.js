const SERVICE_WORKER_PATH = "/sw.js";
const PUSH_CONFIG_ENDPOINT = "/api/push-config";
const PUSH_SUBSCRIPTION_REGISTER_ENDPOINT = "/api/push-subscription-register";
const PUSH_SUBSCRIPTION_STATUS_ENDPOINT = "/api/push-subscription-status";
const PUSH_SUBSCRIPTION_TEST_ENDPOINT = "/api/push-subscription-test";
const PUSH_SUBSCRIPTION_TRANSFER_ENDPOINT = "/api/push-subscription-transfer";

let registrationPromise = null;

export function isPushNotificationSupported() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function isPushSubscriptionSupported() {
  return isPushNotificationSupported() && "PushManager" in window;
}

export function getPushNotificationPermission() {
  if (!isPushNotificationSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

export function getPushNotificationPermissionLabel(permission = getPushNotificationPermission()) {
  if (permission === "granted") {
    return "通知: 許可済み";
  }

  if (permission === "denied") {
    return "通知: ブロック中";
  }

  if (permission === "unsupported") {
    return "通知: この表示環境では未対応";
  }

  return "通知: 未設定";
}

export async function registerPushNotificationServiceWorker() {
  if (!isPushNotificationSupported()) {
    return null;
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch((error) => {
      registrationPromise = null;
      throw error;
    });
  }

  return registrationPromise;
}

export async function getReadyPushNotificationServiceWorker() {
  const registration = await registerPushNotificationServiceWorker();

  if (!registration) {
    return null;
  }

  return navigator.serviceWorker.ready;
}

export async function requestPushNotificationPermission() {
  if (!isPushNotificationSupported()) {
    return "unsupported";
  }

  await registerPushNotificationServiceWorker();
  return Notification.requestPermission();
}

async function getExistingPushSubscription() {
  const registration = await getReadyPushNotificationServiceWorker();
  return registration.pushManager.getSubscription();
}

async function postPushSubscription({ accessToken, endpoint, errorPrefix, subscription }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizeSubscriptionPayload(subscription)),
  });

  if (!response.ok) {
    throw new Error(`${errorPrefix}-${await readPushApiErrorCode(response)}`);
  }

  return response.json();
}

export async function sendPushNotificationTest({ accessToken }) {
  if (!isPushSubscriptionSupported()) {
    throw new Error("push-notification-unsupported");
  }

  if (!accessToken) {
    throw new Error("push-subscription-login-required");
  }

  if (Notification.permission !== "granted") {
    throw new Error("push-notification-permission-required");
  }

  const subscription = await getExistingPushSubscription();

  if (!subscription) {
    throw new Error("push-subscription-not-registered");
  }

  await postPushSubscription({
    accessToken,
    endpoint: PUSH_SUBSCRIPTION_TEST_ENDPOINT,
    errorPrefix: "push-subscription-test",
    subscription,
  });
}

export async function fetchPushNotificationConfig() {
  const response = await fetch(PUSH_CONFIG_ENDPOINT, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("push-config-failed");
  }

  const config = await response.json();

  return {
    enabled: Boolean(config?.enabled),
    publicKey: typeof config?.publicKey === "string" ? config.publicKey : "",
  };
}

export function urlBase64ToUint8Array(publicKey) {
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
  const base64 = `${publicKey}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function normalizeSubscriptionPayload(subscription) {
  const subscriptionJson = subscription.toJSON();

  return {
    subscription: {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscriptionJson?.keys?.p256dh ?? "",
        auth: subscriptionJson?.keys?.auth ?? "",
      },
    },
  };
}

async function readPushApiErrorCode(response) {
  const payload = await response.json().catch(() => null);
  const code = payload?.error?.code;

  return typeof code === "string" ? code : "PUSH_REQUEST_FAILED";
}

export async function getPushSubscriptionRegistrationStatus({ accessToken }) {
  if (!isPushSubscriptionSupported()) {
    return {
      canRegister: false,
      canTransfer: false,
      hasSubscription: false,
      status: "unsupported",
    };
  }

  const subscription = await getExistingPushSubscription();

  if (!subscription || !accessToken) {
    return {
      canRegister: Boolean(subscription && accessToken),
      canTransfer: false,
      hasSubscription: Boolean(subscription),
      status: "unregistered",
    };
  }

  const payload = await postPushSubscription({
    accessToken,
    endpoint: PUSH_SUBSCRIPTION_STATUS_ENDPOINT,
    errorPrefix: "push-subscription-status",
    subscription,
  });

  return {
    canRegister: payload?.canRegister === true,
    canTransfer: payload?.canTransfer === true,
    hasSubscription: true,
    status: ["registered", "account_mismatch"].includes(payload?.status) ? payload.status : "unregistered",
  };
}

export async function transferPushSubscriptionToCurrentAccount({ accessToken }) {
  if (!isPushSubscriptionSupported()) {
    throw new Error("push-subscription-unsupported");
  }

  if (!accessToken) {
    throw new Error("push-subscription-login-required");
  }

  const subscription = await getExistingPushSubscription();

  if (!subscription) {
    throw new Error("push-subscription-not-registered");
  }

  await postPushSubscription({
    accessToken,
    endpoint: PUSH_SUBSCRIPTION_TRANSFER_ENDPOINT,
    errorPrefix: "push-subscription-transfer",
    subscription,
  });
}

export async function subscribeToPushNotifications({ accessToken }) {
  if (!isPushSubscriptionSupported()) {
    throw new Error("push-subscription-unsupported");
  }

  if (!accessToken) {
    throw new Error("push-subscription-login-required");
  }

  if (Notification.permission !== "granted") {
    throw new Error("push-subscription-permission-required");
  }

  const config = await fetchPushNotificationConfig();

  if (!config.enabled || !config.publicKey) {
    throw new Error("push-vapid-key-missing");
  }

  const registration = await getReadyPushNotificationServiceWorker();
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    }));

  await postPushSubscription({
    accessToken,
    endpoint: PUSH_SUBSCRIPTION_REGISTER_ENDPOINT,
    errorPrefix: "push-subscription-register",
    subscription,
  });

  return {
    status: "registered",
  };
}

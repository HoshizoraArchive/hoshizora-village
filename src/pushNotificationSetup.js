const SERVICE_WORKER_PATH = "/sw.js";
const PUSH_CONFIG_ENDPOINT = "/api/push-config";
const PUSH_SUBSCRIPTION_REGISTER_ENDPOINT = "/api/push-subscription-register";
const PUSH_SUBSCRIPTION_STATUS_ENDPOINT = "/api/push-subscription-status";
const PUSH_SUBSCRIPTION_TEST_ENDPOINT = "/api/push-subscription-test";
const PUSH_SUBSCRIPTION_TRANSFER_ENDPOINT = "/api/push-subscription-transfer";
const PUSH_SUBSCRIPTION_DISABLE_ENDPOINT = "/api/push-subscription-disable";

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

async function getExistingPushSubscription(registration) {
  const readyRegistration = registration ?? (await getReadyPushNotificationServiceWorker());
  return readyRegistration?.pushManager?.getSubscription?.() ?? null;
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

function reRegistrationError(code) {
  return new Error(code);
}

export async function reRegisterPushNotifications({ accessToken }) {
  if (!isPushSubscriptionSupported()) {
    throw reRegistrationError("PUSH_REREGISTER_UNSUPPORTED");
  }

  if (!accessToken) {
    throw reRegistrationError("PUSH_REREGISTER_LOGIN_REQUIRED");
  }

  if (Notification.permission !== "granted") {
    throw reRegistrationError("PUSH_REREGISTER_PERMISSION_REQUIRED");
  }

  const registration = await getReadyPushNotificationServiceWorker();

  if (!registration) {
    throw reRegistrationError("PUSH_REREGISTER_SERVICE_WORKER_FAILED");
  }

  const existingSubscription = await getExistingPushSubscription(registration);

  if (existingSubscription) {
    try {
      await postPushSubscription({
        accessToken,
        endpoint: PUSH_SUBSCRIPTION_DISABLE_ENDPOINT,
        errorPrefix: "push-subscription-reregister-disable",
        subscription: existingSubscription,
      });
    } catch {
      throw reRegistrationError("PUSH_REREGISTER_DISABLE_FAILED");
    }

    try {
      const unsubscribed = await existingSubscription.unsubscribe();

      if (!unsubscribed) {
        throw new Error("unsubscribe-returned-false");
      }
    } catch {
      throw reRegistrationError("PUSH_REREGISTER_UNSUBSCRIBE_FAILED");
    }
  }

  let config;

  try {
    config = await fetchPushNotificationConfig();
  } catch {
    throw reRegistrationError("PUSH_REREGISTER_CONFIG_FAILED");
  }

  if (!config.enabled || !config.publicKey) {
    throw reRegistrationError("PUSH_REREGISTER_CONFIG_FAILED");
  }

  let subscription;

  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  } catch {
    throw reRegistrationError("PUSH_REREGISTER_SUBSCRIBE_FAILED");
  }

  try {
    await postPushSubscription({
      accessToken,
      endpoint: PUSH_SUBSCRIPTION_REGISTER_ENDPOINT,
      errorPrefix: "push-subscription-reregister-register",
      subscription,
    });
  } catch {
    throw reRegistrationError("PUSH_REREGISTER_REGISTER_FAILED");
  }

  let registrationStatus;

  try {
    registrationStatus = await getPushSubscriptionRegistrationStatus({ accessToken });
  } catch {
    throw reRegistrationError("PUSH_REREGISTER_STATUS_FAILED");
  }

  if (registrationStatus.status !== "registered") {
    throw reRegistrationError("PUSH_REREGISTER_STATUS_FAILED");
  }

  return { status: "registered" };
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

  const registration = await getReadyPushNotificationServiceWorker();
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    throw new Error("push-subscription-reregister-required");
  }

  const config = await fetchPushNotificationConfig();

  if (!config.enabled || !config.publicKey) {
    throw new Error("push-vapid-key-missing");
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey),
  });

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

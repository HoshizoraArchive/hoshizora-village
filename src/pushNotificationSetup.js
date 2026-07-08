const SERVICE_WORKER_PATH = "/sw.js";
const PUSH_CONFIG_ENDPOINT = "/api/push-config";
const PUSH_SUBSCRIPTION_REGISTER_ENDPOINT = "/api/push-subscription-register";
const TEST_NOTIFICATION_OPTIONS = {
  body: "R.Connect通知のテストです。",
  icon: "/images/icons/hoshizora-village-icon-192.png",
  badge: "/images/icons/favicon-32.png",
  data: { url: "/" },
};

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

export async function requestPushNotificationPermission() {
  if (!isPushNotificationSupported()) {
    return "unsupported";
  }

  await registerPushNotificationServiceWorker();
  return Notification.requestPermission();
}

export async function sendPushNotificationTest() {
  if (!isPushNotificationSupported()) {
    throw new Error("push-notification-unsupported");
  }

  if (Notification.permission !== "granted") {
    throw new Error("push-notification-permission-required");
  }

  const registration = await registerPushNotificationServiceWorker();
  await registration.showNotification("星空Village", TEST_NOTIFICATION_OPTIONS);
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

  const registration = await registerPushNotificationServiceWorker();
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    }));

  const response = await fetch(PUSH_SUBSCRIPTION_REGISTER_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizeSubscriptionPayload(subscription)),
  });

  if (!response.ok) {
    throw new Error("push-subscription-register-failed");
  }

  return {
    status: "registered",
  };
}

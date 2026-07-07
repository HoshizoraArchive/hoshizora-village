const SERVICE_WORKER_PATH = "/sw.js";
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

import { createECDH, timingSafeEqual } from "node:crypto";
import {
  getAllowedPushServiceKind,
  isAllowedPushServiceEndpoint,
} from "./pushEndpointSecurity.mjs";
import { pushHttpError, readEnv, readVapidPublicKey } from "./pushNotifications.mjs";

export const PUSH_DELIVERY_BATCH_SIZE = 20;
export const PUSH_DEFAULT_SUBJECT = "https://hoshizora-village.netlify.app";
export const PUSH_DEFAULT_ICON = "/images/icons/hoshizora-village-icon-192.png";
export const PUSH_DEFAULT_BADGE = "/images/icons/favicon-32.png";

const FALLBACK_BODY_BY_TYPE = {
  resonance: "共鳴が届きました。",
  archive: "Archiveに追加されました。",
  star_letter: "星文が届きました。",
  star_letter_reply: "星文に返信が届きました。",
  star_letter_resonance: "星文に共鳴が届きました。",
  content_report: "観測局に新しい異常が届きました",
  chia_post: "星空ちあが流星便を放流しました。",
  ai_resident_mention: "AI住人が、あなたのことを話してるよ！🌟",
};

export function readPushDeliveryConfig() {
  const vapidPublicKey = readVapidPublicKey();
  const vapidPrivateKey = readEnv("PUSH_VAPID_PRIVATE_KEY").trim();
  const vapidSubject = readEnv("PUSH_VAPID_SUBJECT").trim() || PUSH_DEFAULT_SUBJECT;

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw pushHttpError(503, "PUSH_DELIVERY_CONFIGURATION_ERROR", "スマホ通知配信は現在利用できません。");
  }

  assertVapidKeyPair(vapidPublicKey, vapidPrivateKey);

  return {
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  };
}

function decodeVapidKey(value, expectedLength) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedLength ? decoded : null;
}

export function assertVapidKeyPair(vapidPublicKey, vapidPrivateKey) {
  try {
    const publicKey = decodeVapidKey(vapidPublicKey, 65);
    const privateKey = decodeVapidKey(vapidPrivateKey, 32);

    if (!publicKey || !privateKey || publicKey[0] !== 4) {
      throw new Error("invalid_vapid_key");
    }

    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateKey);
    const derivedPublicKey = ecdh.getPublicKey(undefined, "uncompressed");

    if (derivedPublicKey.length !== publicKey.length || !timingSafeEqual(derivedPublicKey, publicKey)) {
      throw new Error("vapid_key_mismatch");
    }
  } catch {
    throw pushHttpError(503, "PUSH_VAPID_KEY_MISMATCH", "通知配信用の公開鍵と秘密鍵が一致していません。");
  }
}

export function configureWebPush(webPushClient, config) {
  webPushClient.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

function normalizeNotificationMessage(notification) {
  if (typeof notification?.message === "string") {
    const trimmed = notification.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

    if (trimmed) {
      return trimmed.slice(0, 160);
    }
  }

  return FALLBACK_BODY_BY_TYPE[notification?.type] ?? "Re:Connectに新しい通知があります。";
}

export function buildPushPayload(notification) {
  const notificationId = notification?.id ?? null;
  const postId = notification?.post_id ?? null;
  const type = notification?.type ?? "notification";
  const isChiaPost = type === "chia_post" && Boolean(postId);
  const isAiResidentMention = type === "ai_resident_mention" && Boolean(postId);
  const opensMeteor = isChiaPost || isAiResidentMention;
  const url = opensMeteor ? `/meteor/${encodeURIComponent(postId)}` : "/";

  return JSON.stringify({
    title: isChiaPost ? "星空ちあから流星便 ✨" : "星空Village",
    body: normalizeNotificationMessage(notification),
    icon: PUSH_DEFAULT_ICON,
    badge: PUSH_DEFAULT_BADGE,
    url,
    data: {
      url,
      notificationId,
      postId,
      type,
    },
    notificationId,
    postId,
    type,
  });
}

export function toWebPushSubscription(subscription) {
  if (!isAllowedPushServiceEndpoint(subscription?.endpoint)) {
    const error = new Error("Push endpoint is not an allowed Web Push service.");
    error.code = "PUSH_ENDPOINT_NOT_ALLOWED";
    error.statusCode = 400;
    throw error;
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };
}

export function getPushErrorStatus(error) {
  const status = error?.statusCode ?? error?.status;
  return Number.isInteger(status) ? status : null;
}

export function isGonePushSubscriptionError(error) {
  const status = getPushErrorStatus(error);
  return status === 404 || status === 410;
}

export function isTransientPushError(error) {
  const status = getPushErrorStatus(error);
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function getPushErrorCode(error) {
  if (error?.code === "PUSH_ENDPOINT_NOT_ALLOWED") {
    return "PUSH_ENDPOINT_NOT_ALLOWED";
  }

  if (isGonePushSubscriptionError(error)) {
    return "PUSH_SUBSCRIPTION_GONE";
  }

  const status = getPushErrorStatus(error);

  if (status === 401 || status === 403) {
    return "PUSH_AUTH_FAILED";
  }

  if (isTransientPushError(error)) {
    return "PUSH_SEND_TEMPORARY_FAILURE";
  }

  return "PUSH_SEND_FAILED";
}

function getPushServiceKind(endpoint) {
  return getAllowedPushServiceKind(endpoint) ?? "other";
}

export function logPushDeliveryFailure({ code, error, endpoint }) {
  console.warn("Hoshizora Push delivery event", {
    code,
    statusCode: getPushErrorStatus(error),
    deployContext: readEnv("CONTEXT").trim() || "unknown",
    pushService: getPushServiceKind(endpoint),
  });
}

export function getNextAttemptAt(attemptCount, now = new Date()) {
  const safeAttempt = Number.isSafeInteger(attemptCount) && attemptCount > 0 ? attemptCount : 1;
  const delaySeconds = Math.min(300, 30 * 2 ** Math.max(0, safeAttempt - 1));
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

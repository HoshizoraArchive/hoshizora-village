import { isAllowedPushServiceEndpoint } from "./pushEndpointSecurity.mjs";

const MAX_JSON_BODY_BYTES = 8192;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_P256DH_LENGTH = 512;
const MAX_AUTH_LENGTH = 256;
const MAX_USER_AGENT_LENGTH = 512;

export class PushHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PushHttpError";
    this.status = status;
    this.code = code;
  }
}

export function pushHttpError(status, code, message) {
  return new PushHttpError(status, code, message);
}

export function pushJsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function pushErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === "string" ? error.code : "PUSH_INTERNAL_ERROR";
  const message =
    typeof error?.message === "string"
      ? error.message
      : "スマホ通知の準備に失敗しました。時間をおいてもう一度お試しください。";

  return pushJsonResponse(status, {
    error: {
      code,
      message,
    },
  });
}

export function readEnv(name) {
  const env = globalThis.Netlify?.env ?? process.env;

  if (env && typeof env.get === "function") {
    return env.get(name) ?? "";
  }

  return env?.[name] ?? "";
}

export function readPushSupabaseConfig() {
  const supabaseUrl = readEnv("SUPABASE_URL").trim();
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY").trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw pushHttpError(503, "PUSH_CONFIGURATION_ERROR", "スマホ通知登録は現在利用できません。");
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}

export function readVapidPublicKey() {
  return readEnv("PUSH_VAPID_PUBLIC_KEY").trim();
}

export function normalizeUserAgent(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, MAX_USER_AGENT_LENGTH);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertAllowedKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw pushHttpError(400, "PUSH_BAD_REQUEST", `${label}の形式が正しくありません。`);
    }
  }
}

function validateEndpoint(endpoint) {
  if (typeof endpoint !== "string") {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "Push subscriptionの形式が正しくありません。");
  }

  const trimmed = endpoint.trim();

  if (!trimmed || trimmed !== endpoint || trimmed.length > MAX_ENDPOINT_LENGTH || !trimmed.startsWith("https://")) {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "Push subscriptionの形式が正しくありません。");
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "https:" || !parsed.hostname) {
      throw new Error("invalid_endpoint");
    }
  } catch {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "Push subscriptionの形式が正しくありません。");
  }

  return trimmed;
}

function validateKey(value, maxLength) {
  if (typeof value !== "string") {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "Push subscriptionの鍵形式が正しくありません。");
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed !== value || trimmed.length > maxLength) {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "Push subscriptionの鍵形式が正しくありません。");
  }

  return trimmed;
}

export async function readPushSubscriptionPayload(
  request,
  { requireTrustedEndpoint = false } = {},
) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw pushHttpError(415, "PUSH_UNSUPPORTED_CONTENT_TYPE", "対応していないリクエスト形式です。");
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_JSON_BODY_BYTES) {
    throw pushHttpError(413, "PUSH_CONTENT_TOO_LARGE", "リクエストが大きすぎます。");
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw pushHttpError(400, "PUSH_BAD_JSON", "リクエスト形式が正しくありません。");
  }

  if (!isPlainObject(payload)) {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "リクエスト内容が正しくありません。");
  }

  assertAllowedKeys(payload, ["subscription"], "リクエスト");

  const { subscription } = payload;

  if (!isPlainObject(subscription)) {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "Push subscriptionの形式が正しくありません。");
  }

  assertAllowedKeys(subscription, ["endpoint", "keys"], "Push subscription");

  if (!isPlainObject(subscription.keys)) {
    throw pushHttpError(400, "PUSH_BAD_REQUEST", "Push subscriptionの鍵形式が正しくありません。");
  }

  assertAllowedKeys(subscription.keys, ["p256dh", "auth"], "Push subscription keys");

  const endpoint = validateEndpoint(subscription.endpoint);

  if (requireTrustedEndpoint && !isAllowedPushServiceEndpoint(endpoint)) {
    throw pushHttpError(
      400,
      "PUSH_ENDPOINT_NOT_ALLOWED",
      "この端末の通知サービスには対応していません。",
    );
  }

  return {
    endpoint,
    p256dh: validateKey(subscription.keys.p256dh, MAX_P256DH_LENGTH),
    auth: validateKey(subscription.keys.auth, MAX_AUTH_LENGTH),
  };
}

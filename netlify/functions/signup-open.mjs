import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

const PRODUCTION_CONTEXT = "production";
const PRODUCTION_SUPABASE_URL = "https://dhfecpymvmursozfgjlr.supabase.co";
const SIGNUP_OPEN_PAYLOAD_KEYS = new Set([
  "appMode",
  "clientOpenedAt",
  "platform",
  "visitorId",
]);
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function emptyResponse(status) {
  return new Response(null, { status });
}

function isProductionInvocation(context) {
  return (
    context?.deploy?.context === PRODUCTION_CONTEXT &&
    context?.deploy?.published === true
  );
}

export function validateSignupOpenPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const keys = Object.keys(payload);

  if (
    keys.length !== SIGNUP_OPEN_PAYLOAD_KEYS.size ||
    keys.some((key) => !SIGNUP_OPEN_PAYLOAD_KEYS.has(key))
  ) {
    return null;
  }

  const visitorId = String(payload.visitorId ?? "").trim().toLowerCase();
  const appMode = String(payload.appMode ?? "").trim();
  const platform = String(payload.platform ?? "").trim();
  const clientOpenedAt = String(payload.clientOpenedAt ?? "").trim();
  const parsedClientOpenedAt = Date.parse(clientOpenedAt);

  if (
    !UUID_V4_PATTERN.test(visitorId) ||
    !["standalone", "browser"].includes(appMode) ||
    !["ios", "android", "desktop", "other"].includes(platform) ||
    clientOpenedAt.length > 64 ||
    !Number.isFinite(parsedClientOpenedAt)
  ) {
    return null;
  }

  return {
    p_visitor_id: visitorId,
    p_app_mode: appMode,
    p_platform: platform,
    p_client_opened_at: new Date(parsedClientOpenedAt).toISOString(),
  };
}

export async function handleSignupOpen(
  request,
  context,
  { createClient = createSupabaseAdminClient, readEnv } = {},
) {
  if (request.method !== "POST") {
    return emptyResponse(405);
  }

  if (!isProductionInvocation(context)) {
    return emptyResponse(204);
  }

  let payload;

  try {
    payload = validateSignupOpenPayload(await request.json());
  } catch {
    return emptyResponse(400);
  }

  if (!payload) {
    return emptyResponse(400);
  }

  const supabaseUrl = String(readEnv?.("SUPABASE_URL") ?? "").trim();
  const supabaseServiceRoleKey = String(
    readEnv?.("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();

  if (supabaseUrl !== PRODUCTION_SUPABASE_URL || !supabaseServiceRoleKey) {
    return emptyResponse(503);
  }

  let error;

  try {
    const supabase = createClient({
      supabaseUrl,
      supabaseServiceRoleKey,
    });
    ({ error } = await supabase.rpc("record_signup_open", payload));
  } catch {
    return emptyResponse(503);
  }

  return emptyResponse(error ? 503 : 204);
}

export default async function handler(request, context) {
  return handleSignupOpen(request, context, {
    readEnv: (name) => Netlify.env.get(name),
  });
}

export const config = {
  path: "/api/signup-open",
  method: ["POST"],
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowLimit: 5,
    windowSize: 60,
  },
};

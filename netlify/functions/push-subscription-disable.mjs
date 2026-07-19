import { requireAuthenticatedUser } from "./_shared/aiAuth.mjs";
import { AiHttpError } from "./_shared/aiErrors.mjs";
import { disablePushSubscription } from "./_shared/pushSubscriptionDisable.mjs";
import {
  PushHttpError,
  pushErrorResponse,
  pushHttpError,
  pushJsonResponse,
  readPushSubscriptionPayload,
  readPushSupabaseConfig,
} from "./_shared/pushNotifications.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";

function toSafeError(error) {
  if (error instanceof PushHttpError) {
    return error;
  }

  if (error instanceof AiHttpError) {
    if (error.status === 401) {
      return pushHttpError(401, "INVALID_TOKEN", "ログイン情報を確認できませんでした。");
    }

    return pushHttpError(error.status, error.code, error.message);
  }

  return pushHttpError(503, "PUSH_REREGISTER_DISABLE_FAILED", "通知端末の再登録を開始できませんでした。");
}

function logSafeDisableFailure(error) {
  const code = typeof error?.code === "string" ? error.code : "PUSH_REREGISTER_DISABLE_FAILED";
  const stage = typeof error?.safeLogStage === "string" ? error.safeLogStage : "unknown";
  const status = Number.isInteger(error?.status) ? error.status : 503;
  const databaseCode = typeof error?.safeLogDatabaseCode === "string" ? error.safeLogDatabaseCode : "unknown";

  console.error(JSON.stringify({ event: "push_subscription_disable_failed", code, stage, status, databaseCode }));
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      throw pushHttpError(405, "METHOD_NOT_ALLOWED", "この操作は許可されていません。");
    }

    const config = readPushSupabaseConfig();
    const supabase = createSupabaseAdminClient(config);
    const user = await requireAuthenticatedUser({ request, supabase });
    const subscription = await readPushSubscriptionPayload(request);
    await disablePushSubscription({
      profileId: user.id,
      subscription,
      supabase,
    });

    return pushJsonResponse(200, { status: "disabled" });
  } catch (error) {
    const safeError = toSafeError(error);

    if (safeError.code === "PUSH_REREGISTER_DISABLE_FAILED") {
      logSafeDisableFailure(error);
    }

    return pushErrorResponse(safeError);
  }
}

export const config = {
  path: "/api/push-subscription-disable",
  method: ["POST"],
};

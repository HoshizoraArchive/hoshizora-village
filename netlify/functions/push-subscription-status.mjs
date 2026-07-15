import { requireAuthenticatedUser } from "./_shared/aiAuth.mjs";
import { AiHttpError } from "./_shared/aiErrors.mjs";
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

  return pushHttpError(503, "PUSH_STATUS_FAILED", "端末登録状態を確認できませんでした。時間をおいてもう一度お試しください。");
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
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("profile_id, disabled_at")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (error) {
      throw pushHttpError(503, "PUSH_STATUS_FAILED", "端末登録状態を確認できませんでした。時間をおいてもう一度お試しください。");
    }

    const belongsToCurrentUser = data?.profile_id === user.id;

    return pushJsonResponse(200, {
      canRegister: !data || belongsToCurrentUser,
      status: belongsToCurrentUser && data.disabled_at === null ? "registered" : "unregistered",
    });
  } catch (error) {
    return pushErrorResponse(toSafeError(error));
  }
}

export const config = {
  path: "/api/push-subscription-status",
  method: ["POST"],
};

import { requireAuthenticatedUser } from "./_shared/aiAuth.mjs";
import { AiHttpError } from "./_shared/aiErrors.mjs";
import {
  PushHttpError,
  normalizeUserAgent,
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

  if (error instanceof Error && error.message.startsWith("invalid_env:")) {
    return pushHttpError(503, "PUSH_CONFIGURATION_ERROR", "スマホ通知登録は現在利用できません。");
  }

  return pushHttpError(503, "PUSH_INTERNAL_ERROR", "スマホ通知登録に失敗しました。時間をおいてもう一度お試しください。");
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      throw pushHttpError(405, "METHOD_NOT_ALLOWED", "この操作は許可されていません。");
    }

    const config = readPushSupabaseConfig();
    const supabase = createSupabaseAdminClient(config);
    const user = await requireAuthenticatedUser({ request, supabase });
    const subscription = await readPushSubscriptionPayload(request, {
      requireTrustedEndpoint: true,
    });
    const now = new Date().toISOString();
    const userAgent = normalizeUserAgent(request.headers.get("user-agent") ?? "");

    const { data: existingSubscription, error: existingSubscriptionError } = await supabase
      .from("push_subscriptions")
      .select("profile_id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (existingSubscriptionError) {
      throw pushHttpError(503, "PUSH_REGISTER_FAILED", "スマホ通知登録に失敗しました。時間をおいてもう一度お試しください。");
    }

    if (existingSubscription && existingSubscription.profile_id !== user.id) {
      throw pushHttpError(409, "PUSH_SUBSCRIPTION_ACCOUNT_MISMATCH", "この端末は別のアカウントに登録されています。");
    }

    const values = {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      user_agent: userAgent,
      updated_at: now,
      last_seen_at: now,
      disabled_at: null,
    };
    const { error } = existingSubscription
      ? await supabase
          .from("push_subscriptions")
          .update(values)
          .eq("endpoint", subscription.endpoint)
          .eq("profile_id", user.id)
      : await supabase.from("push_subscriptions").insert({
          ...values,
          profile_id: user.id,
          endpoint: subscription.endpoint,
        });

    if (error) {
      throw pushHttpError(503, "PUSH_REGISTER_FAILED", "スマホ通知登録に失敗しました。時間をおいてもう一度お試しください。");
    }

    return pushJsonResponse(200, {
      status: "registered",
    });
  } catch (error) {
    return pushErrorResponse(toSafeError(error));
  }
}

export const config = {
  path: "/api/push-subscription-register",
  method: ["POST"],
};

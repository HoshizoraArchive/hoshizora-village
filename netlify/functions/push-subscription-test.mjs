import webPush from "web-push";
import { requireAuthenticatedUser } from "./_shared/aiAuth.mjs";
import { AiHttpError } from "./_shared/aiErrors.mjs";
import { configureWebPush, readPushDeliveryConfig } from "./_shared/pushDelivery.mjs";
import { sendPushSubscriptionTest } from "./_shared/pushSubscriptionTest.mjs";
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

  if (error instanceof Error && error.message.startsWith("invalid_env:")) {
    return pushHttpError(503, "PUSH_DELIVERY_CONFIGURATION_ERROR", "スマホ通知配信は現在利用できません。");
  }

  return pushHttpError(503, "PUSH_TEST_DELIVERY_FAILED", "テスト通知を送信できませんでした。");
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      throw pushHttpError(405, "METHOD_NOT_ALLOWED", "この操作は許可されていません。");
    }

    const config = {
      ...readPushSupabaseConfig(),
      ...readPushDeliveryConfig(),
    };
    const supabase = createSupabaseAdminClient(config);
    const user = await requireAuthenticatedUser({ request, supabase });
    const subscription = await readPushSubscriptionPayload(request);

    configureWebPush(webPush, config);
    await sendPushSubscriptionTest({
      profileId: user.id,
      subscription,
      supabase,
      webPushClient: webPush,
    });

    return pushJsonResponse(200, { status: "sent" });
  } catch (error) {
    return pushErrorResponse(toSafeError(error));
  }
}

export const config = {
  path: "/api/push-subscription-test",
  method: ["POST"],
};

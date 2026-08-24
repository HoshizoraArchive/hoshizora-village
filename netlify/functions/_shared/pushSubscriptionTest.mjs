import {
  PUSH_DEFAULT_BADGE,
  PUSH_DEFAULT_ICON,
  getPushErrorCode,
  isGonePushSubscriptionError,
  logPushDeliveryFailure,
  toWebPushSubscription,
} from "./pushDelivery.mjs";
import { pushHttpError } from "./pushNotifications.mjs";

export function buildPushSubscriptionTestPayload() {
  return JSON.stringify({
    title: "星空ちあ",
    body: "おはちあ！ 星空Villageの通知が届いたよ💕",
    icon: PUSH_DEFAULT_ICON,
    badge: PUSH_DEFAULT_BADGE,
    data: {
      url: "/",
      type: "push_test",
    },
  });
}

export async function sendPushSubscriptionTest({ profileId, subscription, supabase, webPushClient }) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId)
    .eq("endpoint", subscription.endpoint)
    .eq("p256dh", subscription.p256dh)
    .eq("auth", subscription.auth)
    .is("disabled_at", null)
    .maybeSingle();

  if (error) {
    throw pushHttpError(503, "PUSH_TEST_LOOKUP_FAILED", "テスト通知の送信先を確認できませんでした。");
  }

  if (!data) {
    throw pushHttpError(409, "PUSH_SUBSCRIPTION_NOT_REGISTERED", "この端末は現在のアカウントに登録されていません。");
  }

  const { data: reserved, error: reserveError } = await supabase.rpc(
    "reserve_push_subscription_test_v1",
    { p_profile_id: profileId },
  );

  if (reserveError) {
    if (
      reserveError.code === "P0001" &&
      String(reserveError.message ?? "").includes("push test rate limit exceeded")
    ) {
      throw pushHttpError(429, "PUSH_TEST_RATE_LIMITED", "テスト通知は1時間に5回まで送れます。時間をおいてもう一度お試しください。");
    }

    throw pushHttpError(503, "PUSH_TEST_RESERVATION_FAILED", "テスト通知の送信準備に失敗しました。");
  }

  if (reserved !== true) {
    throw pushHttpError(503, "PUSH_TEST_RESERVATION_FAILED", "テスト通知の送信準備に失敗しました。");
  }

  try {
    await webPushClient.sendNotification(toWebPushSubscription(data), buildPushSubscriptionTestPayload());
  } catch (error) {
    const errorCode = getPushErrorCode(error);
    logPushDeliveryFailure({
      code: errorCode,
      error,
      endpoint: data.endpoint,
    });

    if (isGonePushSubscriptionError(error)) {
      const now = new Date().toISOString();
      const { error: disableError } = await supabase
        .from("push_subscriptions")
        .update({
          disabled_at: now,
          updated_at: now,
        })
        .eq("id", data.id)
        .eq("profile_id", profileId);

      if (disableError) {
        throw pushHttpError(503, "PUSH_TEST_DELIVERY_FAILED", "テスト通知を送信できませんでした。");
      }

      throw pushHttpError(410, "PUSH_SUBSCRIPTION_GONE", "この端末の通知登録は無効になりました。もう一度登録してください。");
    }

    if (errorCode === "PUSH_AUTH_FAILED") {
      throw pushHttpError(502, errorCode, "通知サービスの認証に失敗しました。");
    }

    if (errorCode === "PUSH_SEND_TEMPORARY_FAILURE") {
      throw pushHttpError(503, errorCode, "通知サービスが一時的に利用できません。");
    }

    throw pushHttpError(502, errorCode, "テスト通知を送信できませんでした。");
  }
}

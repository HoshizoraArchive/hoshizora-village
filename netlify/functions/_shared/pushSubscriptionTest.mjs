import {
  PUSH_DEFAULT_BADGE,
  PUSH_DEFAULT_ICON,
  isGonePushSubscriptionError,
  toWebPushSubscription,
} from "./pushDelivery.mjs";
import { pushHttpError } from "./pushNotifications.mjs";

export function buildPushSubscriptionTestPayload() {
  return JSON.stringify({
    title: "星空Village",
    body: "R.Connect通知のテストです。",
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

  try {
    await webPushClient.sendNotification(toWebPushSubscription(data), buildPushSubscriptionTestPayload());
  } catch (error) {
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

    throw pushHttpError(503, "PUSH_TEST_DELIVERY_FAILED", "テスト通知を送信できませんでした。");
  }
}

import { pushHttpError } from "./pushNotifications.mjs";

export async function transferPushSubscription({ profileId, subscription, supabase, now = new Date().toISOString() }) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .update({
      profile_id: profileId,
      disabled_at: null,
      updated_at: now,
      last_seen_at: now,
    })
    .eq("endpoint", subscription.endpoint)
    .eq("p256dh", subscription.p256dh)
    .eq("auth", subscription.auth)
    .neq("profile_id", profileId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw pushHttpError(503, "PUSH_TRANSFER_FAILED", "端末の通知先を切り替えられませんでした。時間をおいてもう一度お試しください。");
  }

  if (!data) {
    throw pushHttpError(409, "PUSH_SUBSCRIPTION_MISMATCH", "この端末の通知登録を確認できませんでした。画面を開き直してもう一度お試しください。");
  }

  return data;
}

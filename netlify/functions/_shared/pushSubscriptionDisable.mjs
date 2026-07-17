import { pushHttpError } from "./pushNotifications.mjs";

export async function disablePushSubscription({ profileId, subscription, supabase, now = new Date().toISOString() }) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .update({
      disabled_at: now,
    })
    .eq("profile_id", profileId)
    .eq("endpoint", subscription.endpoint)
    .eq("p256dh", subscription.p256dh)
    .eq("auth", subscription.auth)
    .select("id")
    .maybeSingle();

  if (error) {
    throw pushHttpError(503, "PUSH_REREGISTER_DISABLE_FAILED", "通知端末の再登録を開始できませんでした。");
  }

  if (data) {
    return { status: "disabled" };
  }

  const { data: existingEndpoint, error: existingEndpointError } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();

  if (existingEndpointError) {
    throw pushHttpError(503, "PUSH_REREGISTER_DISABLE_FAILED", "通知端末の再登録を開始できませんでした。");
  }

  if (existingEndpoint) {
    throw pushHttpError(409, "PUSH_SUBSCRIPTION_NOT_OWNED", "この端末の通知登録を確認できませんでした。");
  }

  return { status: "not_registered" };
}

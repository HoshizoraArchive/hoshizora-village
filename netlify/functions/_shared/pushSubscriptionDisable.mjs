import { pushHttpError } from "./pushNotifications.mjs";

function safeDatabaseCode(error) {
  const code = typeof error?.code === "string" ? error.code : "";

  return /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : "unknown";
}

function disableFailure(stage, databaseError) {
  const error = pushHttpError(503, "PUSH_REREGISTER_DISABLE_FAILED", "通知端末の再登録を開始できませんでした。");
  error.safeLogStage = stage;
  error.safeLogDatabaseCode = safeDatabaseCode(databaseError);
  return error;
}

export async function disablePushSubscription({ profileId, subscription, supabase, now = new Date().toISOString() }) {
  const { data: disabledRecords, error } = await supabase
    .from("push_subscriptions")
    .update({
      disabled_at: now,
    })
    .eq("profile_id", profileId)
    .eq("endpoint", subscription.endpoint)
    .eq("p256dh", subscription.p256dh)
    .eq("auth", subscription.auth)
    .select("id");

  if (error) {
    throw disableFailure("update", error);
  }

  if (Array.isArray(disabledRecords) && disabledRecords.length > 0) {
    return { status: "disabled" };
  }

  const { data: existingEndpointRecords, error: existingEndpointError } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", subscription.endpoint)
    .limit(1);

  if (existingEndpointError) {
    throw disableFailure("endpoint_lookup", existingEndpointError);
  }

  if (Array.isArray(existingEndpointRecords) && existingEndpointRecords.length > 0) {
    throw pushHttpError(409, "PUSH_SUBSCRIPTION_NOT_OWNED", "この端末の通知登録を確認できませんでした。");
  }

  return { status: "not_registered" };
}

import webPush from "web-push";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";
import {
  PUSH_DELIVERY_BATCH_SIZE,
  buildPushPayload,
  configureWebPush,
  getNextAttemptAt,
  getPushErrorCode,
  isGonePushSubscriptionError,
  isTransientPushError,
  logPushDeliveryFailure,
  readPushDeliveryConfig,
  toWebPushSubscription,
} from "./_shared/pushDelivery.mjs";
import { PushHttpError, pushErrorResponse, pushHttpError, pushJsonResponse, readPushSupabaseConfig } from "./_shared/pushNotifications.mjs";

function toSafeError(error) {
  if (error instanceof PushHttpError) {
    return error;
  }

  if (error instanceof Error && error.message.startsWith("invalid_env:")) {
    return pushHttpError(503, "PUSH_DELIVERY_CONFIGURATION_ERROR", "スマホ通知配信は現在利用できません。");
  }

  return pushHttpError(503, "PUSH_DELIVERY_INTERNAL_ERROR", "スマホ通知配信に失敗しました。");
}

async function claimPushNotificationJobs(supabase) {
  const { data, error } = await supabase.rpc("claim_push_notification_jobs", {
    p_limit: PUSH_DELIVERY_BATCH_SIZE,
  });

  if (error) {
    throw pushHttpError(503, "PUSH_JOB_CLAIM_FAILED", "スマホ通知配信に失敗しました。");
  }

  return Array.isArray(data) ? data : [];
}

async function updatePushJob(supabase, jobId, values) {
  const { error } = await supabase.from("push_notification_jobs").update(values).eq("id", jobId);

  if (error) {
    throw pushHttpError(503, "PUSH_JOB_UPDATE_FAILED", "スマホ通知配信に失敗しました。");
  }
}

async function fetchNotification(supabase, notificationId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, actor_id, post_id, type, message, created_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    throw pushHttpError(503, "PUSH_NOTIFICATION_FETCH_FAILED", "スマホ通知配信に失敗しました。");
  }

  return data;
}

async function fetchRecipientSubscriptions(supabase, recipientId) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", recipientId)
    .is("disabled_at", null);

  if (error) {
    throw pushHttpError(503, "PUSH_SUBSCRIPTIONS_FETCH_FAILED", "スマホ通知配信に失敗しました。");
  }

  return Array.isArray(data) ? data : [];
}

async function isNotificationBlackHoled(supabase, notification) {
  if (!notification.actor_id) {
    return false;
  }

  const { data, error } = await supabase.rpc("is_notification_black_holed", {
    p_actor_id: notification.actor_id,
    p_recipient_id: notification.recipient_id,
  });

  if (error) {
    throw pushHttpError(
      503,
      "PUSH_BLACK_HOLE_CHECK_FAILED",
      "スマホ通知配信に失敗しました。",
    );
  }

  return data === true;
}

async function disableSubscription(supabase, subscriptionId, nowIso) {
  await supabase
    .from("push_subscriptions")
    .update({
      disabled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", subscriptionId);
}

async function markCompleted(supabase, jobId, status, lastErrorCode = null) {
  await updatePushJob(supabase, jobId, {
    status,
    last_error_code: lastErrorCode,
    completed_at: new Date().toISOString(),
  });
}

async function markRetryOrFailed(supabase, job, errorCode) {
  const exhausted = job.attempt_count >= job.max_attempts;

  if (exhausted) {
    await markCompleted(supabase, job.id, "failed", errorCode);
    return "failed";
  }

  await updatePushJob(supabase, job.id, {
    status: "queued",
    last_error_code: errorCode,
    next_attempt_at: getNextAttemptAt(job.attempt_count),
    completed_at: null,
  });

  return "queued";
}

export async function processPushNotificationJob({ supabase, webPushClient, job }) {
  const notification = await fetchNotification(supabase, job.notification_id);

  if (!notification || notification.recipient_id !== job.recipient_id) {
    await markCompleted(supabase, job.id, "skipped", "PUSH_NOTIFICATION_NOT_FOUND");
    return { status: "skipped", sent: 0, disabled: 0 };
  }

  if (await isNotificationBlackHoled(supabase, notification)) {
    await markCompleted(supabase, job.id, "skipped", "BLACK_HOLE");
    return { status: "skipped", sent: 0, disabled: 0 };
  }

  const subscriptions = await fetchRecipientSubscriptions(supabase, job.recipient_id);

  if (subscriptions.length === 0) {
    await markCompleted(supabase, job.id, "skipped", "NO_ACTIVE_SUBSCRIPTIONS");
    return { status: "skipped", sent: 0, disabled: 0 };
  }

  const payload = buildPushPayload(notification);
  const nowIso = new Date().toISOString();
  let sent = 0;
  let disabled = 0;
  let retryableError = null;
  let permanentError = null;

  for (const subscription of subscriptions) {
    try {
      await webPushClient.sendNotification(toWebPushSubscription(subscription), payload);
      sent += 1;
    } catch (error) {
      logPushDeliveryFailure({
        code: getPushErrorCode(error),
        error,
        endpoint: subscription.endpoint,
      });

      if (isGonePushSubscriptionError(error)) {
        disabled += 1;
        await disableSubscription(supabase, subscription.id, nowIso);
        continue;
      }

      if (isTransientPushError(error)) {
        retryableError ??= error;
        continue;
      }

      permanentError ??= error;
    }
  }

  if (sent > 0) {
    await markCompleted(supabase, job.id, "succeeded");
    return { status: "succeeded", sent, disabled };
  }

  if (disabled === subscriptions.length) {
    await markCompleted(supabase, job.id, "skipped", "NO_ACTIVE_SUBSCRIPTIONS");
    return { status: "skipped", sent, disabled };
  }

  const errorCode = getPushErrorCode(retryableError ?? permanentError);
  const status = retryableError ? await markRetryOrFailed(supabase, job, errorCode) : "failed";

  if (!retryableError) {
    await markCompleted(supabase, job.id, "failed", errorCode);
  }

  return { status, sent, disabled };
}

export default async function handler() {
  try {
    const config = {
      ...readPushSupabaseConfig(),
      ...readPushDeliveryConfig(),
    };
    const supabase = createSupabaseAdminClient(config);

    configureWebPush(webPush, config);

    const jobs = await claimPushNotificationJobs(supabase);
    const summary = {
      claimed: jobs.length,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      queued: 0,
      sent: 0,
      disabled: 0,
    };

    for (const job of jobs) {
      try {
        const result = await processPushNotificationJob({
          supabase,
          webPushClient: webPush,
          job,
        });

        summary[result.status] = (summary[result.status] ?? 0) + 1;
        summary.sent += result.sent;
        summary.disabled += result.disabled;
      } catch (error) {
        const errorCode = error instanceof PushHttpError ? error.code : "PUSH_DELIVERY_INTERNAL_ERROR";
        const status = await markRetryOrFailed(supabase, job, errorCode);
        summary[status] = (summary[status] ?? 0) + 1;
      }
    }

    return pushJsonResponse(200, {
      status: "ok",
      ...summary,
    });
  } catch (error) {
    return pushErrorResponse(toSafeError(error));
  }
}

export const config = {
  schedule: "*/1 * * * *",
};

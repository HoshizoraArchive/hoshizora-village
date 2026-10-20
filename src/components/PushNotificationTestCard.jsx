// User-facing push registration and diagnostic controls.
import { useEffect, useState } from "react";
import { getPushNotificationPermission, getPushNotificationPermissionLabel, getPushSubscriptionRegistrationStatus, isPushNotificationSupported, isPushSubscriptionSupported, reRegisterPushNotifications, requestPushNotificationPermission, sendPushNotificationTest, subscribeToPushNotifications, transferPushSubscriptionToCurrentAccount } from "../pushNotificationSetup";

export const PUSH_SUBSCRIPTION_STATUS_LABELS = {
  checking: "端末登録: 確認中",
  unregistered: "端末登録: 未登録",
  registered: "端末登録: 登録済み",
  account_mismatch: "端末登録: 別のアカウントに登録済み",
  failed: "端末登録: 登録に失敗しました",
  configMissing: "端末登録: VAPID key未設定",
  unsupported: "端末登録: この表示環境では未対応",
};

export function PushNotificationTestCard({ onboarding, session }) {
  const [permission, setPermission] = useState(() => getPushNotificationPermission());
  const [subscriptionStatus, setSubscriptionStatus] = useState("checking");
  const [subscriptionCheckVersion, setSubscriptionCheckVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState(() =>
    isPushNotificationSupported()
      ? ""
      : "この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。",
  );
  const [isWorking, setIsWorking] = useState(false);
  const isSupported = permission !== "unsupported";
  const isSubscriptionSupported = isPushSubscriptionSupported();
  const permissionLabel = getPushNotificationPermissionLabel(permission);
  const subscriptionLabel = PUSH_SUBSCRIPTION_STATUS_LABELS[subscriptionStatus] ?? PUSH_SUBSCRIPTION_STATUS_LABELS.unregistered;

  useEffect(() => {
    function refreshPermission() {
      setPermission(getPushNotificationPermission());
    }

    refreshPermission();
    window.addEventListener("focus", refreshPermission);

    return () => {
      window.removeEventListener("focus", refreshPermission);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshSubscriptionStatus() {
      setPermission(getPushNotificationPermission());
      setStatusMessage("");

      if (!isPushSubscriptionSupported()) {
        if (!cancelled) {
          setSubscriptionStatus("unsupported");
        }
        return;
      }

      setSubscriptionStatus("checking");

      try {
        const registrationStatus = await getPushSubscriptionRegistrationStatus({
          accessToken: session?.access_token,
        });

        if (!cancelled) {
          setSubscriptionStatus(registrationStatus.status);
          if (registrationStatus.status === "registered") {
            onboarding?.onPushRegistered?.();
          }
          if (registrationStatus.status === "account_mismatch") {
            setStatusMessage("この端末は別のアカウントに通知登録されています");
          } else if (registrationStatus.status === "unregistered" && registrationStatus.hasSubscription) {
            setStatusMessage("この端末には以前の通知購読があります。通知端末を再登録してください。");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSubscriptionStatus("failed");
          const isAccountMismatch = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_ACCOUNT_MISMATCH");
          setStatusMessage(
            isAccountMismatch
              ? "この端末は別のアカウントに登録されています。"
              : "端末登録状態を確認できませんでした。",
          );
        }
      }
    }

    refreshSubscriptionStatus();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, subscriptionCheckVersion]);

  useEffect(() => {
    if (onboarding?.currentStep === "notification_permission") {
      onboarding.onPermissionStatus?.(getPushNotificationPermission());
    }

    if (onboarding?.currentStep === "device_registration" && subscriptionStatus === "registered") {
      onboarding.onPushRegistered?.();
    }
  }, [onboarding?.currentStep, subscriptionStatus]);

  async function handleRequestPermission() {
    if (!isSupported) {
      setStatusMessage("この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
      setPermission(getPushNotificationPermission());
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      const nextPermission = await requestPushNotificationPermission();
      setPermission(getPushNotificationPermission());
      setStatusMessage(nextPermission === "granted" ? "通知を許可しました。" : "通知許可は完了していません。");
      onboarding?.onPermissionStatus?.(nextPermission);
      setSubscriptionCheckVersion((version) => version + 1);
    } catch {
      setPermission(getPushNotificationPermission());
      setStatusMessage("通知許可の準備に失敗しました。");
      onboarding?.onPermissionStatus?.("error");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSendTestNotification() {
    if (!isSupported) {
      setStatusMessage("この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
      setPermission(getPushNotificationPermission());
      return;
    }

    if (getPushNotificationPermission() !== "granted") {
      setPermission(getPushNotificationPermission());
      setStatusMessage("先に通知を許可してください。");
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      const result = await sendPushNotificationTest({ accessToken: session?.access_token });
      setPermission(getPushNotificationPermission());
      setStatusMessage("サーバーからこの端末へテスト通知を送りました。");
      onboarding?.onPushTestResult?.(
        result?.onboardingProgressRecorded === false ? "failed" : "succeeded",
      );
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const isNotRegistered = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_NOT_REGISTERED");
      const isGone = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_GONE");
      const isVapidKeyMismatch = error instanceof Error && error.message.includes("PUSH_VAPID_KEY_MISMATCH");
      const isPushAuthFailed = error instanceof Error && error.message.includes("PUSH_AUTH_FAILED");
      const isPushTemporarilyUnavailable = error instanceof Error && error.message.includes("PUSH_SEND_TEMPORARY_FAILURE");
      setStatusMessage(
        isNotRegistered
          ? "先にこの端末を現在のアカウントへ登録してください。"
          : isGone
            ? "この端末の通知登録が無効になりました。もう一度登録してください。"
            : isVapidKeyMismatch
              ? "通知配信用の公開鍵と秘密鍵が一致していません"
              : isPushAuthFailed
                ? "通知サービスの認証に失敗しました"
                : isPushTemporarilyUnavailable
                  ? "通知サービスが一時的に利用できません"
                  : "サーバーからテスト通知を送信できませんでした。",
      );
      onboarding?.onPushTestResult?.("failed");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRegisterDevice() {
    if (!isSubscriptionSupported) {
      setPermission(getPushNotificationPermission());
      setStatusMessage("この表示環境では端末登録を利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
      onboarding?.onPushRegistrationFailed?.();
      return;
    }

    if (!session?.access_token) {
      setSubscriptionStatus("failed");
      setStatusMessage("ログインすると、この端末をRe:Connect通知用に登録できます。");
      onboarding?.onPushRegistrationFailed?.();
      return;
    }

    if (getPushNotificationPermission() !== "granted") {
      setPermission(getPushNotificationPermission());
      setStatusMessage("先に通知を許可してください。");
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      await subscribeToPushNotifications({ accessToken: session.access_token });
      setPermission(getPushNotificationPermission());
      setSubscriptionStatus("registered");
      setStatusMessage("この端末を登録しました。");
      onboarding?.onPushRegistered?.();
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const isConfigMissing = error instanceof Error && error.message === "push-vapid-key-missing";
      const isAccountMismatch = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_ACCOUNT_MISMATCH");
      const requiresReRegistration = error instanceof Error && error.message === "push-subscription-reregister-required";
      setSubscriptionStatus(isConfigMissing ? "configMissing" : isAccountMismatch ? "account_mismatch" : requiresReRegistration ? "unregistered" : "failed");
      setStatusMessage(
        isConfigMissing
          ? "スマホ通知登録はまだ設定されていません。"
          : isAccountMismatch
            ? "この端末は別のアカウントに通知登録されています"
            : requiresReRegistration
              ? "この端末には以前の通知購読があります。通知端末を再登録してください。"
              : "端末登録に失敗しました。",
      );
      onboarding?.onPushRegistrationFailed?.();
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReRegisterDevice() {
    if (!isSubscriptionSupported || !session?.access_token || getPushNotificationPermission() !== "granted") {
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      await reRegisterPushNotifications({ accessToken: session.access_token });
      setPermission(getPushNotificationPermission());
      setSubscriptionStatus("registered");
      setStatusMessage("通知端末を再登録しました。");
      onboarding?.onPushRegistered?.();
      setSubscriptionCheckVersion((version) => version + 1);
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const code = error instanceof Error ? error.message : "PUSH_REREGISTER_FAILED";
      const messages = {
        INVALID_TOKEN: "ログイン情報を確認できませんでした。再度ログインしてからお試しください。",
        PUSH_CONFIGURATION_ERROR: "スマホ通知登録は現在利用できません。",
        PUSH_SUBSCRIPTION_NOT_OWNED: "この端末の通知登録を確認できませんでした。別アカウントの登録は変更していません。",
        PUSH_REREGISTER_DISABLE_FAILED: "既存の通知登録を無効化できませんでした。",
        PUSH_REREGISTER_UNSUBSCRIBE_FAILED: "現在の通知購読を解除できませんでした。",
        PUSH_REREGISTER_CONFIG_FAILED: "新しい通知設定を取得できませんでした。",
        PUSH_REREGISTER_SUBSCRIBE_FAILED: "新しい通知購読を作成できませんでした。",
        PUSH_REREGISTER_REGISTER_FAILED: "新しい通知端末を登録できませんでした。",
        PUSH_REREGISTER_STATUS_FAILED: "新しい通知登録を確認できませんでした。",
        PUSH_REREGISTER_SERVICE_WORKER_FAILED: "通知用のService Workerを準備できませんでした。",
      };
      setSubscriptionStatus("failed");
      setStatusMessage(`${messages[code] ?? "通知端末を再登録できませんでした。"}（${code}）`);
      onboarding?.onPushRegistrationFailed?.();
    } finally {
      setIsWorking(false);
    }
  }

  async function handleTransferDevice() {
    if (!session?.access_token || subscriptionStatus !== "account_mismatch") {
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      await transferPushSubscriptionToCurrentAccount({ accessToken: session.access_token });
      setPermission(getPushNotificationPermission());
      setSubscriptionStatus("registered");
      setStatusMessage("この端末の通知先を現在のアカウントへ切り替えました。");
      onboarding?.onPushRegistered?.();
      setSubscriptionCheckVersion((version) => version + 1);
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const isMismatch = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_MISMATCH");
      setStatusMessage(
        isMismatch
          ? "この端末の通知登録を確認できませんでした。画面を開き直してもう一度お試しください。"
          : "端末の通知先を切り替えられませんでした。",
      );
      onboarding?.onPushRegistrationFailed?.();
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-comet/25 bg-comet/10 px-4 py-4 text-comet shadow-[0_0_24px_rgba(125,223,255,0.08)] sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-black text-white">スマホ通知テスト</h3>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            この端末でRe:Connect通知を表示できるか確認します。iPhoneではホーム画面に追加した星空Villageから試してください。
          </p>
          <p className="mt-3 text-xs font-black text-comet">{permissionLabel}</p>
          <p className="mt-1 text-xs font-black text-comet">{subscriptionLabel}</p>
          {statusMessage ? <p className="mt-2 text-xs leading-5 text-comet/80">{statusMessage}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button
            className="min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            data-onboarding-target={
              onboarding?.currentStep === "notification_permission" ? "push-permission" : undefined
            }
            disabled={!isSupported || isWorking}
            onClick={handleRequestPermission}
            type="button"
          >
            通知を許可
          </button>
          <button
            className="min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            data-onboarding-target={
              onboarding?.currentStep === "device_registration" ? "push-register" : undefined
            }
            disabled={
              !isSubscriptionSupported ||
              isWorking ||
              permission !== "granted" ||
              !session?.access_token ||
              subscriptionStatus === "checking" ||
              subscriptionStatus === "registered" ||
              subscriptionStatus === "account_mismatch"
            }
            onClick={handleRegisterDevice}
            type="button"
          >
            この端末を登録
          </button>
          <button
            className="min-h-10 rounded-2xl border border-aurora/40 bg-aurora/10 px-4 text-xs font-black text-aurora transition hover:bg-aurora/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              !isSubscriptionSupported ||
              isWorking ||
              permission !== "granted" ||
              !session?.access_token ||
              subscriptionStatus === "checking" ||
              subscriptionStatus === "account_mismatch"
            }
            onClick={handleReRegisterDevice}
            type="button"
          >
            通知端末を再登録
          </button>
          {subscriptionStatus === "account_mismatch" ? (
            <button
              className="min-h-10 rounded-2xl border border-sakura/40 bg-sakura/10 px-4 text-xs font-black text-sakura transition hover:bg-sakura/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!session?.access_token || isWorking}
              onClick={handleTransferDevice}
              type="button"
            >
              この端末の通知先を現在のアカウントへ切り替える
            </button>
          ) : null}
          <button
            className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
            data-onboarding-target={onboarding?.currentStep === "push_test" ? "push-test" : undefined}
            disabled={
              !isSubscriptionSupported ||
              isWorking ||
              permission !== "granted" ||
              !session?.access_token ||
              subscriptionStatus !== "registered"
            }
            onClick={handleSendTestNotification}
            type="button"
          >
            テスト通知
          </button>
        </div>
      </div>
    </section>
  );
}

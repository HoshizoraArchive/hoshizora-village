import { useEffect, useState } from "react";
import {
  AUTH_PASSWORD_RECOVERY_KIND,
  getAuthConfirmationCooldownSeconds,
  validatePasswordRecoveryPasswords,
} from "./authConfirmation";

export default function PasswordRecoveryPanel({
  error,
  loading,
  message,
  onBackToLogin,
  onContinue,
  onRequest,
  onUpdate,
  recovery,
}) {
  const [email, setEmail] = useState(recovery?.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [validationError, setValidationError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const kind = recovery?.kind ?? AUTH_PASSWORD_RECOVERY_KIND.REQUEST;
  const cooldownSeconds = getAuthConfirmationCooldownSeconds(
    recovery?.resendAvailableAt ?? 0,
    now,
  );
  const normalizedEmail = email.trim();
  const isActive = kind === AUTH_PASSWORD_RECOVERY_KIND.ACTIVE;
  const isInvalid = kind === AUTH_PASSWORD_RECOVERY_KIND.INVALID;
  const isResolving = kind === AUTH_PASSWORD_RECOVERY_KIND.RESOLVING;
  const isSent = kind === AUTH_PASSWORD_RECOVERY_KIND.SENT;
  const isUpdated = kind === AUTH_PASSWORD_RECOVERY_KIND.UPDATED;

  useEffect(() => {
    setEmail(recovery?.email ?? "");
  }, [recovery?.email]);

  useEffect(() => {
    const availableAt = recovery?.resendAvailableAt ?? 0;

    if (!availableAt || availableAt <= Date.now()) {
      return undefined;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [recovery?.resendAvailableAt]);

  function handlePasswordSubmit(event) {
    event.preventDefault();
    const nextValidationError = validatePasswordRecoveryPasswords(
      newPassword,
      passwordConfirmation,
    );

    setValidationError(nextValidationError);

    if (!nextValidationError) {
      void onUpdate(newPassword, passwordConfirmation);
    }
  }

  function handleRequestSubmit(event) {
    event.preventDefault();

    if (normalizedEmail && cooldownSeconds === 0) {
      void onRequest(normalizedEmail);
    }
  }

  return (
    <section
      aria-labelledby="password-recovery-title"
      className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-xl place-items-center px-1 py-[max(1rem,env(safe-area-inset-top))]"
      data-password-recovery-state={kind}
    >
      <div className="glass-panel w-full p-4 sm:p-6">
        <p className="text-xs font-black normal-case text-comet">Password Recovery</p>

        {isResolving ? (
          <div aria-live="polite" className="mt-3 space-y-2" role="status">
            <h1 className="text-xl font-black text-white" id="password-recovery-title">
              再設定リンクを確認しています
            </h1>
            <p className="text-sm leading-6 text-slate-300">安全な再設定画面を準備しています。</p>
          </div>
        ) : null}

        {isActive ? (
          <form className="mt-3 space-y-4" onSubmit={handlePasswordSubmit}>
            <div>
              <h1 className="text-xl font-black text-white" id="password-recovery-title">
                新しいパスワードを設定
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                6文字以上の新しいパスワードを入力してください。
              </p>
            </div>
            <label className="block text-xs font-bold text-slate-400">
              新しいパスワード
              <input
                autoComplete="new-password"
                className="mt-1 min-h-11 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
                minLength={6}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setValidationError("");
                }}
                placeholder="6文字以上"
                required
                type="password"
                value={newPassword}
              />
            </label>
            <label className="block text-xs font-bold text-slate-400">
              新しいパスワード（確認）
              <input
                autoComplete="new-password"
                className="mt-1 min-h-11 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
                minLength={6}
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value);
                  setValidationError("");
                }}
                placeholder="もう一度入力"
                required
                type="password"
                value={passwordConfirmation}
              />
            </label>
            <button
              className="min-h-11 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "変更中..." : "パスワードを変更する"}
            </button>
          </form>
        ) : null}

        {isUpdated ? (
          <div className="mt-3 space-y-4">
            <div aria-live="polite" role="status">
              <h1 className="text-xl font-black text-white" id="password-recovery-title">
                パスワードを変更しました。
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                このまま星空Villageへ進めます。
              </p>
            </div>
            <button
              className="min-h-11 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
              onClick={onContinue}
              type="button"
            >
              星空Villageへ進む
            </button>
          </div>
        ) : null}

        {isSent ? (
          <div className="mt-3 space-y-4">
            <div aria-live="polite" role="status">
              <h1 className="text-xl font-black text-white" id="password-recovery-title">
                パスワード再設定メールを送信しました。
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                メール内のリンクから新しいパスワードを設定してください。
              </p>
            </div>
            <button
              className="min-h-11 w-full rounded-2xl border border-comet/30 bg-comet/10 px-4 text-sm font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || cooldownSeconds > 0 || !normalizedEmail}
              onClick={() => void onRequest(normalizedEmail)}
              type="button"
            >
              {loading
                ? "送信中..."
                : cooldownSeconds > 0
                  ? `${cooldownSeconds}秒後に再送できます`
                  : "再設定メールをもう一度送る"}
            </button>
            <button
              className="min-h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:bg-white/10"
              disabled={loading}
              onClick={onBackToLogin}
              type="button"
            >
              ログインへ戻る
            </button>
          </div>
        ) : null}

        {isInvalid || kind === AUTH_PASSWORD_RECOVERY_KIND.REQUEST ? (
          <form className="mt-3 space-y-4" onSubmit={handleRequestSubmit}>
            <div aria-live={isInvalid ? "assertive" : "polite"}>
              <h1 className="text-xl font-black text-white" id="password-recovery-title">
                {isInvalid
                  ? "このパスワード再設定リンクは古いか、期限切れになっています。"
                  : "パスワードを再設定"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {isInvalid
                  ? "再設定メールをもう一度送ってください。"
                  : "登録したメールアドレスへ再設定リンクを送ります。"}
              </p>
            </div>
            <label className="block text-xs font-bold text-slate-400">
              メールアドレス
              <input
                autoComplete="email"
                className="mt-1 min-h-11 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>
            <button
              className="min-h-11 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || cooldownSeconds > 0 || !normalizedEmail}
              type="submit"
            >
              {loading
                ? "送信中..."
                : cooldownSeconds > 0
                  ? `${cooldownSeconds}秒後に再送できます`
                  : "再設定メールを送る"}
            </button>
            <button
              className="min-h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:bg-white/10"
              disabled={loading}
              onClick={onBackToLogin}
              type="button"
            >
              ログインへ戻る
            </button>
          </form>
        ) : null}

        {(validationError || error || message) && !isUpdated ? (
          <p
            aria-live="polite"
            className={`mt-4 rounded-2xl border px-3 py-2 text-xs leading-5 ${
              validationError || error
                ? "border-sakura/30 bg-sakura/10 text-sakura"
                : "border-comet/20 bg-comet/10 text-comet"
            }`}
            role={validationError || error ? "alert" : "status"}
          >
            {validationError || error || message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

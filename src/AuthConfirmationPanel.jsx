import { useEffect, useState } from "react";
import {
  AUTH_CONFIRMATION_KIND,
  getAuthConfirmationCooldownSeconds,
} from "./authConfirmation";

const CONFIRMATION_COPY = Object.freeze({
  [AUTH_CONFIRMATION_KIND.PENDING]: {
    description: "メール内のリンクを開いて、メールアドレスを確認してください。",
    title: "会員登録できました！",
  },
  [AUTH_CONFIRMATION_KIND.EMAIL_NOT_CONFIRMED]: {
    description: "確認メールを開いて認証してください。",
    title: "メールアドレスの確認がまだ完了していません。",
  },
  [AUTH_CONFIRMATION_KIND.INVALID_LINK]: {
    description: "確認メールをもう一度送ってください。",
    title: "この確認リンクは古いか、期限切れになっています。",
  },
  [AUTH_CONFIRMATION_KIND.CONFIRMED]: {
    description: "星空Villageへようこそ。",
    title: "メールアドレスを確認しました",
  },
});

export default function AuthConfirmationPanel({
  confirmation,
  error,
  loading,
  message,
  onBack,
  onContinue,
  onResend,
}) {
  const [email, setEmail] = useState(confirmation?.email ?? "");
  const [now, setNow] = useState(() => Date.now());
  const copy = CONFIRMATION_COPY[confirmation?.kind] ?? CONFIRMATION_COPY[AUTH_CONFIRMATION_KIND.PENDING];
  const isConfirmed = confirmation?.kind === AUTH_CONFIRMATION_KIND.CONFIRMED;
  const isPending = confirmation?.kind === AUTH_CONFIRMATION_KIND.PENDING;
  const resendAvailableAt = confirmation?.resendAvailableAt ?? 0;
  const cooldownSeconds = getAuthConfirmationCooldownSeconds(resendAvailableAt, now);
  const normalizedEmail = email.trim();

  useEffect(() => {
    setEmail(confirmation?.email ?? "");
  }, [confirmation?.email]);

  useEffect(() => {
    if (!resendAvailableAt || resendAvailableAt <= Date.now()) {
      return undefined;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  return (
    <div className="mt-3 space-y-3" data-auth-confirmation-state={confirmation?.kind}>
      <div
        aria-live="polite"
        className="rounded-2xl border border-comet/25 bg-comet/10 px-4 py-4"
        role="status"
      >
        <h2 className="text-sm font-black leading-6 text-white">{copy.title}</h2>
        {confirmation?.email && !isConfirmed ? (
          <p className="mt-2 break-all text-xs font-bold leading-5 text-comet">
            {isPending ? `${confirmation.email} 宛に確認メールを送りました。` : `確認先: ${confirmation.email}`}
          </p>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-slate-300">{copy.description}</p>
      </div>

      {!isConfirmed ? (
        <>
          {!confirmation?.email ? (
            <label className="block text-xs font-bold text-slate-400">
              再送先メールアドレス
              <input
                autoComplete="email"
                className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>
          ) : null}

          <button
            className="min-h-10 w-full rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || cooldownSeconds > 0 || !normalizedEmail}
            onClick={() => void onResend(normalizedEmail)}
            type="button"
          >
            {loading
              ? "送信中..."
              : cooldownSeconds > 0
                ? `${cooldownSeconds}秒後に再送できます`
                : "確認メールを再送する"}
          </button>
          <button
            className="min-h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={onBack}
            type="button"
          >
            ログインへ戻る
          </button>
        </>
      ) : (
        <button
          className="min-h-10 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
          onClick={onContinue}
          type="button"
        >
          案内へ進む
        </button>
      )}

      {(message || error) && (
        <p
          aria-live="polite"
          className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${
            error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {error || message}
        </p>
      )}
    </div>
  );
}

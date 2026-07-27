import { useEffect, useRef } from "react";
import {
  ONBOARDING_MINI_CHIA_SRC,
  ONBOARDING_WELCOME_VIDEO_SRC,
  getNotificationSkipStatus,
  getOnboardingStepDefinition,
  shouldOfferNotificationSkip,
} from "./onboarding";

function WelcomeVideo({ error, onComplete }) {
  const dialogRef = useRef(null);
  const skipButtonRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skipButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onComplete("skipped");
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = [...(dialogRef.current?.querySelectorAll("button, video[controls]") ?? [])];

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onComplete]);

  return (
    <div
      aria-labelledby="onboarding-welcome-title"
      aria-modal="true"
      className="onboarding-welcome fixed inset-0 z-[90] grid place-items-center overflow-y-auto px-4 py-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
    >
      <div className="absolute inset-0 bg-night-950/90" aria-hidden="true" />
      <section
        className="glass-panel relative z-10 w-full max-w-3xl overflow-hidden p-4 sm:p-6"
        ref={dialogRef}
      >
        <p className="text-xs font-black normal-case text-comet">Welcome to 星空Village</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl" id="onboarding-welcome-title">
          入村案内をはじめます
        </h2>
        {ONBOARDING_WELCOME_VIDEO_SRC ? (
          <video
            className="mt-5 aspect-video w-full bg-transparent object-contain"
            controls
            onEnded={() => onComplete("completed")}
            playsInline
            preload="metadata"
            src={ONBOARDING_WELCOME_VIDEO_SRC}
          />
        ) : (
          <div className="mt-5 grid aspect-video place-items-center rounded-2xl border border-white/10 bg-night-950/45 px-6 text-center text-sm leading-7 text-slate-300">
            Welcome映像は準備中です。映像をスキップすると、ミニちあの案内を確認できます。
          </div>
        )}
        {error ? (
          <p className="mt-4 rounded-2xl border border-sakura/30 bg-sakura/10 px-4 py-3 text-sm leading-6 text-sakura">
            {error}
          </p>
        ) : null}
        <button
          className="mt-5 min-h-12 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-5 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          onClick={() => onComplete("skipped")}
          ref={skipButtonRef}
          type="button"
        >
          映像をスキップして案内へ進む
        </button>
      </section>
    </div>
  );
}

export default function InteractiveOnboarding({
  busy,
  displayName,
  error,
  onAdvance,
  onSkipNotifications,
  progress,
}) {
  const dialogueRef = useRef(null);

  useEffect(() => {
    const targetName = progress?.target;

    if (!targetName || typeof document === "undefined") {
      return undefined;
    }

    let attemptCount = 0;
    let timerId;

    function focusTargetWhenReady() {
      const target = document.querySelector(`[data-onboarding-target="${targetName}"]`);

      if (!target && attemptCount < 20) {
        attemptCount += 1;
        timerId = window.setTimeout(focusTargetWhenReady, 150);
        return;
      }

      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      target?.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    }

    timerId = window.setTimeout(focusTargetWhenReady, 120);

    return () => window.clearTimeout(timerId);
  }, [progress?.current_step, progress?.target]);

  if (!progress) {
    return null;
  }

  if (progress.current_step === "welcome_video") {
    return (
      <WelcomeVideo
        error={error}
        onComplete={(status) => onAdvance("welcome_completed", { status })}
      />
    );
  }

  const step = getOnboardingStepDefinition(progress.current_step, displayName);

  if (!step) {
    return null;
  }

  const allowNotificationSkip = shouldOfferNotificationSkip(progress);

  return (
    <div className="onboarding-guide pointer-events-none fixed inset-0 z-[80]" data-onboarding-step={progress.current_step}>
      <div className="onboarding-guide-inner">
        <img
          alt="星空ちあ"
          className="onboarding-mini-chia pointer-events-none select-none"
          draggable={false}
          src={ONBOARDING_MINI_CHIA_SRC}
        />
        <aside
          aria-atomic="true"
          aria-label="星空ちあの入村案内"
          aria-live="polite"
          className="onboarding-dialogue pointer-events-auto"
          ref={dialogueRef}
          role="region"
        >
          <p className="text-[11px] font-black tracking-[0.16em] text-comet">星空ちあ｜街の案内人</p>
          <div className="mt-2 space-y-2 text-sm font-bold leading-6 text-white sm:text-base sm:leading-7">
            {step.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {error ? <p className="mt-3 text-xs leading-5 text-sakura">{error}</p> : null}
          {step.action ? (
            <button
              className="mt-4 min-h-11 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => onAdvance(step.action, { navigateTo: step.navigateTo })}
              type="button"
            >
              次へ
            </button>
          ) : null}
          {allowNotificationSkip ? (
            <button
              className="mt-3 min-h-11 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-xs font-black text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => onSkipNotifications(getNotificationSkipStatus(progress))}
              type="button"
            >
              通知の案内をスキップして流星便へ進む
            </button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

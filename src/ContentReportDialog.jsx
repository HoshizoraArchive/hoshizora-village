import { useEffect, useRef } from "react";
import {
  CONTENT_REPORT_DETAILS_MAX_LENGTH,
  CONTENT_REPORT_REASONS,
} from "./contentReports";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function ContentReportDialog({
  dialog,
  onCancel,
  onChange,
  onSubmit,
  saving,
}) {
  const dialogRef = useRef(null);
  const firstReasonRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const savingRef = useRef(saving);
  const triggerElementRef = useRef(null);
  const isOpen = Boolean(dialog);

  onCancelRef.current = onCancel;
  savingRef.current = saving;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    triggerElementRef.current = dialog?.triggerElement ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    firstReasonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) ?? [],
      );

      if (!focusableElements.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      if (triggerElementRef.current?.isConnected) {
        triggerElementRef.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (dialog?.result) {
      dialogRef.current?.querySelector("button")?.focus();
    }
  }, [dialog?.result]);

  if (!dialog) {
    return null;
  }

  const detailsLength = Array.from(dialog.details ?? "").length;
  const canSubmit = Boolean(dialog.reason) && detailsLength <= CONTENT_REPORT_DETAILS_MAX_LENGTH;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-night-950/80 px-3 py-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onCancel();
        }
      }}
    >
      <section
        aria-describedby="content-report-dialog-description"
        aria-labelledby="content-report-dialog-title"
        aria-modal="true"
        className="my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-night-950/95 p-4 shadow-2xl sm:p-5"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <p className="text-xs font-black text-comet">観測局</p>
        <h2 className="mt-2 text-lg font-black leading-8 text-white" id="content-report-dialog-title">
          この内容について、観測局へ異常を伝えますか？
        </h2>
        <p
          className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300"
          id="content-report-dialog-description"
        >
          {"送られた内容は観測局だけが確認します。\n相手には通知されません。"}
        </p>

        {dialog.result ? (
          <div className="mt-5">
            <p
              className="whitespace-pre-line rounded-2xl border border-comet/25 bg-comet/10 px-4 py-4 text-sm font-bold leading-7 text-comet"
              role="status"
            >
              {dialog.result}
            </p>
            <button
              className="mt-5 min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-200 transition hover:border-comet/30 hover:bg-comet/10"
              onClick={onCancel}
              type="button"
            >
              閉じる
            </button>
          </div>
        ) : (
          <form className="mt-5" onSubmit={onSubmit}>
            <fieldset disabled={saving}>
              <legend className="text-sm font-black text-white">理由</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CONTENT_REPORT_REASONS.map((reason, index) => (
                  <label
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-xs font-bold leading-5 transition ${
                      dialog.reason === reason.key
                        ? "border-comet/40 bg-comet/15 text-white"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20"
                    }`}
                    key={reason.key}
                  >
                    <input
                      checked={dialog.reason === reason.key}
                      className="h-4 w-4 flex-none border-white/20 bg-night-950 text-comet focus:ring-comet/30"
                      name="content-report-reason"
                      onChange={() => onChange("reason", reason.key)}
                      ref={index === 0 ? firstReasonRef : undefined}
                      type="radio"
                      value={reason.key}
                    />
                    <span>{reason.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 block text-sm font-black text-white" htmlFor="content-report-details">
              補足 <span className="text-xs font-bold text-slate-500">任意</span>
            </label>
            <textarea
              className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-night-950/70 px-3 py-3 text-sm leading-7 text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              id="content-report-details"
              maxLength={CONTENT_REPORT_DETAILS_MAX_LENGTH}
              onChange={(event) => onChange("details", event.target.value)}
              placeholder="観測局へ伝えたいことがあれば入力してください"
              value={dialog.details}
            />
            <p className="mt-1 text-right text-[11px] text-slate-500">
              {detailsLength}/{CONTENT_REPORT_DETAILS_MAX_LENGTH}
            </p>

            {dialog.error ? (
              <p
                className="mt-4 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-6 text-sakura"
                role="alert"
              >
                {dialog.error}
              </p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={onCancel}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="min-h-11 rounded-2xl border border-comet/30 bg-comet/15 px-4 text-xs font-black text-comet disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saving || !canSubmit}
                type="submit"
              >
                {saving ? "送信中..." : "観測局へ送る"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

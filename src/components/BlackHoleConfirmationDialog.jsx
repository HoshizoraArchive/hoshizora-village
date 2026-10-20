// Isolated confirmation dialog for black-hole management.
import { useEffect, useRef } from "react";

export function BlackHoleConfirmationDialog({ dialog, error, onCancel, onConfirm, saving }) {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }

    cancelButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dialog, onCancel, saving]);

  if (!dialog) {
    return null;
  }

  const isRestore = dialog.action === "restore";
  const title = isRestore
    ? "この村人をブラックホールから戻しますか？"
    : "この村人をブラックホールに送りますか？";

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-night-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby="black-hole-dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-night-950/95 p-5 shadow-2xl"
        role="dialog"
      >
        <p className="text-xs font-black text-comet">ブラックホール</p>
        <h2 className="mt-2 text-lg font-black leading-8 text-white" id="black-hole-dialog-title">
          {title}
        </h2>
        {!isRestore ? (
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-300">
            {"お互いの投稿・プロフィール・星文・通知が見えなくなります。\n相手には通知されません。"}
          </p>
        ) : (
          <p className="mt-4 text-sm leading-7 text-slate-300">
            次回取得時から、削除されていない投稿や星文が再び表示されます。
          </p>
        )}
        {error ? (
          <p className="mt-4 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-6 text-sakura" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="min-h-11 rounded-2xl border border-indigo-300/30 bg-indigo-300/15 px-4 text-xs font-black text-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            onClick={() => void onConfirm()}
            type="button"
          >
            {saving
              ? "処理中..."
              : isRestore
                ? "ブラックホールから戻す"
                : "ブラックホールに送る"}
          </button>
        </div>
      </section>
    </div>
  );
}

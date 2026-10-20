// Preview components for image, video and thumbnail attachments.
import { METEOR_IMAGE_MAX_COUNT, formatFileSize, formatMediaDuration } from "../lib/mediaEditorUtils";

export function PostImageDraftPreview({ disabled, drafts, onMove, onRemove }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {drafts.map((draft, index) => (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-night-950/55" key={draft.id}>
          <img
            alt=""
            className="aspect-square w-full object-cover"
            draggable={false}
            src={draft.previewUrl}
          />
          <div className="space-y-2 p-2">
            <p className="truncate text-[11px] font-bold text-slate-400">
              {index + 1} / {METEOR_IMAGE_MAX_COUNT}
            </p>
            <div className="grid grid-cols-3 gap-1">
              <button
                className="min-h-8 rounded-xl border border-white/10 bg-white/5 text-[11px] font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled || index === 0}
                onClick={() => onMove(draft.id, -1)}
                type="button"
              >
                前へ
              </button>
              <button
                className="min-h-8 rounded-xl border border-white/10 bg-white/5 text-[11px] font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled || index === drafts.length - 1}
                onClick={() => onMove(draft.id, 1)}
                type="button"
              >
                後ろ
              </button>
              <button
                className="min-h-8 rounded-xl border border-sakura/30 bg-sakura/10 text-[11px] font-black text-sakura disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled}
                onClick={() => onRemove(draft.id)}
                type="button"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PostVideoDraftPreview({ disabled, draft, onRemove }) {
  if (!draft) {
    return null;
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-night-950/55">
      <video
        className="aspect-video w-full bg-black object-contain"
        controls
        playsInline
        preload="metadata"
        src={draft.previewUrl}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-white">{draft.displayName || draft.name || "選択した星映"}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">
            {formatMediaDuration(draft.durationSeconds)} / {formatFileSize(draft.size)}
            {draft.wasTrimmed ? " / 切り取り済み" : ""}
          </p>
        </div>
        <button
          className="min-h-9 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 text-[11px] font-black text-sakura disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          星映を削除
        </button>
      </div>
    </div>
  );
}

export function PostThumbnailDraftPreview({ disabled, draft, onEdit, onRemove }) {
  if (!draft) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <img
        alt=""
        className="h-20 w-28 rounded-2xl border border-white/10 object-cover"
        draggable={false}
        src={draft.previewUrl}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black text-white">{draft.displayName || draft.name || "星映の表紙"}</p>
        <p className="mt-1 text-[11px] font-bold text-slate-400">{formatFileSize(draft.size)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-9 rounded-2xl border border-comet/30 bg-comet/10 px-3 text-[11px] font-black text-comet disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onEdit}
          type="button"
        >
          表紙を調整
        </button>
        <button
          className="min-h-9 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 text-[11px] font-black text-sakura disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          削除
        </button>
      </div>
    </div>
  );
}

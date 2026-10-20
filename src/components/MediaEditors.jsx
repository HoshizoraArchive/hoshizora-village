// Media edit dialogs, separated from the main application state machine.
import { useEffect, useRef } from "react";
import { AVATAR_CROP_MAX_ZOOM, AVATAR_CROP_MIN_ZOOM, METEOR_VIDEO_MAX_DURATION_SECONDS, clampNumber, constrainAvatarCropOffset, constrainPostCoverCropOffset, formatMediaDuration, getAvatarCoverScale, getPostCoverCropScale } from "../lib/mediaEditorUtils";

export function AvatarCropModal({ crop }) {
  const onCancelRef = useRef(crop.onCancel);

  useEffect(() => {
    onCancelRef.current = crop.onCancel;
  }, [crop.onCancel]);

  useEffect(() => {
    if (!crop.isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCancelRef.current();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [crop.isOpen]);

  if (!crop.isOpen || !crop.imageUrl) {
    return null;
  }

  return (
    <div
      aria-label="星影を切り取る"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-night-950/88 px-3 py-4 backdrop-blur-xl"
      role="dialog"
    >
      <div className="mx-auto flex min-h-full max-w-xl items-center">
        <div className="w-full rounded-3xl border border-white/15 bg-night-950/90 p-4 shadow-[0_0_70px_rgba(125,223,255,0.18)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-comet">星影を切り取る</p>
              <h2 className="mt-1 text-xl font-black text-white">星影を切り取る</h2>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                ドラッグして位置を調整し、スライダーで大きさを変えられます。
              </p>
            </div>
            <button
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={crop.preparing}
              onClick={crop.onCancel}
              type="button"
            >
              キャンセル
            </button>
          </div>

          <AvatarCropper
            disabled={crop.disabled}
            frameSize={crop.frameSize}
            imageSize={crop.imageSize}
            imageUrl={crop.imageUrl}
            offset={crop.offset}
            onFrameSizeChange={crop.onFrameSizeChange}
            onImageLoad={crop.onImageLoad}
            onOffsetChange={crop.onOffsetChange}
            onReset={crop.onReset}
            onZoomChange={crop.onZoomChange}
            zoom={crop.zoom}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs font-bold text-slate-500">{crop.fileName}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing}
                onClick={crop.onCancel}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing || !crop.imageSize}
                onClick={crop.onUse}
                type="button"
              >
                {crop.preparing ? "準備中..." : "この星影を使う"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostCoverCropModal({ crop }) {
  const onCancelRef = useRef(crop.onCancel);

  useEffect(() => {
    onCancelRef.current = crop.onCancel;
  }, [crop.onCancel]);

  useEffect(() => {
    if (!crop.isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCancelRef.current();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [crop.isOpen]);

  if (!crop.isOpen || !crop.imageUrl) {
    return null;
  }

  return (
    <div
      aria-label="星映の表紙を切り取る"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-night-950/88 px-3 py-4 backdrop-blur-xl"
      role="dialog"
    >
      <div className="mx-auto flex min-h-full max-w-2xl items-center">
        <div className="w-full rounded-3xl border border-white/15 bg-night-950/90 p-4 shadow-[0_0_70px_rgba(125,223,255,0.18)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-comet">星映の表紙</p>
              <h2 className="mt-1 text-xl font-black text-white">星映の表紙を切り取る</h2>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                ドラッグして位置を調整し、スライダーで大きさを変えられます。
              </p>
            </div>
            <button
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={crop.preparing}
              onClick={crop.onCancel}
              type="button"
            >
              キャンセル
            </button>
          </div>

          <PostCoverCropper
            disabled={crop.disabled}
            frameSize={crop.frameSize}
            imageSize={crop.imageSize}
            imageUrl={crop.imageUrl}
            offset={crop.offset}
            onFrameSizeChange={crop.onFrameSizeChange}
            onImageLoad={crop.onImageLoad}
            onOffsetChange={crop.onOffsetChange}
            onReset={crop.onReset}
            onZoomChange={crop.onZoomChange}
            zoom={crop.zoom}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs font-bold text-slate-500">{crop.fileName}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing}
                onClick={crop.onCancel}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing || !crop.imageSize}
                onClick={crop.onUse}
                type="button"
              >
                {crop.preparing ? "準備中..." : "この表紙にする"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostVideoTrimModal({ trim }) {
  const videoRef = useRef(null);
  const onCancelRef = useRef(trim.onCancel);
  const draft = trim.draft;
  const durationSeconds = Number(draft?.durationSeconds || 0);
  const maxLength = Math.min(METEOR_VIDEO_MAX_DURATION_SECONDS, Math.max(0.5, durationSeconds));
  const selectedLength = clampNumber(Number(trim.lengthSeconds) || maxLength, 0.5, maxLength);
  const maxStart = Math.max(0, durationSeconds - selectedLength);
  const startSeconds = clampNumber(trim.startSeconds, 0, maxStart);
  const endSeconds = Math.min(durationSeconds, startSeconds + selectedLength);

  useEffect(() => {
    onCancelRef.current = trim.onCancel;
  }, [trim.onCancel]);

  useEffect(() => {
    if (!trim.isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCancelRef.current();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [trim.isOpen]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !trim.isOpen) {
      return;
    }

    video.pause();
    video.currentTime = startSeconds;
  }, [startSeconds, trim.isOpen]);

  if (!trim.isOpen || !draft?.previewUrl) {
    return null;
  }

  function handlePreviewRange() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = startSeconds;
    video.play?.().catch(() => {
      // Controls remain available if the browser blocks programmatic play.
    });
  }

  function handleTimeUpdate(event) {
    const video = event.currentTarget;

    if (video.currentTime >= endSeconds) {
      video.pause();
      video.currentTime = endSeconds;
    }
  }

  return (
    <div
      aria-label="星映を切り取る"
      aria-modal="true"
      className="fixed inset-0 z-[60] overflow-y-auto bg-night-950/90 px-3 py-4 backdrop-blur-xl"
      role="dialog"
    >
      <div className="mx-auto flex min-h-full max-w-2xl items-center">
        <div className="w-full rounded-3xl border border-white/15 bg-night-950/92 p-4 shadow-[0_0_80px_rgba(125,223,255,0.18)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-aurora">星映（ほしうつし）</p>
              <h2 className="mt-1 text-xl font-black text-white">星映を切り取る</h2>
              <p className="mt-2 text-xs leading-6 text-slate-400">いちばん光る35秒を選んでください。</p>
            </div>
            <button
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={trim.onCancel}
              type="button"
            >
              キャンセル
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              className="aspect-video w-full bg-black object-contain"
              controls
              onTimeUpdate={handleTimeUpdate}
              playsInline
              preload="metadata"
              ref={videoRef}
              src={draft.previewUrl}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-aurora/20 bg-aurora/10 p-3">
            <div className="grid gap-2 text-xs font-bold text-slate-300 sm:grid-cols-2">
              <p>動画全体の時間：{formatMediaDuration(durationSeconds)}</p>
              <p>選択範囲の長さ：{formatMediaDuration(selectedLength)}</p>
              <p>選択開始時間：{formatMediaDuration(startSeconds)}</p>
              <p>選択終了時間：{formatMediaDuration(endSeconds)}</p>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
                <span>選択開始</span>
                <span>{formatMediaDuration(startSeconds)}</span>
              </div>
              <input
                aria-label="星映の開始位置"
                className="w-full accent-cyan-300"
                disabled={trim.processing}
                max={maxStart}
                min={0}
                onChange={(event) => trim.onStartChange(event.target.value)}
                step="0.1"
                type="range"
                value={startSeconds}
              />
              <div className="mt-2 flex justify-between text-[11px] font-black text-slate-500">
                <span>0:00</span>
                <span>{formatMediaDuration(maxStart)}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
                <span>選択範囲の長さ</span>
                <span>{formatMediaDuration(selectedLength)}</span>
              </div>
              <input
                aria-label="星映の選択範囲の長さ"
                className="w-full accent-cyan-300"
                disabled={trim.processing}
                max={maxLength}
                min={0.5}
                onChange={(event) => trim.onLengthChange(event.target.value)}
                step="0.1"
                type="range"
                value={selectedLength}
              />
              <div className="mt-2 flex justify-between text-[11px] font-black text-slate-500">
                <span>0.5秒</span>
                <span>{formatMediaDuration(maxLength)}</span>
              </div>
            </div>

            {trim.processing && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black text-comet">
                  <span>星映を切り取り中...</span>
                  <span>{Math.round(trim.progress * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-comet via-aurora to-sakura transition-[width]"
                    style={{ width: `${Math.round(trim.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {trim.error && (
              <p className="mt-3 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
                {trim.error}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs font-bold text-slate-500">{draft.name}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={trim.processing}
                onClick={trim.onReset}
                type="button"
              >
                位置をリセット
              </button>
              <button
                className="min-h-10 rounded-2xl border border-comet/25 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={trim.processing}
                onClick={handlePreviewRange}
                type="button"
              >
                選択範囲を再生
              </button>
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={trim.onCancel}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={trim.processing || selectedLength <= 0 || selectedLength > METEOR_VIDEO_MAX_DURATION_SECONDS + 0.1}
                onClick={trim.onConfirm}
                type="button"
              >
                決定
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AvatarCropper({
  disabled,
  frameSize,
  imageSize,
  imageUrl,
  offset,
  onFrameSizeChange,
  onImageLoad,
  onOffsetChange,
  onReset,
  onZoomChange,
  zoom,
}) {
  const guideRef = useRef(null);
  const imageRef = useRef(null);
  const dragStateRef = useRef(null);
  const latestVisualOffsetRef = useRef(offset);
  const animationFrameRef = useRef(null);
  const coverScale = getAvatarCoverScale(imageSize, frameSize);
  const displayedWidth = imageSize?.width && frameSize ? imageSize.width * coverScale * zoom : null;
  const displayedHeight = imageSize?.height && frameSize ? imageSize.height * coverScale * zoom : null;

  function applyImageTransform(nextOffset) {
    if (!imageRef.current) {
      return;
    }

    imageRef.current.style.transform = `translate(-50%, -50%) translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`;
  }

  function scheduleVisualOffset(nextOffset) {
    latestVisualOffsetRef.current = nextOffset;

    if (animationFrameRef.current) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      applyImageTransform(latestVisualOffsetRef.current);
    });
  }

  function flushVisualOffset() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    applyImageTransform(latestVisualOffsetRef.current);
  }

  function getMeasuredFrameSize() {
    const rect = guideRef.current?.getBoundingClientRect();
    const measuredSize = rect ? Math.round(Math.min(rect.width, rect.height)) : 0;

    return measuredSize || frameSize;
  }

  useEffect(() => {
    const guide = guideRef.current;

    if (!guide) {
      return undefined;
    }

    function updateFrameSize() {
      const rect = guide.getBoundingClientRect();
      const nextSize = Math.round(Math.min(rect.width, rect.height));

      if (nextSize > 0) {
        onFrameSizeChange(nextSize);
      }
    }

    updateFrameSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFrameSize);
      return () => {
        window.removeEventListener("resize", updateFrameSize);
      };
    }

    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(guide);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl, onFrameSizeChange]);

  useEffect(() => {
    latestVisualOffsetRef.current = offset;

    if (!dragStateRef.current) {
      applyImageTransform(offset);
    }
  }, [displayedHeight, displayedWidth, offset]);

  useEffect(
    () => () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  function handlePointerDown(event) {
    if (disabled || !imageSize?.width || !imageSize?.height) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; dragging still works without it.
    }

    const safeStartOffset = constrainAvatarCropOffset(
      latestVisualOffsetRef.current,
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    latestVisualOffsetRef.current = safeStartOffset;
    flushVisualOffset();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: safeStartOffset,
      target: event.currentTarget,
    };
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const nextOffset = constrainAvatarCropOffset(
      {
        x: dragState.startOffset.x + event.clientX - dragState.startX,
        y: dragState.startOffset.y + event.clientY - dragState.startY,
      },
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    scheduleVisualOffset(nextOffset);
  }

  function handlePointerEnd(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const finalOffset = latestVisualOffsetRef.current;

    dragStateRef.current = null;
    try {
      dragState.target?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Some mobile browsers release capture before the pointerup callback.
    }
    flushVisualOffset();
    onOffsetChange(finalOffset);
  }

  return (
    <div className="mt-4 rounded-3xl border border-comet/20 bg-night-950/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-comet">星影の位置を調整</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">枠の中をドラッグして、アイコンに使う光を合わせます。</p>
        </div>
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={onReset}
          type="button"
        >
          位置をリセット
        </button>
      </div>

      <div
        aria-label="星影の正方形プレビュー"
        className="relative mx-auto mt-4 aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-3xl border border-comet/30 bg-night-950/70 shadow-[0_0_35px_rgba(125,223,255,0.16)]"
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onLostPointerCapture={handlePointerEnd}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      >
        <img
          alt=""
          className={displayedWidth && displayedHeight ? "absolute max-w-none select-none" : "h-full w-full select-none object-cover"}
          draggable={false}
          onLoad={(event) =>
            onImageLoad({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          onDragStart={(event) => event.preventDefault()}
          ref={imageRef}
          src={imageUrl}
          style={
            displayedWidth && displayedHeight
              ? {
                  height: `${displayedHeight}px`,
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0)`,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  willChange: "transform",
                  width: `${displayedWidth}px`,
                }
              : undefined
          }
        />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[9%] bg-night-950/52" />
          <div className="absolute inset-x-0 bottom-0 h-[9%] bg-night-950/52" />
          <div className="absolute bottom-[9%] left-0 top-[9%] w-[9%] bg-night-950/52" />
          <div className="absolute bottom-[9%] right-0 top-[9%] w-[9%] bg-night-950/52" />
          <div
            className="absolute inset-[9%] rounded-[1.65rem] border border-comet/65 bg-white/[0.025] shadow-[0_0_28px_rgba(125,223,255,0.16),inset_0_0_22px_rgba(255,255,255,0.06)]"
            ref={guideRef}
          >
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/10" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/10" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/10" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/10" />
          </div>
          <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/25" />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
          <span>星影を遠ざける</span>
          <span>星影を近づける</span>
        </div>
        <input
          aria-label="星影のズーム"
          className="w-full accent-cyan-300"
          disabled={disabled}
          max={AVATAR_CROP_MAX_ZOOM}
          min={AVATAR_CROP_MIN_ZOOM}
          onChange={(event) => onZoomChange(event.target.value)}
          step="0.01"
          type="range"
          value={zoom}
        />
      </div>
    </div>
  );
}

export function PostCoverCropper({
  disabled,
  frameSize,
  imageSize,
  imageUrl,
  offset,
  onFrameSizeChange,
  onImageLoad,
  onOffsetChange,
  onReset,
  onZoomChange,
  zoom,
}) {
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const dragStateRef = useRef(null);
  const latestVisualOffsetRef = useRef(offset);
  const animationFrameRef = useRef(null);
  const coverScale = getPostCoverCropScale(imageSize, frameSize);
  const displayedWidth = imageSize?.width && frameSize?.width ? imageSize.width * coverScale * zoom : null;
  const displayedHeight = imageSize?.height && frameSize?.height ? imageSize.height * coverScale * zoom : null;

  function applyImageTransform(nextOffset) {
    if (!imageRef.current) {
      return;
    }

    imageRef.current.style.transform = `translate(-50%, -50%) translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`;
  }

  function scheduleVisualOffset(nextOffset) {
    latestVisualOffsetRef.current = nextOffset;

    if (animationFrameRef.current) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      applyImageTransform(latestVisualOffsetRef.current);
    });
  }

  function flushVisualOffset() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    applyImageTransform(latestVisualOffsetRef.current);
  }

  function getMeasuredFrameSize() {
    const rect = frameRef.current?.getBoundingClientRect();

    if (!rect) {
      return frameSize;
    }

    return {
      height: Math.round(rect.height) || frameSize.height,
      width: Math.round(rect.width) || frameSize.width,
    };
  }

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return undefined;
    }

    function updateFrameSize() {
      const rect = frame.getBoundingClientRect();
      const nextSize = {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };

      if (nextSize.width > 0 && nextSize.height > 0) {
        onFrameSizeChange(nextSize);
      }
    }

    updateFrameSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFrameSize);
      return () => {
        window.removeEventListener("resize", updateFrameSize);
      };
    }

    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl, onFrameSizeChange]);

  useEffect(() => {
    latestVisualOffsetRef.current = offset;

    if (!dragStateRef.current) {
      applyImageTransform(offset);
    }
  }, [displayedHeight, displayedWidth, offset]);

  useEffect(
    () => () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  function handlePointerDown(event) {
    if (disabled || !imageSize?.width || !imageSize?.height) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; dragging still works without it.
    }

    const safeStartOffset = constrainPostCoverCropOffset(
      latestVisualOffsetRef.current,
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    latestVisualOffsetRef.current = safeStartOffset;
    flushVisualOffset();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startOffset: safeStartOffset,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
    };
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const nextOffset = constrainPostCoverCropOffset(
      {
        x: dragState.startOffset.x + event.clientX - dragState.startX,
        y: dragState.startOffset.y + event.clientY - dragState.startY,
      },
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    scheduleVisualOffset(nextOffset);
  }

  function handlePointerEnd(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const finalOffset = latestVisualOffsetRef.current;

    dragStateRef.current = null;
    try {
      dragState.target?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Some mobile browsers release capture before the pointerup callback.
    }
    flushVisualOffset();
    onOffsetChange(finalOffset);
  }

  return (
    <div className="mt-4 rounded-3xl border border-comet/20 bg-night-950/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-comet">表紙の位置を調整</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">16:9の枠に、見せたい星映の光を合わせます。</p>
        </div>
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={onReset}
          type="button"
        >
          位置をリセット
        </button>
      </div>

      <div
        aria-label="星映の表紙16:9プレビュー"
        className="relative mx-auto mt-4 aspect-video w-full max-w-[460px] touch-none overflow-hidden rounded-3xl border border-comet/30 bg-night-950/70 shadow-[0_0_35px_rgba(125,223,255,0.16)]"
        onLostPointerCapture={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={frameRef}
        style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      >
        <img
          alt=""
          className={displayedWidth && displayedHeight ? "absolute max-w-none select-none" : "h-full w-full select-none object-cover"}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onLoad={(event) =>
            onImageLoad({
              height: event.currentTarget.naturalHeight,
              width: event.currentTarget.naturalWidth,
            })
          }
          ref={imageRef}
          src={imageUrl}
          style={
            displayedWidth && displayedHeight
              ? {
                  height: `${displayedHeight}px`,
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0)`,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  willChange: "transform",
                  width: `${displayedWidth}px`,
                }
              : undefined
          }
        />
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/25">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/15" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/15" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/15" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/15" />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
          <span>遠ざける</span>
          <span>近づける</span>
        </div>
        <input
          aria-label="星映の表紙のズーム"
          className="w-full accent-cyan-300"
          disabled={disabled}
          max={AVATAR_CROP_MAX_ZOOM}
          min={AVATAR_CROP_MIN_ZOOM}
          onChange={(event) => onZoomChange(event.target.value)}
          step="0.01"
          type="range"
          value={zoom}
        />
      </div>
    </div>
  );
}

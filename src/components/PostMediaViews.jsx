// Media presentation and lightbox components.
import { useEffect, useRef, useState } from "react";
import { POST_INLINE_VIDEO_PLAY_EVENT, STAR_MOVIE_OBSERVATION_MEDIA_QUERY, isStarMovieObservationViewport } from "../starMovieObservation";
import { METEOR_IMAGE_MAX_COUNT, YOUTUBE_VIDEO_ID_PATTERN, formatMediaDuration } from "../lib/mediaEditorUtils";

export function useStarMovieObservationViewport() {
  const [isDesktopObservationViewport, setIsDesktopObservationViewport] = useState(() =>
    isStarMovieObservationViewport(),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(STAR_MOVIE_OBSERVATION_MEDIA_QUERY);

    function handleViewportChange(event) {
      setIsDesktopObservationViewport(event.matches);
    }

    setIsDesktopObservationViewport(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener?.("change", handleViewportChange);
    };
  }, []);

  return isDesktopObservationViewport;
}

export function YouTubeEmbed({ onOpenObservation, videoId }) {
  const iframeRef = useRef(null);
  const isDesktopObservationViewport = useStarMovieObservationViewport();

  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return null;
  }

  return (
    <div
      className="post-video-shell post-video-youtube relative mt-4 aspect-video overflow-hidden rounded-2xl border border-comet/20 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.28)]"
      data-card-action="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="star-movie-surface h-full w-full"
        loading="lazy"
        ref={iframeRef}
        referrerPolicy="strict-origin-when-cross-origin"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`}
        title="YouTube video player"
      />
      {isDesktopObservationViewport ? (
        <button
          aria-label="YouTubeを星映観測モードで開く"
          className="absolute bottom-12 left-3 z-10 min-h-9 rounded-full border border-white/20 bg-night-950/75 px-3 text-[11px] font-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-md transition hover:border-comet/45 hover:bg-comet/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/30"
          onClick={(event) => {
            event.stopPropagation();
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
              "https://www.youtube-nocookie.com",
            );
            onOpenObservation?.(event.currentTarget);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          星映観測モード
        </button>
      ) : null}
    </div>
  );
}

export function SunoLinkCard({ url }) {
  if (!url) {
    return null;
  }

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-aurora/25 bg-gradient-to-br from-night-950/75 via-comet/10 to-aurora/15 p-3 shadow-[0_18px_55px_rgba(3,7,18,0.24)]"
      data-card-action="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-2xl border border-comet/25 bg-comet/10 text-lg font-black text-comet shadow-[0_0_18px_rgba(125,223,255,0.12)]">
          ♪
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-comet">Sunoで音楽を聴く</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">この流星便にはSunoの楽曲リンクがあります。</p>
          <a
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
            href={url}
            onClick={(event) => event.stopPropagation()}
            rel="noopener noreferrer"
            target="_blank"
          >
            Sunoで開く
          </a>
        </div>
        <span className="text-sm text-aurora/70" aria-hidden="true">
          ✦
        </span>
      </div>
    </div>
  );
}

export function PostMediaGrid({ media = [], onOpenMedia, onOpenObservation }) {
  const videoItem = media.find((item) => item?.mediaType === "video" && item.url);
  const visibleImages = media
    .filter((item) => item?.mediaType !== "video" && item?.url)
    .slice(0, METEOR_IMAGE_MAX_COUNT);

  if (!videoItem && visibleImages.length === 0) {
    return null;
  }

  const gridClass =
    visibleImages.length === 1
      ? "grid-cols-1"
      : visibleImages.length === 2
        ? "grid-cols-2"
        : "grid-cols-2";

  function handleOpenMedia(event, index) {
    event.stopPropagation();
    onOpenMedia?.(visibleImages, index);
  }

  return (
    <>
      {videoItem && (
        <PostVideoAttachment
          item={videoItem}
          onOpenMedia={onOpenMedia}
          onOpenObservation={(triggerElement) =>
            onOpenObservation?.(videoItem, triggerElement)
          }
        />
      )}
      {visibleImages.length > 0 && (
        <div
          className={`mt-4 grid overflow-hidden rounded-2xl border border-white/10 bg-night-950/35 ${gridClass} gap-1`}
          data-card-action="true"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {visibleImages.map((item, index) => {
            const isFeatured = visibleImages.length === 3 && index === 0;
            const itemClass = visibleImages.length === 1
              ? "aspect-[4/3] max-h-[420px]"
              : isFeatured
                ? "aspect-square sm:row-span-2"
                : "aspect-square";

            return (
              <button
                aria-label={`流星便の星影 ${index + 1} / ${visibleImages.length} を開く`}
                className={`${itemClass} min-h-0 overflow-hidden bg-white/5 outline-none transition hover:brightness-110 focus-visible:ring-4 focus-visible:ring-comet/25`}
                data-card-action="true"
                key={item.id ?? item.storagePath ?? item.url}
                onClick={(event) => handleOpenMedia(event, index)}
                type="button"
              >
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  loading="lazy"
                  src={item.url}
                />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function PostVideoAttachment({ item, onOpenMedia, onOpenObservation }) {
  const videoRef = useRef(null);
  const [hasLoadedVideo, setHasLoadedVideo] = useState(false);
  const isDesktopObservationViewport = useStarMovieObservationViewport();
  const mediaId = item.id ?? item.storagePath ?? item.url;

  useEffect(() => {
    function handleOtherVideoPlay(event) {
      if (event.detail?.mediaId === mediaId) {
        return;
      }

      videoRef.current?.pause();
    }

    window.addEventListener(POST_INLINE_VIDEO_PLAY_EVENT, handleOtherVideoPlay);

    return () => {
      window.removeEventListener(POST_INLINE_VIDEO_PLAY_EVENT, handleOtherVideoPlay);
      videoRef.current?.pause();
    };
  }, [mediaId]);

  function stopCardAction(event) {
    event.stopPropagation();
  }

  function requestInlinePlay(event) {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId } }));
    setHasLoadedVideo(true);
    window.requestAnimationFrame(() => {
      videoRef.current?.play?.().catch(() => {
        // Browser autoplay rules can still block; controls remain available.
      });
    });
  }

  function handleOpenViewer(event) {
    event.stopPropagation();
    videoRef.current?.pause();
    onOpenMedia?.([item], 0);
  }

  return (
    <div
      className="post-video-shell post-video-upload mt-4 overflow-hidden rounded-2xl border border-white/10 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.22)]"
      data-card-action="true"
      onClick={stopCardAction}
      onPointerDown={stopCardAction}
    >
      <div className="post-video-viewport relative aspect-video bg-black">
        {hasLoadedVideo ? (
          <video
            className="star-movie-surface h-full w-full bg-black object-contain"
            controls
            onPlay={() => window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId } }))}
            playsInline
            poster={item.thumbnailUrl ?? undefined}
            preload="none"
            ref={videoRef}
            src={item.url}
          />
        ) : (
          <button
            aria-label="流星便の星映を再生"
            className="group relative h-full w-full overflow-hidden bg-night-950 text-left outline-none focus-visible:ring-4 focus-visible:ring-comet/30"
            onClick={requestInlinePlay}
            type="button"
          >
            {item.thumbnailUrl ? (
              <img
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                draggable={false}
                loading="lazy"
                src={item.thumbnailUrl}
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(125,223,255,0.22),transparent_35%),linear-gradient(135deg,rgba(5,8,22,1),rgba(44,24,86,0.9),rgba(3,7,18,1))]">
                <div className="text-center">
                  <p className="text-4xl">✦</p>
                  <p className="mt-2 text-xs font-black text-comet">流星便の星映</p>
                </div>
              </div>
            )}
            <span className="absolute inset-0 bg-night-950/15" />
            <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-white/20 text-2xl text-white shadow-[0_0_30px_rgba(125,223,255,0.35)] backdrop-blur-md transition group-hover:scale-105">
              ▶
            </span>
          </button>
        )}
        {!isDesktopObservationViewport ? (
          <button
            className="absolute right-3 top-3 min-h-9 rounded-full border border-white/15 bg-night-950/70 px-3 text-[11px] font-black text-white backdrop-blur-md transition hover:border-comet/35 hover:bg-comet/20"
            onClick={handleOpenViewer}
            type="button"
          >
            拡大
          </button>
        ) : (
          <button
            aria-label="アップロード動画を星映観測モードで開く"
            className="absolute bottom-12 left-3 z-10 min-h-9 rounded-full border border-white/20 bg-night-950/75 px-3 text-[11px] font-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-md transition hover:border-comet/45 hover:bg-comet/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/30"
            onClick={(event) => {
              event.stopPropagation();
              videoRef.current?.pause();
              onOpenObservation?.(event.currentTarget);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            星映観測モード
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-slate-400">
        <span>いちばん光る35秒</span>
        {item.durationSeconds ? <span>{formatMediaDuration(item.durationSeconds)}</span> : null}
      </div>
    </div>
  );
}

export function PostMediaViewerModal({ onClose, onStep, viewer }) {
  const currentItem = viewer?.items?.[viewer.index];
  const total = viewer?.items?.length ?? 0;
  const canGoPrevious = Boolean(viewer && viewer.index > 0);
  const canGoNext = Boolean(viewer && viewer.index < total - 1);
  const onCloseRef = useRef(onClose);
  const videoRef = useRef(null);
  const isVideo = currentItem?.mediaType === "video";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!viewer) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCloseRef.current?.();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer || !isVideo) {
      return undefined;
    }

    window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId: "viewer" } }));

    return () => {
      videoRef.current?.pause();
      videoRef.current?.removeAttribute("src");
      videoRef.current?.load();
    };
  }, [isVideo, viewer, currentItem?.url]);

  if (!viewer || !currentItem?.url) {
    return null;
  }

  return (
    <div
      aria-label={isVideo ? "流星便の星映を見る" : "流星便の星影を見る"}
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-night-950/90 px-3 py-6 backdrop-blur-xl"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-white/15 bg-night-950/75 p-3 shadow-[0_0_70px_rgba(125,223,255,0.18)]"
        data-card-action="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-black text-comet">
            {isVideo ? "星映を見る" : "星影を見る"}
            <span className="ml-2 text-slate-400">
              {viewer.index + 1} / {total}
            </span>
          </p>
          <button
            className="min-h-9 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            閉じる
          </button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/35">
          {isVideo ? (
            <video
              className="max-h-[72vh] w-full bg-black object-contain"
              controls
              playsInline
              poster={currentItem.thumbnailUrl ?? undefined}
              preload="metadata"
              ref={videoRef}
              src={currentItem.url}
            />
          ) : (
            <img
              alt=""
              className="max-h-[72vh] w-full object-contain"
              draggable={false}
              src={currentItem.url}
            />
          )}
        </div>

        {!isVideo && total > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canGoPrevious}
              onClick={() => onStep(-1)}
              type="button"
            >
              前の星影
            </button>
            <button
              className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canGoNext}
              onClick={() => onStep(1)}
              type="button"
            >
              次の星影
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

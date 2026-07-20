import { useEffect, useRef } from "react";
import {
  getStarMovieObservationFocusTargetIndex,
  POST_INLINE_VIDEO_PLAY_EVENT,
  STAR_MOVIE_OBSERVATION_MEDIA_QUERY,
} from "./starMovieObservation";

const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "iframe",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "video[controls]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getDialogFocusableElements(dialog) {
  if (!dialog) {
    return [];
  }

  return Array.from(dialog.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

function ObservationActionButton({ active = false, disabled = false, icon, label, onClick }) {
  return (
    <button
      className={`flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/25 disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-comet/40 bg-comet/15 text-white"
          : "border-white/10 bg-white/5 text-slate-300 hover:border-comet/30 hover:bg-comet/10 hover:text-white"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="text-comet" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export default function StarMovieObservationMode({
  archive,
  authorAvatar,
  body,
  media,
  onClose,
  post,
  resonance,
  starLetters,
  starLettersPanel,
}) {
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const videoRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const mediaId = `star-movie-observation:${media?.id ?? post?.id ?? "unknown"}`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!post || !media) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const desktopQuery = window.matchMedia(STAR_MOVIE_OBSERVATION_MEDIA_QUERY);

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      const focusableElements = getDialogFocusableElements(dialog);
      const activeIndex = focusableElements.indexOf(document.activeElement);
      const targetIndex = getStarMovieObservationFocusTargetIndex({
        activeIndex,
        focusableCount: focusableElements.length,
        shiftKey: event.shiftKey,
      });

      if (targetIndex === null) {
        return;
      }

      event.preventDefault();
      (targetIndex >= 0 ? focusableElements[targetIndex] : dialog)?.focus();
    }

    function handleFocusIn(event) {
      if (!dialogRef.current?.contains(event.target)) {
        closeButtonRef.current?.focus();
      }
    }

    function handleViewportChange(event) {
      if (!event.matches) {
        onCloseRef.current?.();
      }
    }

    document.body.style.overflow = "hidden";
    window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId } }));
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focusin", handleFocusIn);
    desktopQuery.addEventListener?.("change", handleViewportChange);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focusin", handleFocusIn);
      desktopQuery.removeEventListener?.("change", handleViewportChange);
      videoRef.current?.pause();
      videoRef.current?.removeAttribute("src");
      videoRef.current?.load();
    };
  }, [media?.id, media?.kind, media?.src, media?.videoId, mediaId, post?.id]);

  if (!post || !media) {
    return null;
  }

  const resonanceCount = Number.isFinite(post.resonanceCount) ? post.resonanceCount : 0;
  const postStarLetters = starLetters?.itemsByPostId?.[post.id] ?? [];
  const isStarLettersOpen = starLetters?.openPostId === post.id;
  const isArchived = archive?.archivedPostIds?.includes(post.id);
  const isResonanceSaving = resonance?.savingPostId === post.id;
  const isArchiveSaving = archive?.savingPostId === post.id;
  const titleId = `star-movie-observation-title-${post.id}`;

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  }

  function handleVideoPlay() {
    window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId } }));
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="star-movie-observation fixed inset-0 z-[90] overflow-y-auto overflow-x-hidden bg-night-950"
      onClick={handleBackdropClick}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="cosmic-background pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="cosmic-haze" />
        <div className="moon" />
        <div className="stars-layer" />
        <div className="distant-stars" />
      </div>
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,21,0.08)_45%,rgba(2,6,21,0.72)_100%)]"
        aria-hidden="true"
      />

      <div className="pointer-events-none fixed left-6 top-5 z-30 hidden lg:block">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-comet/70">star movie observation</p>
        <h2 className="mt-1 text-sm font-black text-white/85" id={titleId}>
          星映観測モード
        </h2>
      </div>
      <button
        aria-label="星映観測モードを閉じる"
        className="fixed right-6 top-5 z-40 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-night-950/45 text-xl text-white shadow-[0_12px_36px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-comet/40 hover:bg-comet/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/25"
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        ×
      </button>

      <div className="star-movie-observation-content relative z-10 mx-auto flex min-h-full flex-col justify-center px-6 py-20">
        <section className="star-movie-observation-stage relative mx-auto w-full min-w-0" aria-label="星映">
          <div className="star-movie-observation-glow pointer-events-none absolute overflow-hidden" aria-hidden="true">
            {media.posterUrl ? (
              <img
                alt=""
                className="h-full w-full scale-125 object-cover opacity-55 blur-[72px] saturate-150"
                src={media.posterUrl}
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_28%_30%,rgba(125,223,255,0.6),transparent_40%),radial-gradient(circle_at_76%_64%,rgba(255,139,207,0.48),transparent_44%),linear-gradient(135deg,rgba(30,50,120,0.78),rgba(79,38,125,0.68),rgba(10,16,45,0.74))] opacity-65 blur-[72px]" />
            )}
          </div>

          <div className="star-movie-observation-frame relative mx-auto aspect-video w-full overflow-hidden bg-black/90">
            {media.kind === "youtube" ? (
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full"
                referrerPolicy="strict-origin-when-cross-origin"
                src={`https://www.youtube-nocookie.com/embed/${media.videoId}?rel=0`}
                title={`${post.name}の星映`}
              />
            ) : (
              <video
                className="h-full w-full bg-black object-contain"
                controls
                onPlay={handleVideoPlay}
                playsInline
                poster={media.posterUrl ?? undefined}
                preload="metadata"
                ref={videoRef}
                src={media.src}
              />
            )}
          </div>
        </section>

        <section className="star-movie-observation-details mx-auto mt-7 w-full min-w-0 pt-6" aria-label="流星便の情報">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="flex min-w-0 items-start gap-3">
              {authorAvatar}
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-white">{post.name}</p>
                <p className="mt-1 truncate text-sm text-slate-400">
                  {post.handle} <span aria-hidden="true">·</span> {post.time}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ObservationActionButton
                disabled={isResonanceSaving || !resonance?.onResonate}
                icon="♡"
                label={isResonanceSaving ? "共鳴中..." : `${resonanceCount} 共鳴`}
                onClick={() => resonance?.onResonate?.(post.id)}
              />
              <ObservationActionButton
                active={isStarLettersOpen}
                disabled={!starLetters?.onToggle}
                icon="✎"
                label={`星文 ${postStarLetters.length}`}
                onClick={() => starLetters?.onToggle?.(post.id)}
              />
              <ObservationActionButton
                active={isArchived}
                disabled={isArchiveSaving || !archive?.onToggleArchive}
                icon="✦"
                label={isArchiveSaving ? "Archive中..." : isArchived ? "Archive済み" : "Archive"}
                onClick={() => archive?.onToggleArchive?.(post.id)}
              />
            </div>
          </div>

          {post.text ? (
            <p className="mt-5 max-w-4xl whitespace-pre-wrap break-words text-sm leading-7 text-slate-100">{body}</p>
          ) : null}

          {post.tags?.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="流星タグ">
              {post.tags.map((tag) => (
                <span
                  className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100"
                  key={tag.id ?? tag.normalizedName ?? tag.name}
                >
                  {tag.label || `#${tag.name}`}
                </span>
              ))}
            </div>
          ) : null}

          {starLettersPanel ? <div className="mt-5">{starLettersPanel}</div> : null}
        </section>
      </div>
    </div>
  );
}

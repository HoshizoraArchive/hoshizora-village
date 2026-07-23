import { useEffect, useRef } from "react";
import {
  getStarMovieObservationFocusTargetIndex,
  POST_INLINE_VIDEO_PLAY_EVENT,
  STAR_MOVIE_OBSERVATION_MEDIA_QUERY,
} from "./starMovieObservation";
import StarMovieObservationWindow from "./StarMovieObservationWindow";

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

export default function StarMovieObservationMode({ media, onClose, post }) {
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

      <h2 className="sr-only" id={titleId}>
        星映観測モード
      </h2>
      <button
        aria-label="星映観測モードを閉じる"
        className="fixed right-6 top-5 z-40 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-night-950/45 text-xl text-white shadow-[0_12px_36px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-comet/40 hover:bg-comet/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/25"
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        ×
      </button>

      <div className="star-movie-observation-content relative z-10 mx-auto flex min-h-full flex-col justify-center px-6 py-16">
        <section className="star-movie-observation-stage relative mx-auto w-full min-w-0" aria-label="星映">
          <div
            className={`star-movie-observation-media relative mx-auto ${
              media.kind === "youtube" ? "w-full" : "w-fit max-w-full"
            }`}
          >
            <StarMovieObservationWindow mediaKind={media.kind}>
              {media.kind === "youtube" ? (
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="star-movie-surface h-full w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={`https://www.youtube-nocookie.com/embed/${media.videoId}?rel=0`}
                  title={`${post.name}の星映`}
                />
              ) : (
                <video
                  className="star-movie-observation-upload-video star-movie-surface block"
                  controls
                  onPlay={handleVideoPlay}
                  playsInline
                  poster={media.posterUrl ?? undefined}
                  preload="metadata"
                  ref={videoRef}
                  src={media.src}
                />
              )}
            </StarMovieObservationWindow>
          </div>
        </section>
      </div>
    </div>
  );
}

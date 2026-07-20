import { useEffect, useRef } from "react";
import {
  POST_INLINE_VIDEO_PLAY_EVENT,
  STAR_MOVIE_OBSERVATION_MEDIA_QUERY,
} from "./starMovieObservation";

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
    desktopQuery.addEventListener?.("change", handleViewportChange);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
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
      className="star-movie-observation fixed inset-0 z-[90] overflow-y-auto overflow-x-hidden bg-night-950/88 px-5 py-5 backdrop-blur-xl lg:px-8 lg:py-7"
      onClick={handleBackdropClick}
      role="dialog"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(125,223,255,0.12),transparent_30%),radial-gradient(circle_at_82%_20%,rgba(255,139,207,0.1),transparent_34%),linear-gradient(155deg,rgba(2,6,21,0.28),rgba(17,17,60,0.35),rgba(38,11,49,0.42))]" />

      <div className="relative mx-auto flex min-h-full w-full max-w-[1480px] flex-col">
        <header className="sticky top-0 z-30 mb-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-night-950/80 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-comet">star movie observation</p>
            <h2 className="truncate text-base font-black text-white" id={titleId}>
              星映観測モード
            </h2>
          </div>
          <button
            aria-label="星映観測モードを閉じる"
            className="grid h-11 w-11 flex-none place-items-center rounded-full border border-white/15 bg-white/5 text-xl text-white transition hover:border-comet/40 hover:bg-comet/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/25"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,410px)] xl:gap-7">
          <section className="relative min-w-0 self-center" aria-label="星映">
            <div className="star-movie-observation-glow pointer-events-none absolute -inset-[10%] overflow-hidden" aria-hidden="true">
              {media.posterUrl ? (
                <img
                  alt=""
                  className="h-full w-full scale-110 object-cover opacity-40 blur-3xl saturate-150"
                  src={media.posterUrl}
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_28%_30%,rgba(125,223,255,0.55),transparent_40%),radial-gradient(circle_at_76%_64%,rgba(255,139,207,0.46),transparent_44%),linear-gradient(135deg,rgba(30,50,120,0.72),rgba(79,38,125,0.64),rgba(10,16,45,0.7))] opacity-55 blur-3xl" />
              )}
            </div>

            <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_30px_100px_rgba(0,0,0,0.5),0_0_70px_rgba(125,223,255,0.12)]">
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

          <aside className="min-w-0 rounded-2xl border border-white/10 bg-night-950/58 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
            <div className="flex items-start gap-3">
              {authorAvatar}
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-white">{post.name}</p>
                <p className="mt-1 truncate text-sm text-slate-400">
                  {post.handle} <span aria-hidden="true">·</span> {post.time}
                </p>
              </div>
            </div>

            {post.text ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-100">{body}</p>
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

            <div className="mt-5 flex flex-wrap gap-2">
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

            {starLettersPanel}
          </aside>
        </div>
      </div>
    </div>
  );
}

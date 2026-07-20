export const POST_INLINE_VIDEO_PLAY_EVENT = "hoshizora-village:inline-video-play";
export const STAR_MOVIE_OBSERVATION_MEDIA_QUERY = "(min-width: 1024px)";
export const STAR_MOVIE_OBSERVATION_HISTORY_KEY = "hoshizoraStarMovieObservation";

export function getStarMovieObservationFocusTargetIndex({
  activeIndex,
  focusableCount,
  shiftKey = false,
}) {
  if (!Number.isInteger(focusableCount) || focusableCount <= 0) {
    return -1;
  }

  if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= focusableCount) {
    return shiftKey ? focusableCount - 1 : 0;
  }

  if (shiftKey && activeIndex === 0) {
    return focusableCount - 1;
  }

  if (!shiftKey && activeIndex === focusableCount - 1) {
    return 0;
  }

  return null;
}

export function isStarMovieObservationViewport(matchMedia = globalThis.window?.matchMedia?.bind(globalThis.window)) {
  return Boolean(matchMedia?.(STAR_MOVIE_OBSERVATION_MEDIA_QUERY).matches);
}

export function createStarMovieObservationHistoryState(currentState, observationId) {
  return {
    ...(currentState && typeof currentState === "object" ? currentState : {}),
    [STAR_MOVIE_OBSERVATION_HISTORY_KEY]: observationId,
  };
}

export function isStarMovieObservationHistoryState(historyState, observationId) {
  return Boolean(
    observationId &&
      historyState &&
      historyState[STAR_MOVIE_OBSERVATION_HISTORY_KEY] === observationId,
  );
}

export function createUploadMovieObservationMedia(item) {
  if (!item?.url || item.mediaType !== "video") {
    return null;
  }

  return {
    id: item.id ?? item.storagePath ?? item.url,
    kind: "upload",
    posterUrl: item.thumbnailUrl ?? null,
    src: item.url,
  };
}

export function createYouTubeMovieObservationMedia(videoId) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId ?? ""))) {
    return null;
  }

  return {
    id: `youtube:${videoId}`,
    kind: "youtube",
    posterUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    videoId,
  };
}

export const OBSERVE_PULL_REFRESH_THRESHOLD_PX = 76;
export const OBSERVE_PULL_REFRESH_MAX_DISTANCE_PX = 112;
export const OBSERVE_PULL_REFRESH_TOP_TOLERANCE_PX = 2;
export const OBSERVE_TIMELINE_POLL_INTERVAL_MS = 45_000;

export function getObservePullGesture({
  currentX,
  currentY,
  interactiveTarget = false,
  scrollY = 0,
  startX,
  startY,
}) {
  const horizontalDistance = Math.abs(Number(currentX) - Number(startX));
  const verticalDistance = Number(currentY) - Number(startY);

  if (
    interactiveTarget ||
    Number(scrollY) > OBSERVE_PULL_REFRESH_TOP_TOLERANCE_PX ||
    verticalDistance <= 0 ||
    horizontalDistance >= verticalDistance
  ) {
    return { distance: 0, ready: false };
  }

  return {
    distance: Math.min(verticalDistance, OBSERVE_PULL_REFRESH_MAX_DISTANCE_PX),
    ready: verticalDistance >= OBSERVE_PULL_REFRESH_THRESHOLD_PX,
  };
}

export function shouldTriggerObservePullRefresh({ gesture, refreshing = false, triggered = false }) {
  return Boolean(gesture?.ready && !refreshing && !triggered);
}

export function isInteractiveObserveTimelineTarget(target) {
  return Boolean(target?.closest?.("a, button, input, textarea, select, label, video, iframe, [contenteditable='true']"));
}

export async function runObserveTimelineSingleFlight(inFlightRef, operation) {
  if (inFlightRef.current) {
    return false;
  }

  inFlightRef.current = true;

  try {
    return await operation();
  } finally {
    inFlightRef.current = false;
  }
}

export function isUnseenPublicTimelinePost(post, knownPostIds) {
  return Boolean(
    post?.id &&
      post.visibility === "public" &&
      !post.deleted_at &&
      !knownPostIds?.has(post.id),
  );
}

export function isPublicPostNewer(candidate, currentTopPost) {
  if (!candidate?.id || !currentTopPost?.id || candidate.id === currentTopPost.id) {
    return false;
  }

  const candidateTime = Date.parse(candidate.created_at ?? candidate.createdAt ?? "");
  const currentTime = Date.parse(currentTopPost.created_at ?? currentTopPost.createdAt ?? "");

  if (!Number.isFinite(candidateTime) || !Number.isFinite(currentTime)) {
    return false;
  }

  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }

  return String(candidate.id) > String(currentTopPost.id);
}

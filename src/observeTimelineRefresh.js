export const OBSERVE_PULL_REFRESH_THRESHOLD_PX = 76;
export const OBSERVE_PULL_REFRESH_MAX_DISTANCE_PX = 112;
export const OBSERVE_PULL_REFRESH_TOP_TOLERANCE_PX = 2;
export const OBSERVE_TIMELINE_POLL_INTERVAL_MS = 45_000;
export const OBSERVE_REFRESH_TIMEOUT_MS = 15_000;

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

export function shouldTriggerObservePullRefresh({
  allowQueued = false,
  gesture,
  refreshing = false,
  triggered = false,
}) {
  return Boolean(gesture?.ready && (!refreshing || allowQueued) && !triggered);
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

async function runAbortableOperation(operation, context, timeoutMs) {
  let timeoutId = null;
  const operationPromise = Promise.resolve()
    .then(() => operation(context))
    .catch((error) => {
      if (context.signal.aborted) {
        return false;
      }

      throw error;
    });
  const aborted = new Promise((resolve) => {
    context.signal.addEventListener("abort", () => resolve(false), { once: true });
  });

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => context.controller.abort("refresh-timeout"), timeoutMs);
  }

  try {
    return await Promise.race([operationPromise, aborted]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export function runLatestQueuedOperation(
  queueRef,
  operation,
  { timeoutMs = OBSERVE_REFRESH_TIMEOUT_MS } = {},
) {
  const queue = queueRef.current ?? {
    activeController: null,
    generation: 0,
    pendingOperation: null,
    promise: null,
  };
  queueRef.current = queue;
  queue.generation = Number.isSafeInteger(queue.generation) ? queue.generation : 0;
  queue.activeController ??= null;

  if (queue.promise) {
    queue.pendingOperation = operation;
    queue.activeController?.abort("newer-refresh-queued");
    return queue.promise;
  }

  const run = async () => {
    let result = false;
    let nextOperation = operation;

    while (nextOperation) {
      const currentOperation = nextOperation;
      queue.pendingOperation = null;
      const generation = queue.generation + 1;
      queue.generation = generation;
      const controller = new AbortController();
      queue.activeController = controller;
      result = await runAbortableOperation(
        currentOperation,
        {
          controller,
          generation,
          isCurrent: () => queue.generation === generation && !controller.signal.aborted,
          shouldFinish: () =>
            queue.generation === generation && queue.pendingOperation === null,
          signal: controller.signal,
        },
        timeoutMs,
      );

      if (queue.activeController === controller) {
        queue.activeController = null;
      }
      nextOperation = queue.pendingOperation;
    }

    return result;
  };
  const trackedPromise = run().finally(() => {
    if (queue.promise === trackedPromise) {
      queue.promise = null;
      queue.activeController = null;
    }
  });

  queue.promise = trackedPromise;
  return trackedPromise;
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

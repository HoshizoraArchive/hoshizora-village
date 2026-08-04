export const APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS = 350;

export function shouldRefreshAfterForeground({
  hiddenAt,
  now = Date.now(),
  visibilityState = "visible",
} = {}) {
  const hiddenAtNumber = Number(hiddenAt);
  const nowNumber = Number(now);

  if (
    visibilityState !== "visible" ||
    !Number.isFinite(hiddenAtNumber) ||
    !Number.isFinite(nowNumber) ||
    nowNumber - hiddenAtNumber < APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS
  ) {
    return false;
  }

  return true;
}

// The posts endpoint does not own engagement state. Keep the latest resonance
// count while replacing the fields that were actually refreshed from posts.
export function reconcileRefreshedPosts(
  currentPosts = [],
  refreshedPosts = [],
  resonanceCountsByPost = new Map(),
) {
  const currentById = new Map(currentPosts.map((post) => [post?.id, post]));

  return refreshedPosts.map((post) => {
    const currentPost = currentById.get(post?.id);
    const knownCount = resonanceCountsByPost.has(post?.id)
      ? resonanceCountsByPost.get(post.id)
      : currentPost?.resonanceCount;
    const currentCount = Number(knownCount);

    if (!Number.isFinite(currentCount) || currentCount < 0) {
      return post;
    }

    return {
      ...post,
      resonanceCount: currentCount,
    };
  });
}

export function createEntityRequestVersionStore() {
  const currentTokens = new Map();

  function issue(entityId) {
    if (!entityId) {
      return null;
    }

    const token = {};
    currentTokens.set(entityId, token);
    return token;
  }

  return {
    begin(entityIds = []) {
      const requestTokens = new Map();

      for (const entityId of new Set(entityIds.filter(Boolean))) {
        requestTokens.set(entityId, issue(entityId));
      }

      return requestTokens;
    },
    invalidate(entityId) {
      return issue(entityId);
    },
    isCurrent(requestTokens, entityId) {
      return Boolean(
        entityId &&
          requestTokens instanceof Map &&
          requestTokens.has(entityId) &&
          currentTokens.has(entityId) &&
          requestTokens.get(entityId) === currentTokens.get(entityId),
      );
    },
  };
}

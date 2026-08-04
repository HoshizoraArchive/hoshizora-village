export const APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS = 350;

const REVISION_COMPONENTS = [
  "domainRevision",
  "viewerRevision",
  "viewerContextRevision",
];

function parseRevision(value) {
  if (typeof value === "bigint") {
    return value >= 0n ? value : null;
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }

  return null;
}

export function normalizeDataRevision(value, fallback = "0") {
  return (parseRevision(value) ?? parseRevision(fallback) ?? 0n).toString();
}

export function normalizeRevisionVector(version = {}) {
  return {
    epoch: typeof version.epoch === "string" && version.epoch ? version.epoch : null,
    domainRevision: normalizeDataRevision(version.domainRevision),
    viewerRevision: normalizeDataRevision(version.viewerRevision),
    viewerContextRevision: normalizeDataRevision(version.viewerContextRevision),
  };
}

// A viewer projection is a version vector, not a scalar. A response is stale
// when any component moves backwards. This deliberately accepts equal vectors
// so the same canonical entity can be projected into a view mounted later.
export function canApplyRevisionVector(currentVersion, incomingVersion) {
  if (!incomingVersion) {
    return false;
  }

  const incoming = normalizeRevisionVector(incomingVersion);

  if (!currentVersion) {
    return Boolean(incoming.epoch);
  }

  const current = normalizeRevisionVector(currentVersion);

  if (!incoming.epoch || incoming.epoch !== current.epoch) {
    return false;
  }

  return REVISION_COMPONENTS.every(
    (component) => parseRevision(incoming[component]) >= parseRevision(current[component]),
  );
}

export function isRevisionComponentBehind(
  currentVersion,
  incomingVersion,
  component,
) {
  if (
    !currentVersion ||
    !incomingVersion ||
    !REVISION_COMPONENTS.includes(component)
  ) {
    return false;
  }

  const current = normalizeRevisionVector(currentVersion);
  const incoming = normalizeRevisionVector(incomingVersion);

  if (!incoming.epoch || incoming.epoch !== current.epoch) {
    return false;
  }

  return parseRevision(incoming[component]) < parseRevision(current[component]);
}

export function createEntityRevisionStore() {
  let epoch = null;
  let sessionKey = null;
  let viewerContextFloor = 0n;
  const versions = new Map();

  function withViewerContextFloor(version) {
    if (!version) {
      return null;
    }

    const normalized = normalizeRevisionVector(version);
    return {
      ...normalized,
      viewerContextRevision: (
        parseRevision(normalized.viewerContextRevision) > viewerContextFloor
          ? parseRevision(normalized.viewerContextRevision)
          : viewerContextFloor
      ).toString(),
    };
  }

  function getEffectiveVersion(entityId) {
    const stored = versions.get(entityId);

    if (stored) {
      return withViewerContextFloor(stored);
    }

    if (!epoch || viewerContextFloor === 0n) {
      return null;
    }

    return {
      epoch,
      domainRevision: "0",
      viewerRevision: "0",
      viewerContextRevision: viewerContextFloor.toString(),
    };
  }

  function acceptEpoch(incoming) {
    if (!incoming.epoch) {
      return false;
    }

    if (epoch === null) {
      epoch = incoming.epoch;
      return true;
    }

    return epoch === incoming.epoch;
  }

  return {
    beginSession(nextSessionKey) {
      if (sessionKey === nextSessionKey) {
        return;
      }

      sessionKey = nextSessionKey ?? null;
      epoch = null;
      viewerContextFloor = 0n;
      versions.clear();
    },
    clear() {
      epoch = null;
      viewerContextFloor = 0n;
      versions.clear();
    },
    get(entityId) {
      return getEffectiveVersion(entityId);
    },
    has(entityId) {
      return versions.has(entityId);
    },
    apply(entityId, incomingVersion, expectedSessionKey = sessionKey) {
      if (!entityId || expectedSessionKey !== sessionKey) {
        return false;
      }

      const incoming = normalizeRevisionVector(incomingVersion);

      if (!acceptEpoch(incoming)) {
        return false;
      }

      if (parseRevision(incoming.viewerContextRevision) < viewerContextFloor) {
        return false;
      }

      const current = getEffectiveVersion(entityId);

      if (!canApplyRevisionVector(current, incoming)) {
        return false;
      }

      versions.set(entityId, incoming);
      return true;
    },
    applyMutation(
      entityId,
      incomingVersion,
      ownedComponents = ["domainRevision"],
      expectedSessionKey = sessionKey,
    ) {
      if (!entityId || expectedSessionKey !== sessionKey) {
        return false;
      }

      const incoming = normalizeRevisionVector(incomingVersion);

      if (!acceptEpoch(incoming)) {
        return false;
      }

      const current = getEffectiveVersion(entityId);
      const owned = ownedComponents.filter((component) =>
        REVISION_COMPONENTS.includes(component),
      );

      if (
        current &&
        owned.some(
          (component) =>
            parseRevision(incoming[component]) < parseRevision(current[component]),
        )
      ) {
        return false;
      }

      const merged = current
        ? {
            ...incoming,
            ...Object.fromEntries(
              REVISION_COMPONENTS.map((component) => [
                component,
                (
                  parseRevision(incoming[component]) > parseRevision(current[component])
                    ? parseRevision(incoming[component])
                    : parseRevision(current[component])
                ).toString(),
              ]),
            ),
          }
        : incoming;

      versions.set(entityId, merged);
      return true;
    },
    advanceViewerContext(incomingVersion, expectedSessionKey = sessionKey) {
      if (expectedSessionKey !== sessionKey) {
        return false;
      }

      const incomingFloor = parseRevision(incomingVersion?.viewerContextRevision);

      if (incomingFloor === null) {
        return false;
      }

      const incoming = normalizeRevisionVector(incomingVersion);

      if (!acceptEpoch(incoming)) {
        return false;
      }

      if (incomingFloor < viewerContextFloor) {
        return false;
      }

      viewerContextFloor = incomingFloor;
      return true;
    },
    sessionKey() {
      return sessionKey;
    },
  };
}

export function getPostContentVersion(post) {
  return {
    epoch: post?.revisionEpoch ?? post?.revision_epoch ?? null,
    domainRevision: post?.contentRevision ?? post?.content_revision ?? 0,
    viewerContextRevision:
      post?.viewerContextRevision ?? post?.viewer_context_revision ?? 0,
  };
}

export function getPostAssetsVersion(post) {
  return {
    epoch: post?.revisionEpoch ?? post?.revision_epoch ?? null,
    domainRevision: post?.assetsRevision ?? post?.assets_revision ?? 0,
    viewerContextRevision:
      post?.viewerContextRevision ?? post?.viewer_context_revision ?? 0,
  };
}

export function getEngagementVersion(snapshot, kind) {
  const isArchive = kind === "archive";

  return {
    epoch: snapshot?.revisionEpoch ?? snapshot?.revision_epoch ?? null,
    domainRevision: isArchive
      ? snapshot?.archiveRevision ?? snapshot?.archive_revision ?? 0
      : snapshot?.resonanceRevision ?? snapshot?.resonance_revision ?? 0,
    viewerContextRevision:
      snapshot?.viewerContextRevision ?? snapshot?.viewer_context_revision ?? 0,
  };
}

export function getStarThreadVersion(snapshot) {
  return {
    epoch: snapshot?.revisionEpoch ?? snapshot?.revision_epoch ?? null,
    domainRevision:
      snapshot?.threadRevision ?? snapshot?.thread_revision ?? 0,
    viewerRevision:
      snapshot?.viewerRevision ?? snapshot?.viewer_revision ?? 0,
    viewerContextRevision:
      snapshot?.viewerContextRevision ?? snapshot?.viewer_context_revision ?? 0,
  };
}

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
  {
    contentRevisionStore = null,
    assetsRevisionStore = null,
    expectedSessionKey = contentRevisionStore?.sessionKey?.(),
    locallyCreatedPostIds = new Set(),
  } = {},
) {
  const currentById = new Map(currentPosts.map((post) => [post?.id, post]));
  const refreshedIds = new Set();
  const nextPosts = [];

  for (const post of refreshedPosts) {
    if (!post?.id) {
      continue;
    }

    refreshedIds.add(post.id);
    const currentPost = currentById.get(post?.id);
    const hasVersion = Boolean(getPostContentVersion(post).epoch);

    const canApplyContent =
      !contentRevisionStore ||
      !hasVersion ||
      contentRevisionStore.apply(post.id, getPostContentVersion(post), expectedSessionKey);

    const canApplyAssets =
      !assetsRevisionStore ||
      !hasVersion ||
      assetsRevisionStore.apply(post.id, getPostAssetsVersion(post), expectedSessionKey);

    if (!canApplyContent && !currentPost) {
      continue;
    }

    if (canApplyContent && (post.tombstoned || post.available === false)) {
      continue;
    }

    const knownCount = resonanceCountsByPost.has(post?.id)
      ? resonanceCountsByPost.get(post.id)
      : currentPost?.resonanceCount;
    const currentCount = Number(knownCount);
    const nextPost = canApplyContent ? { ...post } : { ...currentPost };
    const assetFieldNames = [
      "assetsRevision",
      "assets_revision",
      "assetMediaRows",
      "assetTagRows",
      "media",
      "mediaLoaded",
      "tags",
      "tagsLoaded",
    ];

    if (canApplyAssets && !canApplyContent) {
      for (const fieldName of assetFieldNames) {
        if (Object.prototype.hasOwnProperty.call(post, fieldName)) {
          nextPost[fieldName] = post[fieldName];
        }
      }
    } else if (!canApplyAssets && canApplyContent && currentPost) {
      for (const fieldName of assetFieldNames) {
        if (Object.prototype.hasOwnProperty.call(currentPost, fieldName)) {
          nextPost[fieldName] = currentPost[fieldName];
        } else {
          delete nextPost[fieldName];
        }
      }
    }
    const ownsMedia = Object.prototype.hasOwnProperty.call(post, "media");
    const ownsTags = Object.prototype.hasOwnProperty.call(post, "tags");

    if (post.mediaLoaded === false || !canApplyAssets || !ownsMedia) {
      if (Object.prototype.hasOwnProperty.call(currentPost ?? {}, "media")) {
        nextPost.media = currentPost.media;
      } else if (!ownsMedia) {
        delete nextPost.media;
      }
    }

    if (post.tagsLoaded === false || !canApplyAssets || !ownsTags) {
      if (Object.prototype.hasOwnProperty.call(currentPost ?? {}, "tags")) {
        nextPost.tags = currentPost.tags;
      } else if (!ownsTags) {
        delete nextPost.tags;
      }
    }

    if (!Number.isFinite(currentCount) || currentCount < 0) {
      nextPosts.push(nextPost);
      continue;
    }

    nextPosts.push({
      ...nextPost,
      resonanceCount: currentCount,
    });
  }

  for (const currentPost of currentPosts) {
    if (
      currentPost?.id &&
      !refreshedIds.has(currentPost.id) &&
      locallyCreatedPostIds.has(currentPost.id)
    ) {
      nextPosts.push(currentPost);
    }
  }

  return nextPosts;
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
    clear() {
      currentTokens.clear();
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

function getPostIdentity(post) {
  return post?.post_id ?? post?.id ?? null;
}

export function orderPostsWithPinnedFirst(posts, pinnedPostId, limit = 30) {
  const normalizedPinnedPostId = pinnedPostId ? String(pinnedPostId) : "";

  return [...(posts ?? [])]
    .sort((left, right) => {
      const leftPinned = Boolean(
        normalizedPinnedPostId && String(getPostIdentity(left) ?? "") === normalizedPinnedPostId,
      );
      const rightPinned = Boolean(
        normalizedPinnedPostId && String(getPostIdentity(right) ?? "") === normalizedPinnedPostId,
      );

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      const timeDifference = Date.parse(right?.created_at ?? "") - Date.parse(left?.created_at ?? "");

      if (Number.isFinite(timeDifference) && timeDifference !== 0) {
        return timeDifference;
      }

      return String(getPostIdentity(right) ?? "").localeCompare(String(getPostIdentity(left) ?? ""));
    })
    .slice(0, Math.max(0, limit));
}

export function isPinnedPost(post, pinnedPostId) {
  if (!pinnedPostId) {
    return false;
  }

  return String(getPostIdentity(post) ?? "") === String(pinnedPostId);
}

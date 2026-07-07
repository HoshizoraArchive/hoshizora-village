export const HOSHIZORA_HOSHIKUN_USERNAMES = new Set(["hoshizora_hoshikun"]);

export function getAutomaticChiaObservationEligibility({ userId, post, profile, operatorUserIds }) {
  const normalizedUserId = typeof userId === "string" ? userId.toLowerCase() : "";
  const postAuthorId = typeof post?.author_id === "string" ? post.author_id.toLowerCase() : "";
  const profileId = typeof profile?.id === "string" ? profile.id.toLowerCase() : "";
  const profileUsername = typeof profile?.username === "string" ? profile.username.trim().toLowerCase() : "";

  if (!normalizedUserId || postAuthorId !== normalizedUserId || profileId !== normalizedUserId) {
    return { eligible: false, reason: "not_author" };
  }

  if (post?.type !== "text") {
    return { eligible: false, reason: "unsupported_type" };
  }

  if (operatorUserIds?.has?.(normalizedUserId)) {
    return { eligible: true, reason: "operator" };
  }

  if (HOSHIZORA_HOSHIKUN_USERNAMES.has(profileUsername)) {
    return { eligible: true, reason: "hoshizora_hoshikun" };
  }

  return { eligible: false, reason: "not_allowed" };
}

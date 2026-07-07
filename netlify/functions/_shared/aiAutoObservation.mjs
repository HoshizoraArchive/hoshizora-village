import { randomInt } from "node:crypto";

export function getAutomaticChiaObservationEligibility({ userId, post, profile }) {
  const normalizedUserId = typeof userId === "string" ? userId.toLowerCase() : "";
  const postAuthorId = typeof post?.author_id === "string" ? post.author_id.toLowerCase() : "";
  const profileId = typeof profile?.id === "string" ? profile.id.toLowerCase() : "";

  if (!normalizedUserId || postAuthorId !== normalizedUserId || profileId !== normalizedUserId) {
    return { eligible: false, reason: "not_author" };
  }

  if (post?.type !== "text") {
    return { eligible: false, reason: "unsupported_type" };
  }

  return { eligible: true, reason: "public_text_author" };
}

export function pickAutoObservationDelaySeconds({
  minDelaySeconds,
  maxDelaySeconds,
  randomInteger = randomInt,
}) {
  if (
    !Number.isSafeInteger(minDelaySeconds) ||
    !Number.isSafeInteger(maxDelaySeconds) ||
    minDelaySeconds < 1 ||
    maxDelaySeconds < minDelaySeconds
  ) {
    throw new Error("invalid_auto_observation_delay");
  }

  return randomInteger(minDelaySeconds, maxDelaySeconds + 1);
}

export function buildAutoObservationNotBeforeAt({
  now = new Date(),
  minDelaySeconds,
  maxDelaySeconds,
  randomInteger,
}) {
  const delaySeconds = pickAutoObservationDelaySeconds({
    minDelaySeconds,
    maxDelaySeconds,
    randomInteger,
  });

  return new Date(now.getTime() + delaySeconds * 1000);
}

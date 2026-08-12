import { randomInt } from "node:crypto";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

const FIRST_POST_WELCOME_TYPES = new Set(["text", "image", "video", "youtube"]);
const AUTO_OBSERVATION_TYPES = new Set(["text", "image", "video", "youtube"]);

export function getAutomaticChiaObservationEligibility({
  userId,
  post,
  profile,
  isFirstPostWelcome = false,
}) {
  const normalizedUserId = typeof userId === "string" ? userId.toLowerCase() : "";
  const postAuthorId = typeof post?.author_id === "string" ? post.author_id.toLowerCase() : "";
  const profileId = typeof profile?.id === "string" ? profile.id.toLowerCase() : "";

  if (!normalizedUserId || postAuthorId !== normalizedUserId || profileId !== normalizedUserId) {
    return { eligible: false, reason: "not_author" };
  }

  if (isFirstPostWelcome && FIRST_POST_WELCOME_TYPES.has(post?.type)) {
    return {
      eligible: true,
      reason: "first_post_welcome",
      observationContext: AI_OBSERVATION_CONTEXT.FIRST_POST_WELCOME,
    };
  }

  if (!AUTO_OBSERVATION_TYPES.has(post?.type)) {
    return { eligible: false, reason: "unsupported_type" };
  }

  const reasonByType = {
    text: "public_text_author",
    image: "public_image_author",
    video: "public_video_author",
    youtube: "public_youtube_author",
  };

  return {
    eligible: true,
    reason: reasonByType[post.type],
    observationContext: AI_OBSERVATION_CONTEXT.AUTO_TEXT_POST,
  };
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

export { AUTO_OBSERVATION_TYPES, FIRST_POST_WELCOME_TYPES };

import { randomInt } from "node:crypto";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";

const FIRST_POST_WELCOME_TYPES = new Set(["text", "image", "video", "youtube"]);
const AUTO_OBSERVATION_TYPES = new Set(["text", "image", "video", "youtube"]);
const EARLY_BETA_DELAY_BANDS = Object.freeze([
  Object.freeze({ minDelaySeconds: 120, maxDelaySeconds: 180 }),
  Object.freeze({ minDelaySeconds: 480, maxDelaySeconds: 720 }),
  Object.freeze({ minDelaySeconds: 1500, maxDelaySeconds: 2100 }),
]);

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

function validateDelayRange({ minDelaySeconds, maxDelaySeconds }) {
  if (
    !Number.isSafeInteger(minDelaySeconds) ||
    !Number.isSafeInteger(maxDelaySeconds) ||
    minDelaySeconds < 1 ||
    maxDelaySeconds < minDelaySeconds
  ) {
    throw new Error("invalid_auto_observation_delay");
  }
}

function getActiveDelayBands({ minDelaySeconds, maxDelaySeconds }) {
  const bands = EARLY_BETA_DELAY_BANDS
    .map((band) => ({
      minDelaySeconds: Math.max(minDelaySeconds, band.minDelaySeconds),
      maxDelaySeconds: Math.min(maxDelaySeconds, band.maxDelaySeconds),
    }))
    .filter((band) => band.minDelaySeconds <= band.maxDelaySeconds);

  return bands.length > 0
    ? bands
    : [{ minDelaySeconds, maxDelaySeconds }];
}

export function pickAutoObservationDelaySeconds({
  minDelaySeconds,
  maxDelaySeconds,
  randomInteger = randomInt,
}) {
  validateDelayRange({ minDelaySeconds, maxDelaySeconds });

  const bands = getActiveDelayBands({ minDelaySeconds, maxDelaySeconds });
  const bandIndex = randomInteger(0, bands.length);
  const band = bands[bandIndex];

  if (!band) {
    throw new Error("invalid_auto_observation_delay");
  }

  return randomInteger(band.minDelaySeconds, band.maxDelaySeconds + 1);
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

export {
  AUTO_OBSERVATION_TYPES,
  EARLY_BETA_DELAY_BANDS,
  FIRST_POST_WELCOME_TYPES,
};

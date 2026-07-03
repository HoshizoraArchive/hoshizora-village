const OUTPUT_KEYS = new Set([
  "media_type",
  "visual_observation",
  "audio_observation",
  "lyric_observation",
  "key_moments",
  "confidence",
  "should_post",
  "star_letter",
]);
const MEDIA_TYPES = new Set(["text", "image", "audio", "video", "youtube"]);
const MAX_OBSERVATION_LENGTH = 1200;
const MAX_KEY_MOMENTS = 8;
const MAX_KEY_MOMENT_TIMESTAMP_LENGTH = 32;
const MAX_KEY_MOMENT_OBSERVATION_LENGTH = 240;
const STAR_LETTER_MIN_LENGTH = 30;
const STAR_LETTER_MAX_LENGTH = 80;

function isNullableString(value, maxLength) {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function hasOnlyAllowedKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function validateKeyMoment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (!hasOnlyAllowedKeys(value, new Set(["timestamp", "observation"]))) {
    return false;
  }

  return (
    typeof value.timestamp === "string" &&
    value.timestamp.length > 0 &&
    value.timestamp.length <= MAX_KEY_MOMENT_TIMESTAMP_LENGTH &&
    typeof value.observation === "string" &&
    value.observation.trim().length > 0 &&
    value.observation.length <= MAX_KEY_MOMENT_OBSERVATION_LENGTH
  );
}

export function validateAiObservationOutput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "not_object" };
  }

  if (!hasOnlyAllowedKeys(value, OUTPUT_KEYS)) {
    return { ok: false, code: "additional_properties" };
  }

  for (const key of OUTPUT_KEYS) {
    if (!(key in value)) {
      return { ok: false, code: `missing_${key}` };
    }
  }

  if (!MEDIA_TYPES.has(value.media_type)) {
    return { ok: false, code: "invalid_media_type" };
  }

  if (
    !isNullableString(value.visual_observation, MAX_OBSERVATION_LENGTH) ||
    !isNullableString(value.audio_observation, MAX_OBSERVATION_LENGTH) ||
    !isNullableString(value.lyric_observation, MAX_OBSERVATION_LENGTH)
  ) {
    return { ok: false, code: "invalid_observation_text" };
  }

  if (!Array.isArray(value.key_moments) || value.key_moments.length > MAX_KEY_MOMENTS) {
    return { ok: false, code: "invalid_key_moments" };
  }

  if (!value.key_moments.every(validateKeyMoment)) {
    return { ok: false, code: "invalid_key_moment" };
  }

  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) {
    return { ok: false, code: "invalid_confidence" };
  }

  if (typeof value.should_post !== "boolean") {
    return { ok: false, code: "invalid_should_post" };
  }

  if (value.star_letter !== null) {
    if (typeof value.star_letter !== "string") {
      return { ok: false, code: "invalid_star_letter" };
    }

    const length = Array.from(value.star_letter.trim()).length;

    if (length < STAR_LETTER_MIN_LENGTH || length > STAR_LETTER_MAX_LENGTH) {
      return { ok: false, code: "invalid_star_letter_length" };
    }
  }

  if (value.should_post && value.star_letter === null) {
    return { ok: false, code: "missing_star_letter_for_post" };
  }

  return { ok: true, value };
}

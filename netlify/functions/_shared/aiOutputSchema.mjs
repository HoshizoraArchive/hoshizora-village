const OUTPUT_KEYS = new Set([
  "media_type",
  "text_observation",
  "visual_observation",
  "audio_observation",
  "lyric_observation",
  "key_moments",
  "confidence",
  "should_post",
  "star_letter",
]);
const MEDIA_TYPES = new Set(["text", "image", "video", "youtube"]);
const MAX_OBSERVATION_LENGTH = 1200;
const MAX_KEY_MOMENTS = 8;
const MAX_KEY_MOMENT_TIMESTAMP_LENGTH = 32;
const MAX_KEY_MOMENT_OBSERVATION_LENGTH = 240;
const STAR_LETTER_MIN_LENGTH = 20;
const STAR_LETTER_MAX_LENGTH = 80;

function nullableStringSchema(maxLength) {
  return {
    anyOf: [
      { type: "string", maxLength },
      { type: "null" },
    ],
  };
}

export const AI_OBSERVATION_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    media_type: {
      type: "string",
      enum: [...MEDIA_TYPES],
    },
    text_observation: nullableStringSchema(MAX_OBSERVATION_LENGTH),
    visual_observation: nullableStringSchema(MAX_OBSERVATION_LENGTH),
    audio_observation: nullableStringSchema(MAX_OBSERVATION_LENGTH),
    lyric_observation: nullableStringSchema(MAX_OBSERVATION_LENGTH),
    key_moments: {
      type: "array",
      maxItems: MAX_KEY_MOMENTS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestamp: {
            type: "string",
            minLength: 1,
            maxLength: MAX_KEY_MOMENT_TIMESTAMP_LENGTH,
          },
          observation: {
            type: "string",
            minLength: 1,
            maxLength: MAX_KEY_MOMENT_OBSERVATION_LENGTH,
          },
        },
        required: ["timestamp", "observation"],
      },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    should_post: {
      type: "boolean",
    },
    star_letter: nullableStringSchema(STAR_LETTER_MAX_LENGTH),
  },
  required: [...OUTPUT_KEYS],
};

function isNullableString(value, maxLength) {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function hasOnlyAllowedKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isFilledString(value) {
  return typeof value === "string" && value.trim().length > 0;
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

function validateMinimumObservation(value) {
  if (value.media_type === "text" && !isFilledString(value.text_observation)) {
    return "missing_text_observation";
  }

  if (value.media_type === "image" && !isFilledString(value.visual_observation)) {
    return "missing_visual_observation";
  }

  if (
    (value.media_type === "video" || value.media_type === "youtube") &&
    !isFilledString(value.visual_observation) &&
    !isFilledString(value.audio_observation)
  ) {
    return "missing_video_observation";
  }

  return null;
}

export function parseAiObservationOutput(text) {
  if (typeof text !== "string") {
    return { ok: false, code: "not_json_text" };
  }

  try {
    return validateAiObservationOutput(JSON.parse(text));
  } catch {
    return { ok: false, code: "json_parse_failed" };
  }
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
    !isNullableString(value.text_observation, MAX_OBSERVATION_LENGTH) ||
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

    if (value.star_letter !== value.star_letter.trim() || /[\r\n]/.test(value.star_letter)) {
      return { ok: false, code: "invalid_star_letter_format" };
    }

    const length = Array.from(value.star_letter).length;

    if (length < STAR_LETTER_MIN_LENGTH || length > STAR_LETTER_MAX_LENGTH) {
      return { ok: false, code: "invalid_star_letter_length" };
    }
  }

  if (value.should_post && value.star_letter === null) {
    return { ok: false, code: "missing_star_letter_for_post" };
  }

  if (!value.should_post && value.star_letter !== null) {
    return { ok: false, code: "unexpected_star_letter_for_non_post" };
  }

  const minimumObservationError = validateMinimumObservation(value);

  if (minimumObservationError) {
    return { ok: false, code: minimumObservationError };
  }

  return { ok: true, value };
}

export { STAR_LETTER_MAX_LENGTH, STAR_LETTER_MIN_LENGTH };

export const AI_OBSERVATION_CONTEXT = Object.freeze({
  MANUAL: "manual",
  AUTO_TEXT_POST: "auto_text_post",
});

const ALLOWED_CONTEXTS = new Set(Object.values(AI_OBSERVATION_CONTEXT));

export function isAiObservationContext(value) {
  return ALLOWED_CONTEXTS.has(value);
}

export function normalizeAiObservationContext(value) {
  return isAiObservationContext(value) ? value : AI_OBSERVATION_CONTEXT.MANUAL;
}

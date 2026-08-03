export const PROFILE_NAME_AUTO_ADVANCE_DELAY_MS = 700;

const PROFILE_NAME_INPUT_SELECTOR = 'input[placeholder="名無しの観測者"]';
const PROFILE_NAME_STEP_SELECTOR = '[data-profile-guide-step="name"]';
const PROFILE_NAME_AUTO_ADVANCED_ATTRIBUTE = "data-onboarding-name-auto-advanced";

const pendingTimers = new WeakMap();
const composingInputs = new WeakSet();

export function shouldScheduleProfileNameAutoAdvance({
  hasAutoAdvanced = false,
  isComposing = false,
  isNameStep = false,
  value = "",
} = {}) {
  return Boolean(isNameStep && !hasAutoAdvanced && !isComposing && String(value).trim());
}

function isProfileNameInput(target) {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return target.matches(PROFILE_NAME_INPUT_SELECTOR);
}

function getActiveNameGuide() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector(PROFILE_NAME_STEP_SELECTOR);
}

function isNameGuideActiveForInput(input) {
  const guide = getActiveNameGuide();
  if (!guide || !input?.isConnected) {
    return false;
  }

  const editor = input.closest('[data-onboarding-target="profile-editor"], form');
  return Boolean(editor);
}

function clearPendingTimer(input) {
  const timerId = pendingTimers.get(input);
  if (timerId) {
    window.clearTimeout(timerId);
    pendingTimers.delete(input);
  }
}

function findNameNextButton() {
  const guide = getActiveNameGuide();
  if (!guide) {
    return null;
  }

  return [...guide.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "次へ" && !button.disabled,
  ) ?? null;
}

function scheduleNameAutoAdvance(input) {
  clearPendingTimer(input);

  const isNameStep = isNameGuideActiveForInput(input);
  const hasAutoAdvanced = input.hasAttribute(PROFILE_NAME_AUTO_ADVANCED_ATTRIBUTE);
  const isComposing = composingInputs.has(input);

  if (
    !shouldScheduleProfileNameAutoAdvance({
      hasAutoAdvanced,
      isComposing,
      isNameStep,
      value: input.value,
    })
  ) {
    return;
  }

  const valueSnapshot = input.value;
  const timerId = window.setTimeout(() => {
    pendingTimers.delete(input);

    if (
      composingInputs.has(input) ||
      input.hasAttribute(PROFILE_NAME_AUTO_ADVANCED_ATTRIBUTE) ||
      !isNameGuideActiveForInput(input) ||
      input.value !== valueSnapshot ||
      !input.value.trim()
    ) {
      return;
    }

    const nextButton = findNameNextButton();
    if (!nextButton) {
      return;
    }

    input.setAttribute(PROFILE_NAME_AUTO_ADVANCED_ATTRIBUTE, "true");
    nextButton.click();
  }, PROFILE_NAME_AUTO_ADVANCE_DELAY_MS);

  pendingTimers.set(input, timerId);
}

function handleProfileNameInput(event) {
  if (!isProfileNameInput(event.target)) {
    return;
  }

  scheduleNameAutoAdvance(event.target);
}

function handleCompositionStart(event) {
  if (!isProfileNameInput(event.target)) {
    return;
  }

  clearPendingTimer(event.target);
  composingInputs.add(event.target);
}

function handleCompositionEnd(event) {
  if (!isProfileNameInput(event.target)) {
    return;
  }

  composingInputs.delete(event.target);
  scheduleNameAutoAdvance(event.target);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("input", handleProfileNameInput, true);
  document.addEventListener("compositionstart", handleCompositionStart, true);
  document.addEventListener("compositionend", handleCompositionEnd, true);
}

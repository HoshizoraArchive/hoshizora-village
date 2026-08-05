const PROFILE_GUIDE_SELECTOR =
  '.onboarding-guide[data-onboarding-step="profile_setup"][data-profile-guide-step]';
const PROFILE_DIALOGUE_SELECTOR = ".onboarding-dialogue";
const GUIDE_CONTROL_SUPPRESS_MS = 350;
const AUTO_ADVANCE_DELAY_MS = 40;

const PROFILE_GUIDE_AUTO_ADVANCE_STEPS = Object.freeze({
  name: {
    actionLabel: "次へ",
    selector: 'input[placeholder="名無しの観測者"]',
  },
  username: {
    actionLabel: "このままでOK！",
    selector: 'input[placeholder="silent_creator"]',
  },
  bio: {
    actionLabel: "次へ",
    selector: 'textarea[placeholder^="まだ名前のない作品"]',
  },
  star_chart: {
    actionLabel: "次へ",
    selector: 'textarea[placeholder^="好きなもの"]',
  },
});

let suppressAutoAdvanceUntil = 0;
let pendingAdvanceTimerId = null;

export function shouldAutoAdvanceProfileGuide({
  step = "",
  value = "",
  suppressed = false,
} = {}) {
  return Boolean(
    PROFILE_GUIDE_AUTO_ADVANCE_STEPS[step] &&
      String(value).trim() &&
      !suppressed,
  );
}

function getActiveProfileGuide() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector(PROFILE_GUIDE_SELECTOR);
}

function findGuideActionButton(guide, label) {
  return (
    [...(guide?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.trim() === label && !button.disabled,
    ) ?? null
  );
}

function clearPendingAdvance() {
  if (pendingAdvanceTimerId === null || typeof window === "undefined") {
    return;
  }

  window.clearTimeout(pendingAdvanceTimerId);
  pendingAdvanceTimerId = null;
}

function scheduleProfileGuideAdvance(input, expectedStep) {
  if (typeof window === "undefined") {
    return;
  }

  clearPendingAdvance();
  pendingAdvanceTimerId = window.setTimeout(() => {
    pendingAdvanceTimerId = null;

    const guide = getActiveProfileGuide();
    const currentStep = guide?.getAttribute("data-profile-guide-step") ?? "";
    const definition = PROFILE_GUIDE_AUTO_ADVANCE_STEPS[expectedStep];
    const suppressed = Date.now() < suppressAutoAdvanceUntil;

    if (
      !guide ||
      currentStep !== expectedStep ||
      !definition ||
      !input?.isConnected ||
      !input.matches?.(definition.selector) ||
      !shouldAutoAdvanceProfileGuide({
        step: expectedStep,
        value: input.value,
        suppressed,
      })
    ) {
      return;
    }

    // Reuse InteractiveOnboarding's existing action button instead of creating a
    // second transition path. Its validation, locking and next-step logic remain
    // the single source of truth.
    findGuideActionButton(guide, definition.actionLabel)?.click();
  }, AUTO_ADVANCE_DELAY_MS);
}

function handleProfileFieldFocusOut(event) {
  const guide = getActiveProfileGuide();
  const currentStep = guide?.getAttribute("data-profile-guide-step") ?? "";
  const definition = PROFILE_GUIDE_AUTO_ADVANCE_STEPS[currentStep];
  const input = event.target;

  if (
    !guide ||
    !definition ||
    typeof Element === "undefined" ||
    !(input instanceof Element) ||
    !input.matches(definition.selector)
  ) {
    return;
  }

  scheduleProfileGuideAdvance(input, currentStep);
}

function handleGuidePointerDown(event) {
  const target = event.target;

  if (
    typeof Element === "undefined" ||
    !(target instanceof Element) ||
    !target.closest(PROFILE_DIALOGUE_SELECTOR) ||
    !getActiveProfileGuide()
  ) {
    return;
  }

  // When the user intentionally taps Back / Next / collapse / skip inside the
  // Chia dialogue, let that control own the transition. This prevents a blur of
  // the text field from racing the explicit button action.
  suppressAutoAdvanceUntil = Date.now() + GUIDE_CONTROL_SUPPRESS_MS;
  clearPendingAdvance();
}

function handleVisibilityChange() {
  if (document.visibilityState !== "visible") {
    clearPendingAdvance();
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("focusout", handleProfileFieldFocusOut, true);
  document.addEventListener("pointerdown", handleGuidePointerDown, true);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", clearPendingAdvance);
}

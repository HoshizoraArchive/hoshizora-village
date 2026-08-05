const PROFILE_GUIDE_SELECTOR =
  '.onboarding-guide[data-onboarding-step="profile_setup"][data-profile-guide-step]';
const PROFILE_DIALOGUE_SELECTOR = ".onboarding-dialogue";
const ONBOARDING_SKIP_ROOT_SELECTOR = "#hoshizora-onboarding-skip-all";
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

function isGuideControlTarget(target) {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(PROFILE_DIALOGUE_SELECTOR) ||
      target.closest(ONBOARDING_SKIP_ROOT_SELECTOR),
  );
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

function suppressGuideAutoAdvance() {
  suppressAutoAdvanceUntil = Date.now() + GUIDE_CONTROL_SUPPRESS_MS;
  clearPendingAdvance();
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

  // Keyboard users can move focus directly from an input to a guide control
  // without a pointerdown event. Treat that exactly like an intentional tap so
  // blur-driven auto advance never steals the explicit Back / Next / collapse /
  // skip action.
  if (isGuideControlTarget(event.relatedTarget)) {
    suppressGuideAutoAdvance();
    return;
  }

  scheduleProfileGuideAdvance(input, currentStep);
}

function handleGuidePointerDown(event) {
  if (!isGuideControlTarget(event.target) || !getActiveProfileGuide()) {
    return;
  }

  // When the user intentionally taps Back / Next / collapse / skip, let that
  // control own the transition. This prevents a blur of the text field from
  // racing the explicit button action, including the global "skip all" control.
  suppressGuideAutoAdvance();
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

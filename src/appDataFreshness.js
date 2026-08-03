export const OBSERVE_REFRESH_ACTIVE_TEXT = "✦ 流星便を観測中…";
export const APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS = 350;

export function normalizeActiveTabLabel(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function shouldRefreshForObserveStatus(value = "") {
  return normalizeActiveTabLabel(value) === OBSERVE_REFRESH_ACTIVE_TEXT;
}

export function shouldRefreshAfterForeground({
  hiddenAt,
  now = Date.now(),
  visibilityState = "visible",
  onboardingVisible = false,
  unsafeInteraction = false,
} = {}) {
  const hiddenAtNumber = Number(hiddenAt);
  const nowNumber = Number(now);

  if (
    visibilityState !== "visible" ||
    !Number.isFinite(hiddenAtNumber) ||
    !Number.isFinite(nowNumber) ||
    nowNumber - hiddenAtNumber < APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS
  ) {
    return false;
  }

  return !onboardingVisible && !unsafeInteraction;
}

export function shouldRestoreUiSnapshot({ beforeHref = "", afterHref = "" } = {}) {
  return Boolean(beforeHref && beforeHref === afterHref);
}

export const APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS = 350;

export function shouldRefreshAfterForeground({
  hiddenAt,
  now = Date.now(),
  visibilityState = "visible",
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

  return true;
}

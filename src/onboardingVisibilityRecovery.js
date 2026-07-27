import { supabase } from "./lib/supabaseClient";
import {
  ONBOARDING_PROGRESS_SELECT_COLUMNS,
  isOnboardingActive,
} from "./onboarding";

const GUIDE_RECOVERY_DELAY_MS = 1200;
const GUIDE_RELOAD_DELAY_MS = 2200;
const RECOVERY_STORAGE_PREFIX = "hoshizora-onboarding-recovery";
let recoveryTimerId = null;
let reloadTimerId = null;
let checkInFlight = false;

function findCollapsedGuideButton() {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "ちあの案内を見る",
  );
}

function hasVisibleOnboardingUi(step) {
  if (step === "welcome_video") {
    return Boolean(document.querySelector(".onboarding-welcome"));
  }

  return Boolean(document.querySelector(".onboarding-guide") || findCollapsedGuideButton());
}

function getRecoveryStorageKey(userId, step) {
  return `${RECOVERY_STORAGE_PREFIX}:${userId}:${step}`;
}

function hasReloadedForStep(storageKey) {
  try {
    return window.sessionStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function markReloadedForStep(storageKey) {
  try {
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // A blocked storage API must not prevent the normal onboarding flow.
  }
}

function clearReloadMarker(storageKey) {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Best-effort cleanup only.
  }
}

async function recoverOnboardingGuide() {
  if (checkInFlight || document.visibilityState === "hidden") {
    return;
  }

  checkInFlight = true;

  try {
    const collapsedButton = findCollapsedGuideButton();
    if (collapsedButton) {
      collapsedButton.click();
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      return;
    }

    const { data: progress, error } = await supabase
      .from("user_onboarding_progress")
      .select(ONBOARDING_PROGRESS_SELECT_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !isOnboardingActive(progress)) {
      return;
    }

    const storageKey = getRecoveryStorageKey(userId, progress.current_step);

    if (hasVisibleOnboardingUi(progress.current_step)) {
      clearReloadMarker(storageKey);
      return;
    }

    window.clearTimeout(reloadTimerId);
    reloadTimerId = window.setTimeout(() => {
      if (hasVisibleOnboardingUi(progress.current_step) || hasReloadedForStep(storageKey)) {
        return;
      }

      markReloadedForStep(storageKey);
      window.location.reload();
    }, GUIDE_RELOAD_DELAY_MS);
  } catch {
    // Recovery is best-effort. The normal React onboarding loader remains the source of truth.
  } finally {
    checkInFlight = false;
  }
}

function scheduleOnboardingRecovery() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.clearTimeout(recoveryTimerId);
  recoveryTimerId = window.setTimeout(() => {
    void recoverOnboardingGuide();
  }, GUIDE_RECOVERY_DELAY_MS);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("load", scheduleOnboardingRecovery);
  window.addEventListener("focus", scheduleOnboardingRecovery);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleOnboardingRecovery();
    }
  });
}

import { supabase } from "./lib/supabaseClient";
import {
  ONBOARDING_PROGRESS_SELECT_COLUMNS,
  isOnboardingActive,
} from "./onboarding";

const GUIDE_RECOVERY_DELAY_MS = 1200;
const GUIDE_RELOAD_DELAY_MS = 2200;
let recoveryTimerId = null;
let reloadTimerId = null;
let reloadAttempted = false;
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

    if (error || !isOnboardingActive(progress) || hasVisibleOnboardingUi(progress.current_step)) {
      reloadAttempted = false;
      return;
    }

    window.clearTimeout(reloadTimerId);
    reloadTimerId = window.setTimeout(() => {
      if (reloadAttempted || hasVisibleOnboardingUi(progress.current_step)) {
        return;
      }

      reloadAttempted = true;
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

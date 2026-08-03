import { supabase } from "./lib/supabaseClient";

const PROFILE_EDITOR_SELECTOR = '[data-onboarding-target="profile-editor"], form';
const PROFILE_NAME_SELECTOR = 'input[placeholder="名無しの観測者"]';
const PROFILE_USERNAME_SELECTOR = 'input[placeholder="silent_creator"]';
const PROFILE_BIO_SELECTOR = 'textarea[placeholder^="まだ名前のない作品"]';
const PROFILE_STAR_CHART_SELECTOR = 'textarea[placeholder^="好きなもの"]';
const PROFILE_TEXT_ENTRY_SELECTOR = [
  PROFILE_NAME_SELECTOR,
  PROFILE_USERNAME_SELECTOR,
  PROFILE_BIO_SELECTOR,
  PROFILE_STAR_CHART_SELECTOR,
].join(", ");
const PROFILE_SAVE_SUCCESS_TEXT = "プロフィールを保存しました。";

let profileSaveRequested = false;
let profileAdvanceInFlight = false;
let lastGuide = null;
let observer = null;
let observerTimerId = null;

export function shouldPinProfileGuideToTop({ isProfileTextEntry = false, isProfileSetup = false } = {}) {
  return Boolean(isProfileSetup && isProfileTextEntry);
}

export function isProfileSaveSuccessText(value) {
  return String(value ?? "").trim() === PROFILE_SAVE_SUCCESS_TEXT;
}

function getGuide() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector('.onboarding-guide[data-onboarding-step="profile_setup"]');
}

function getProfileEditor() {
  if (typeof document === "undefined") {
    return null;
  }

  const explicitEditor = document.querySelector('[data-onboarding-target="profile-editor"]');
  if (explicitEditor) {
    return explicitEditor;
  }

  return document.querySelector(PROFILE_NAME_SELECTOR)?.closest("form") ?? null;
}

function isProfileTextEntry(target) {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  const editor = getProfileEditor();
  return Boolean(editor?.contains(target) && target.matches(PROFILE_TEXT_ENTRY_SELECTOR));
}

function setKeyboardAvoidance(active) {
  const guide = getGuide();

  if (lastGuide && lastGuide !== guide) {
    lastGuide.removeAttribute("data-profile-keyboard-open");
  }

  lastGuide = guide;

  if (!guide) {
    return;
  }

  if (active) {
    guide.setAttribute("data-profile-keyboard-open", "true");
  } else {
    guide.removeAttribute("data-profile-keyboard-open");
  }
}

function handleFocusIn(event) {
  setKeyboardAvoidance(
    shouldPinProfileGuideToTop({
      isProfileSetup: Boolean(getGuide()),
      isProfileTextEntry: isProfileTextEntry(event.target),
    }),
  );
}

function handleFocusOut() {
  window.setTimeout(() => {
    setKeyboardAvoidance(isProfileTextEntry(document.activeElement));
  }, 0);
}

function handleSubmit(event) {
  const editor = getProfileEditor();

  if (!editor || event.target !== editor || !getGuide()) {
    return;
  }

  profileSaveRequested = true;
  profileAdvanceInFlight = false;
  scheduleProfileSaveCheck();
}

function hasProfileSaveSuccessMessage() {
  if (typeof document === "undefined") {
    return false;
  }

  return [...document.querySelectorAll('[role="status"], p, div')].some((node) => {
    if (node.children.length > 0) {
      return false;
    }

    return isProfileSaveSuccessText(node.textContent);
  });
}

async function readCurrentOnboardingProgress(userId) {
  const { data, error } = await supabase
    .from("user_onboarding_progress")
    .select("user_id, current_step")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data || data.user_id !== userId) {
    return null;
  }

  return data;
}

async function advanceProfileOnboardingAfterSave() {
  if (profileAdvanceInFlight || !profileSaveRequested || !hasProfileSaveSuccessMessage()) {
    return;
  }

  profileAdvanceInFlight = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      profileAdvanceInFlight = false;
      return;
    }

    const currentProgress = await readCurrentOnboardingProgress(userId);

    if (!currentProgress) {
      profileAdvanceInFlight = false;
      return;
    }

    if (currentProgress.current_step === "profile_success") {
      profileSaveRequested = false;
      window.location.reload();
      return;
    }

    if (currentProgress.current_step !== "profile_setup") {
      profileSaveRequested = false;
      profileAdvanceInFlight = false;
      return;
    }

    const { data, error } = await supabase.rpc("advance_initial_onboarding", {
      p_action: "profile_saved",
      p_status: null,
      p_target_id: null,
    });

    if (error) {
      profileAdvanceInFlight = false;
      return;
    }

    if (data?.outcome === "advanced" && data?.progress?.current_step === "profile_success") {
      profileSaveRequested = false;
      window.location.reload();
      return;
    }

    // The App may have advanced the same step first. Confirm the DB source of truth
    // before deciding whether this was a real failure.
    const refreshedProgress = await readCurrentOnboardingProgress(userId);

    if (refreshedProgress?.current_step === "profile_success") {
      profileSaveRequested = false;
      window.location.reload();
      return;
    }
  } catch {
    // The existing React onboarding remains the primary path. This bridge only
    // recovers the optional-avatar save path when it would otherwise stall.
  }

  profileAdvanceInFlight = false;
}

function scheduleProfileSaveCheck() {
  if (typeof window === "undefined") {
    return;
  }

  window.clearTimeout(observerTimerId);
  observerTimerId = window.setTimeout(() => {
    void advanceProfileOnboardingAfterSave();
  }, 40);
}

function startObserver() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined" || observer) {
    return;
  }

  observer = new MutationObserver(() => {
    if (profileSaveRequested) {
      scheduleProfileSaveCheck();
    }

    if (document.activeElement && isProfileTextEntry(document.activeElement)) {
      setKeyboardAvoidance(true);
    }
  });

  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("focusin", handleFocusIn, true);
  document.addEventListener("focusout", handleFocusOut, true);
  document.addEventListener("submit", handleSubmit, true);

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }
}

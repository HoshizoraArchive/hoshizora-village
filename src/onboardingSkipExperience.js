import { supabase } from "./lib/supabaseClient";

const SKIP_ROOT_ID = "hoshizora-onboarding-skip-all";
const ONBOARDING_SURFACE_SELECTOR = ".onboarding-welcome, .onboarding-guide";
const ONBOARDING_INLINE_HOST_SELECTOR = ".onboarding-dialogue, .onboarding-welcome section";
const COLLAPSED_GUIDE_LABEL = "ちあの案内を見る";
const SKIP_LABEL = "案内をすべてスキップ";
const SKIP_LOADING_LABEL = "案内を終了中...";
const SKIP_ERROR_MESSAGE = "案内を終了できませんでした。もう一度お試しください。";

let skipInFlight = false;
let scheduledSyncFrame = null;

export function hasActiveOnboardingSurface(root = document) {
  if (!root) {
    return false;
  }

  if (root.querySelector?.(ONBOARDING_SURFACE_SELECTOR)) {
    return true;
  }

  return [...(root.querySelectorAll?.("button") ?? [])].some(
    (button) => button.textContent?.trim() === COLLAPSED_GUIDE_LABEL,
  );
}

export function isSuccessfulOnboardingSkipResult(data) {
  return Boolean(
    data?.progress && ["advanced", "already_completed"].includes(data?.outcome),
  );
}

function getSkipRoot() {
  return document.getElementById(SKIP_ROOT_ID);
}

function getSkipHost() {
  return document.querySelector(ONBOARDING_INLINE_HOST_SELECTOR);
}

function setSkipError(message = "") {
  const root = getSkipRoot();
  const error = root?.querySelector('[data-onboarding-skip-all-error="true"]');

  if (!error) {
    return;
  }

  error.textContent = message;
  error.hidden = !message;
}

function setSkipButtonBusy(busy) {
  const button = getSkipRoot()?.querySelector("button");

  if (!button) {
    return;
  }

  button.disabled = busy;
  button.textContent = busy ? SKIP_LOADING_LABEL : SKIP_LABEL;
}

async function skipAllOnboarding() {
  if (skipInFlight) {
    return;
  }

  const confirmed = window.confirm(
    "ちあの入村案内をすべてスキップして、星空Villageを始めますか？\n\n案内はあとからMy Universeの「はじめての入村案内」で見返せます。",
  );

  if (!confirmed) {
    return;
  }

  skipInFlight = true;
  setSkipError("");
  setSkipButtonBusy(true);

  try {
    const { data, error } = await supabase.rpc("advance_initial_onboarding", {
      p_action: "skip_all",
      p_status: null,
      p_target_id: null,
    });

    if (error || !isSuccessfulOnboardingSkipResult(data)) {
      setSkipError(SKIP_ERROR_MESSAGE);
      return;
    }

    const root = getSkipRoot();
    if (root) {
      root.hidden = true;
    }
    window.location.reload();
  } catch {
    setSkipError(SKIP_ERROR_MESSAGE);
  } finally {
    skipInFlight = false;
    setSkipButtonBusy(false);
  }
}

function ensureSkipRoot() {
  let root = getSkipRoot();

  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = SKIP_ROOT_ID;
  root.hidden = true;
  root.className = "mt-2 border-t border-white/10 pt-2";

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "min-h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-black text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60";
  button.textContent = SKIP_LABEL;
  button.setAttribute("aria-label", "ちあの入村案内をすべてスキップ");
  button.addEventListener("click", () => void skipAllOnboarding());

  const helper = document.createElement("p");
  helper.className = "mt-1 text-center text-[9px] font-bold leading-4 text-slate-500";
  helper.textContent = "あとから「はじめての入村案内」で見返せます";

  const error = document.createElement("p");
  error.hidden = true;
  error.setAttribute("data-onboarding-skip-all-error", "true");
  error.className = "mt-1 text-center text-[10px] font-bold leading-4 text-sakura";

  root.append(button, helper, error);
  return root;
}

function synchronizeSkipVisibility() {
  const root = ensureSkipRoot();
  const host = getSkipHost();
  const active = hasActiveOnboardingSurface(document);

  if (active && host) {
    if (root.parentElement !== host) {
      host.append(root);
    }
    root.hidden = false;
    return;
  }

  root.hidden = true;
  setSkipError("");
}

function scheduleSkipVisibilitySync() {
  if (scheduledSyncFrame !== null) {
    return;
  }

  scheduledSyncFrame = window.requestAnimationFrame(() => {
    scheduledSyncFrame = null;
    synchronizeSkipVisibility();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(scheduleSkipVisibilitySync);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("pageshow", scheduleSkipVisibilitySync);
  window.addEventListener("focus", scheduleSkipVisibilitySync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleSkipVisibilitySync();
    }
  });

  scheduleSkipVisibilitySync();
}

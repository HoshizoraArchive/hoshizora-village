import { supabase } from "./lib/supabaseClient";

const APP_OPEN_DEDUPE_WINDOW_MS = 15_000;
const APP_FOREGROUND_MIN_HIDDEN_MS = 30_000;

let currentUserId = null;
let lastRecordedAtMs = 0;
let hiddenAtMs = document.visibilityState === "hidden" ? Date.now() : null;
let trackingStarted = false;

function getAppMode() {
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true;

  return isStandalone ? "standalone" : "browser";
}

function getPlatformKind() {
  const userAgent = window.navigator.userAgent || "";

  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "ios";
  }

  if (/Android/i.test(userAgent)) {
    return "android";
  }

  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/i.test(userAgent)) {
    return "desktop";
  }

  return "other";
}

async function recordAppOpen(source, clientOpenedAt = new Date()) {
  if (!currentUserId || document.visibilityState === "hidden") {
    return;
  }

  const nowMs = Date.now();
  if (nowMs - lastRecordedAtMs < APP_OPEN_DEDUPE_WINDOW_MS) {
    return;
  }

  // Set this before the request so auth/pageshow/visibility events racing together
  // cannot create duplicate rows for the same physical open.
  lastRecordedAtMs = nowMs;

  const { error } = await supabase.from("app_open_events").insert({
    user_id: currentUserId,
    source,
    app_mode: getAppMode(),
    platform: getPlatformKind(),
    client_opened_at: clientOpenedAt.toISOString(),
  });

  if (error) {
    console.warn("[app-open] Failed to record app open.", error.code ?? "unknown_error");
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    hiddenAtMs = Date.now();
    return;
  }

  if (hiddenAtMs === null) {
    return;
  }

  const hiddenDurationMs = Date.now() - hiddenAtMs;
  hiddenAtMs = null;

  if (hiddenDurationMs >= APP_FOREGROUND_MIN_HIDDEN_MS) {
    void recordAppOpen("foreground");
  }
}

function handlePageShow(event) {
  if (event.persisted) {
    void recordAppOpen("foreground");
  }
}

function applySession(session) {
  currentUserId = session?.user?.id ?? null;
}

export async function startAppOpenTracking() {
  if (trackingStarted) {
    return;
  }
  trackingStarted = true;

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[app-open] Failed to read auth session.", error.name ?? "session_error");
  }

  applySession(data?.session ?? null);

  if (currentUserId && document.visibilityState !== "hidden") {
    void recordAppOpen("launch");
  }

  supabase.auth.onAuthStateChange((event, session) => {
    applySession(session);

    if (
      currentUserId &&
      document.visibilityState !== "hidden" &&
      (event === "SIGNED_IN" || event === "INITIAL_SESSION")
    ) {
      void recordAppOpen("launch");
    }
  });

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", handlePageShow);
}

void startAppOpenTracking();

const SIGNUP_BUTTON_SELECTOR = 'button[aria-label="入村手続き（会員登録）"]';
const VISITOR_ID_STORAGE_KEY = "hoshizora.signup-open.visitor-id";
const RECORDED_STORAGE_KEY = "hoshizora.signup-open.recorded";

let fallbackVisitorId = null;
let recording = false;
let recordedInMemory = false;
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

function createUuid() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readSessionStorage(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function getVisitorId() {
  const storedId = readSessionStorage(VISITOR_ID_STORAGE_KEY);

  if (storedId) {
    return storedId;
  }

  if (!fallbackVisitorId) {
    fallbackVisitorId = createUuid();
  }

  writeSessionStorage(VISITOR_ID_STORAGE_KEY, fallbackVisitorId);
  return fallbackVisitorId;
}

function hasRecordedSignupOpen() {
  return recordedInMemory || readSessionStorage(RECORDED_STORAGE_KEY) === "1";
}

function markSignupOpenRecorded() {
  recordedInMemory = true;
  writeSessionStorage(RECORDED_STORAGE_KEY, "1");
}

async function recordSignupOpen(clientOpenedAt = new Date()) {
  if (recording || hasRecordedSignupOpen() || document.visibilityState === "hidden") {
    return;
  }

  recording = true;

  try {
    const response = await fetch("/api/signup-open", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        visitorId: getVisitorId(),
        appMode: getAppMode(),
        platform: getPlatformKind(),
        clientOpenedAt: clientOpenedAt.toISOString(),
      }),
    });

    if (!response.ok) {
      console.warn("[signup-open] Failed to record signup screen open.", response.status);
      return;
    }

    markSignupOpenRecorded();
  } catch (error) {
    console.warn("[signup-open] Failed to record signup screen open.", error?.name ?? "request_error");
  } finally {
    recording = false;
  }
}

function handleDocumentClick(event) {
  const signupButton = event.target?.closest?.(SIGNUP_BUTTON_SELECTOR);

  if (!signupButton) {
    return;
  }

  void recordSignupOpen(new Date());
}

export function startSignupOpenTracking() {
  if (trackingStarted) {
    return;
  }

  trackingStarted = true;
  document.addEventListener("click", handleDocumentClick);
}

startSignupOpenTracking();

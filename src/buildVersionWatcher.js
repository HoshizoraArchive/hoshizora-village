const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_CHECK_MIN_GAP_MS = 30 * 1000;
const VERSION_ENDPOINT = "/version.json";

let lastCheckedAt = 0;
let bannerElement = null;
let hasNewVersion = false;
let checkInFlight = false;

function getCurrentBuildId() {
  return document.querySelector('meta[name="hoshizora-build-id"]')?.getAttribute("content") ?? "";
}

function createUpdateBanner() {
  if (bannerElement) {
    return bannerElement;
  }

  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.style.position = "fixed";
  banner.style.left = "16px";
  banner.style.right = "16px";
  banner.style.bottom = "calc(16px + env(safe-area-inset-bottom, 0px))";
  banner.style.zIndex = "9999";
  banner.style.display = "flex";
  banner.style.alignItems = "center";
  banner.style.justifyContent = "space-between";
  banner.style.gap = "12px";
  banner.style.padding = "12px 14px";
  banner.style.border = "1px solid rgba(255, 255, 255, 0.18)";
  banner.style.borderRadius = "18px";
  banner.style.background = "linear-gradient(135deg, rgba(10, 16, 42, 0.96), rgba(48, 22, 72, 0.96))";
  banner.style.boxShadow = "0 18px 40px rgba(0, 0, 0, 0.35)";
  banner.style.color = "#f8fbff";
  banner.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  banner.style.fontSize = "14px";
  banner.style.lineHeight = "1.5";

  const message = document.createElement("div");
  message.textContent = "新しい星空Villageがあります。更新すると最新の機能が使えます。";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "更新";
  button.style.flex = "0 0 auto";
  button.style.border = "0";
  button.style.borderRadius = "999px";
  button.style.padding = "8px 14px";
  button.style.background = "#f8fbff";
  button.style.color = "#1b1530";
  button.style.fontWeight = "700";
  button.style.cursor = "pointer";
  button.addEventListener("click", () => {
    window.location.reload();
  });

  banner.append(message, button);
  bannerElement = banner;
  return bannerElement;
}

function showUpdateBanner() {
  if (hasNewVersion) {
    return;
  }

  hasNewVersion = true;
  document.body.appendChild(createUpdateBanner());
}

async function checkForNewVersion({ force = false } = {}) {
  if (checkInFlight || hasNewVersion) {
    return;
  }

  const now = Date.now();

  if (!force && now - lastCheckedAt < VERSION_CHECK_MIN_GAP_MS) {
    return;
  }

  const currentBuildId = getCurrentBuildId();

  if (!currentBuildId) {
    return;
  }

  lastCheckedAt = now;
  checkInFlight = true;

  try {
    const response = await fetch(`${VERSION_ENDPOINT}?t=${now}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return;
    }

    const latestVersion = await response.json();
    const latestBuildId = latestVersion?.buildId;

    if (typeof latestBuildId === "string" && latestBuildId && latestBuildId !== currentBuildId) {
      showUpdateBanner();
    }
  } catch {
    // Version checks are best-effort only. The app should keep working offline or on flaky mobile networks.
  } finally {
    checkInFlight = false;
  }
}

function startBuildVersionWatcher() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.addEventListener("focus", () => {
    void checkForNewVersion();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkForNewVersion();
    }
  });

  window.setInterval(() => {
    if (document.visibilityState !== "hidden") {
      void checkForNewVersion();
    }
  }, VERSION_CHECK_INTERVAL_MS);

  window.addEventListener("load", () => {
    void checkForNewVersion({ force: true });
  });
}

startBuildVersionWatcher();

const DIRECT_INSTALL_LABEL = "星空Villageをホーム画面に追加";
const MANUAL_INSTALL_LABEL = "ホーム画面への追加方法を見る";

let deferredInstallPrompt = null;
let promptInFlight = false;
let bypassNextInstallClick = false;

export function getAndroidInstallButtonLabel({ hasPrompt = false, isAndroid = false } = {}) {
  if (!isAndroid) {
    return DIRECT_INSTALL_LABEL;
  }

  return hasPrompt ? DIRECT_INSTALL_LABEL : MANUAL_INSTALL_LABEL;
}

function isAndroidBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android/i.test(String(navigator.userAgent ?? ""));
}

function isInstallActionButton(button) {
  if (!button) {
    return false;
  }

  const label = button.textContent?.trim();
  return label === DIRECT_INSTALL_LABEL || label === MANUAL_INSTALL_LABEL;
}

function getInstallActionButton(target) {
  const ElementConstructor = typeof Element === "undefined" ? null : Element;

  if (!ElementConstructor || !(target instanceof ElementConstructor)) {
    return null;
  }

  const button = target.closest("button");
  return isInstallActionButton(button) ? button : null;
}

function updateAndroidInstallButton(button) {
  if (!isAndroidBrowser() || !isInstallActionButton(button)) {
    return;
  }

  const hasPrompt = Boolean(deferredInstallPrompt && typeof deferredInstallPrompt.prompt === "function");
  const label = getAndroidInstallButtonLabel({ hasPrompt, isAndroid: true });
  const mode = hasPrompt ? "prompt" : "manual";

  if (button.textContent?.trim() !== label) {
    button.textContent = label;
  }

  button.dataset.homeScreenInstallMode = mode;
}

function refreshAndroidInstallButtons() {
  if (typeof document === "undefined" || !isAndroidBrowser()) {
    return;
  }

  for (const button of document.querySelectorAll("button")) {
    if (isInstallActionButton(button)) {
      updateAndroidInstallButton(button);
    }
  }
}

async function runDeferredInstallPrompt(button) {
  if (promptInFlight || !deferredInstallPrompt) {
    return;
  }

  const promptEvent = deferredInstallPrompt;
  promptInFlight = true;

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    deferredInstallPrompt = null;

    if (choice?.outcome === "accepted") {
      return;
    }
  } catch {
    deferredInstallPrompt = null;
  } finally {
    promptInFlight = false;
    refreshAndroidInstallButtons();
  }

  // The browser prompt was dismissed or failed. Re-run the existing React
  // handler once so the normal 「︙」 manual instructions are shown.
  bypassNextInstallClick = true;
  try {
    button.click();
  } finally {
    queueMicrotask(() => {
      bypassNextInstallClick = false;
    });
  }
}

function handleBeforeInstallPrompt(event) {
  if (!isAndroidBrowser()) {
    return;
  }

  event.preventDefault();
  deferredInstallPrompt = event;
  refreshAndroidInstallButtons();
}

function handleAppInstalled() {
  deferredInstallPrompt = null;
  promptInFlight = false;
  refreshAndroidInstallButtons();
}

function handleInstallActionClick(event) {
  if (bypassNextInstallClick || !isAndroidBrowser()) {
    return;
  }

  const button = getInstallActionButton(event.target);
  if (!button) {
    return;
  }

  updateAndroidInstallButton(button);

  if (!deferredInstallPrompt || typeof deferredInstallPrompt.prompt !== "function") {
    // No browser prompt is available. Let the existing React handler show the
    // manual Chrome menu instructions.
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void runDeferredInstallPrompt(button);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
}

if (typeof document !== "undefined") {
  document.addEventListener("click", handleInstallActionClick, true);

  const startObserver = () => {
    if (!document.documentElement || typeof MutationObserver === "undefined") {
      return;
    }

    const observer = new MutationObserver(refreshAndroidInstallButtons);
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    refreshAndroidInstallButtons();
  };

  if (document.documentElement) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }
}

const GUIDE_SELECTOR = '.onboarding-guide[data-onboarding-step="archive_prompt"]';
const TARGET_POST_SELECTOR = '[data-onboarding-target="onboarding-archive-post"]';
const GATED_ATTRIBUTE = "data-onboarding-archive-gated";
const ORIGINAL_DISABLED_ATTRIBUTE = "data-onboarding-archive-original-disabled";

let activeArchiveButton = null;
let scheduledFrameId = null;

function findArchiveButton() {
  const card = document.querySelector(TARGET_POST_SELECTOR);
  return (
    [...(card?.querySelectorAll("button") ?? [])].find((button) =>
      (button.textContent?.trim() ?? "").includes("Archive"),
    ) ?? null
  );
}

function restoreArchiveButton() {
  if (!activeArchiveButton) {
    return;
  }

  const originallyDisabled = activeArchiveButton.getAttribute(ORIGINAL_DISABLED_ATTRIBUTE) === "true";
  if (activeArchiveButton.disabled !== originallyDisabled) {
    activeArchiveButton.disabled = originallyDisabled;
  }
  activeArchiveButton.removeAttribute(GATED_ATTRIBUTE);
  activeArchiveButton.removeAttribute(ORIGINAL_DISABLED_ATTRIBUTE);
  activeArchiveButton = null;
}

function synchronizeArchiveGate() {
  const guide = document.querySelector(GUIDE_SELECTOR);
  const archiveButton = findArchiveButton();

  if (!guide || !archiveButton) {
    restoreArchiveButton();
    return;
  }

  if (activeArchiveButton && activeArchiveButton !== archiveButton) {
    restoreArchiveButton();
  }

  activeArchiveButton = archiveButton;
  const stage = guide.getAttribute("data-onboarding-observe-stage") ?? "";
  const shouldGate = stage !== "archive";

  if (shouldGate) {
    if (!archiveButton.hasAttribute(ORIGINAL_DISABLED_ATTRIBUTE)) {
      archiveButton.setAttribute(ORIGINAL_DISABLED_ATTRIBUTE, String(archiveButton.disabled));
    }
    if (!archiveButton.disabled) {
      archiveButton.disabled = true;
    }
    archiveButton.setAttribute(GATED_ATTRIBUTE, "true");
    return;
  }

  restoreArchiveButton();
}

function scheduleSynchronization() {
  if (scheduledFrameId !== null) {
    return;
  }

  scheduledFrameId = window.requestAnimationFrame(() => {
    scheduledFrameId = null;
    synchronizeArchiveGate();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(scheduleSynchronization);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      "data-onboarding-step",
      "data-onboarding-observe-stage",
      "data-onboarding-target",
      "disabled",
    ],
    childList: true,
    subtree: true,
  });

  window.addEventListener("load", scheduleSynchronization);
  window.addEventListener("focus", scheduleSynchronization);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleSynchronization();
    }
  });

  scheduleSynchronization();
}

export { synchronizeArchiveGate };

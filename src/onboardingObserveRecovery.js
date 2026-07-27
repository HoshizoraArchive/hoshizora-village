const GUIDE_SELECTOR = '.onboarding-guide[data-onboarding-step="archive_prompt"]';
const TARGET_POST_SELECTOR = '[data-onboarding-target="onboarding-archive-post"]';
const RESYNC_DELAYS_MS = [350, 900, 1800];

const pendingTimers = new Set();

function clearPendingTimers() {
  for (const timerId of pendingTimers) {
    window.clearTimeout(timerId);
  }

  pendingTimers.clear();
}

function dispatchObserveContextRefresh() {
  if (!document.querySelector(GUIDE_SELECTOR)) {
    return;
  }

  window.dispatchEvent(new Event("focus"));
}

function scheduleObserveContextRefresh() {
  clearPendingTimers();

  for (const delay of RESYNC_DELAYS_MS) {
    const timerId = window.setTimeout(() => {
      pendingTimers.delete(timerId);
      dispatchObserveContextRefresh();
    }, delay);

    pendingTimers.add(timerId);
  }
}

function getTargetPostCard() {
  return document.querySelector(TARGET_POST_SELECTOR);
}

function handleDocumentClick(event) {
  const card = getTargetPostCard();
  const button = event.target?.closest?.("button");

  if (!card || !button || !card.contains(button)) {
    return;
  }

  if ((button.textContent?.trim() ?? "").includes("共鳴")) {
    scheduleObserveContextRefresh();
  }
}

function handleDocumentSubmit(event) {
  const card = getTargetPostCard();
  const form = event.target;

  if (
    !card ||
    !(form instanceof HTMLFormElement) ||
    !card.contains(form) ||
    !form.querySelector('textarea[placeholder="この流星便に星文を残す"]')
  ) {
    return;
  }

  scheduleObserveContextRefresh();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("submit", handleDocumentSubmit, true);
  window.addEventListener("pagehide", clearPendingTimers);
}

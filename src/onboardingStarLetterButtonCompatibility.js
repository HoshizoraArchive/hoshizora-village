const TARGET_POST_SELECTOR = '[data-onboarding-target="onboarding-archive-post"]';
const COMPATIBILITY_MARKER = "data-onboarding-star-letter-prefix";

let scheduledFrameId = null;

function createHiddenPrefix() {
  const prefix = document.createElement("span");
  prefix.setAttribute(COMPATIBILITY_MARKER, "true");
  prefix.setAttribute("aria-hidden", "true");
  prefix.textContent = "星文 ";
  Object.assign(prefix.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0",
  });
  return prefix;
}

function normalizeStarLetterButton() {
  const card = document.querySelector(TARGET_POST_SELECTOR);

  if (!card) {
    return;
  }

  const button = [...card.querySelectorAll("button")].find((candidate) =>
    (candidate.textContent?.trim() ?? "").includes("星文"),
  );

  if (!button || button.querySelector(`[${COMPATIBILITY_MARKER}]`)) {
    return;
  }

  const label = button.textContent?.trim() ?? "";

  if (label.startsWith("星文")) {
    return;
  }

  button.prepend(createHiddenPrefix());
}

function scheduleNormalization() {
  if (scheduledFrameId !== null) {
    return;
  }

  scheduledFrameId = window.requestAnimationFrame(() => {
    scheduledFrameId = null;
    normalizeStarLetterButton();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(scheduleNormalization);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("load", scheduleNormalization);
  window.addEventListener("focus", scheduleNormalization);
  scheduleNormalization();
}

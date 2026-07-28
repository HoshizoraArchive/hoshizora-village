const GUIDE_SELECTOR = '.onboarding-guide[data-onboarding-step="archive_prompt"]';
const TARGET_POST_SELECTOR = '[data-onboarding-target="onboarding-archive-post"]';
const ACTIVE_TARGET_NAME = "onboarding-archive-action";
const INJECTED_LINES_ATTRIBUTE = "data-onboarding-observe-lines";
const INJECTED_SKIP_ATTRIBUTE = "data-onboarding-observe-skip";
const ORIGINAL_LINES_ATTRIBUTE = "data-onboarding-observe-original-lines";
const DYNAMIC_TARGET_ATTRIBUTE = "data-onboarding-observe-target";

const RESONANCE_LINES = [
  "まずは、この流星便に「共鳴」を押してみて！",
  "「いいな！」って思ったら、共鳴は何回でも押せるよ✨",
];

let scheduledFrameId = null;

function findActionButton(card, matcher) {
  return (
    [...(card?.querySelectorAll("button") ?? [])].find((button) =>
      matcher(button.textContent?.trim() ?? ""),
    ) ?? null
  );
}

function getOriginalDialogueLines(dialogue) {
  return (
    [...(dialogue?.children ?? [])].find(
      (child) =>
        child.tagName === "DIV" &&
        child.querySelector(":scope > p") &&
        !child.querySelector("button") &&
        !child.hasAttribute(INJECTED_LINES_ATTRIBUTE),
    ) ?? null
  );
}

function createResonanceLines() {
  const container = document.createElement("div");
  container.setAttribute(INJECTED_LINES_ATTRIBUTE, "true");
  container.className = "mt-1.5 space-y-1.5 text-[13px] font-bold leading-5 text-white";

  for (const line of RESONANCE_LINES) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    container.append(paragraph);
  }

  return container;
}

function resonanceGuideIsReady({ dialogue, guide, resonanceButton }) {
  const injectedLines = dialogue.querySelector(`[${INJECTED_LINES_ATTRIBUTE}]`);
  const renderedLines = [...(injectedLines?.querySelectorAll(":scope > p") ?? [])].map(
    (paragraph) => paragraph.textContent ?? "",
  );

  return Boolean(
    guide.getAttribute("data-onboarding-observe-stage") === "resonance" &&
      renderedLines.length === RESONANCE_LINES.length &&
      renderedLines.every((line, index) => line === RESONANCE_LINES[index]) &&
      resonanceButton.getAttribute("data-onboarding-target") === ACTIVE_TARGET_NAME,
  );
}

function applyInitialResonanceGuide() {
  const guide = document.querySelector(GUIDE_SELECTOR);

  if (!guide) {
    return;
  }

  const managedStage = guide.getAttribute("data-onboarding-observe-stage");

  // Once the database-backed guide has advanced beyond resonance, it owns the UI.
  if (managedStage && managedStage !== "resonance") {
    return;
  }

  const targetCard = document.querySelector(TARGET_POST_SELECTOR);
  const dialogue = guide.querySelector(".onboarding-dialogue");
  const originalLines = getOriginalDialogueLines(dialogue);
  const resonanceButton = findActionButton(targetCard, (label) => label.includes("共鳴"));

  if (!dialogue || !originalLines || !resonanceButton) {
    return;
  }

  if (resonanceGuideIsReady({ dialogue, guide, resonanceButton })) {
    return;
  }

  guide.setAttribute("data-onboarding-observe-stage", "resonance");
  originalLines.hidden = true;
  originalLines.setAttribute(ORIGINAL_LINES_ATTRIBUTE, "true");

  dialogue.querySelector(`[${INJECTED_LINES_ATTRIBUTE}]`)?.remove();
  dialogue.querySelector(`[${INJECTED_SKIP_ATTRIBUTE}]`)?.remove();
  originalLines.insertAdjacentElement("afterend", createResonanceLines());

  document.querySelectorAll(`[data-onboarding-target="${ACTIVE_TARGET_NAME}"]`).forEach((element) => {
    element.removeAttribute("data-onboarding-target");
    element.removeAttribute(DYNAMIC_TARGET_ATTRIBUTE);
  });

  resonanceButton.setAttribute(DYNAMIC_TARGET_ATTRIBUTE, "true");
  resonanceButton.setAttribute("data-onboarding-target", ACTIVE_TARGET_NAME);
}

function scheduleBootstrap() {
  if (scheduledFrameId !== null) {
    return;
  }

  scheduledFrameId = window.requestAnimationFrame(() => {
    scheduledFrameId = null;
    applyInitialResonanceGuide();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(scheduleBootstrap);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-onboarding-step", "data-onboarding-target", "data-onboarding-observe-stage"],
    childList: true,
    subtree: true,
  });

  window.addEventListener("load", scheduleBootstrap);
  window.addEventListener("focus", scheduleBootstrap);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleBootstrap();
    }
  });

  scheduleBootstrap();
}

export { RESONANCE_LINES, applyInitialResonanceGuide };

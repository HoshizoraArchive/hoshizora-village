import { supabase } from "./lib/supabaseClient";

const GUIDE_SELECTOR = '.onboarding-guide[data-onboarding-step="archive_prompt"]';
const TARGET_POST_SELECTOR = '[data-onboarding-target="onboarding-archive-post"]';
const ACTIVE_TARGET_NAME = "onboarding-archive-action";
const INJECTED_LINES_ATTRIBUTE = "data-onboarding-observe-lines";
const INJECTED_SKIP_ATTRIBUTE = "data-onboarding-observe-skip";
const ORIGINAL_LINES_ATTRIBUTE = "data-onboarding-observe-original-lines";
const DYNAMIC_TARGET_ATTRIBUTE = "data-onboarding-observe-target";

const STAGE_DEFINITIONS = {
  resonance: {
    lines: [
      "まずは、この流星便に「共鳴」を押してみて！",
      "「いいな！」って思ったら、共鳴は何回でも押せるよ✨",
    ],
    target: "resonance",
  },
  star_letter_open: {
    lines: [
      "次は「星文」！",
      "この流星便に何か残したい言葉があれば、「星文」を押してみて！",
    ],
    optionalLabel: "星文はあとで",
    target: "star_letter_button",
  },
  star_letter_write: {
    lines: [
      "この流星便に、届けたい言葉を書いてみて！",
      "書けたら「星文を送る」を押してね✨",
    ],
    optionalLabel: "星文はあとで",
    target: "star_letter_form",
  },
  archive: {
    lines: [
      "最後は「Archive」！",
      "気に入った流星便を、あとで見返せるように残してみて✨",
    ],
    target: "archive",
  },
};

let activeContextKey = "";
let activeStage = "";
let activeUserId = "";
let activeTargetPostId = "";
let contextRequestId = 0;
let actionRequestId = 0;
let scheduledFrameId = null;

function getGuide() {
  return document.querySelector(GUIDE_SELECTOR);
}

function getTargetPostCard() {
  return document.querySelector(TARGET_POST_SELECTOR);
}

function findActionButton(card, matcher) {
  return [...(card?.querySelectorAll("button") ?? [])].find((button) => matcher(button.textContent?.trim() ?? "")) ?? null;
}

function getObserveTarget(stage) {
  const card = getTargetPostCard();

  if (!card) {
    return null;
  }

  if (stage === "resonance") {
    return findActionButton(card, (label) => label.includes("共鳴"));
  }

  if (stage === "star_letter_open") {
    return findActionButton(card, (label) => label.startsWith("星文"));
  }

  if (stage === "star_letter_write") {
    return card.querySelector('textarea[placeholder="この流星便に星文を残す"]')?.closest("form") ?? null;
  }

  return findActionButton(card, (label) => label.includes("Archive"));
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

function clearGuideTargets() {
  document.querySelectorAll(`[data-onboarding-target="${ACTIVE_TARGET_NAME}"]`).forEach((element) => {
    element.removeAttribute("data-onboarding-target");
    element.removeAttribute(DYNAMIC_TARGET_ATTRIBUTE);
  });

  document.querySelectorAll(`[${DYNAMIC_TARGET_ATTRIBUTE}="true"]`).forEach((element) => {
    element.removeAttribute(DYNAMIC_TARGET_ATTRIBUTE);
  });
}

function restoreDialogue() {
  document.querySelectorAll(`[${INJECTED_LINES_ATTRIBUTE}]`).forEach((element) => element.remove());
  document.querySelectorAll(`[${INJECTED_SKIP_ATTRIBUTE}]`).forEach((element) => element.remove());
  document.querySelectorAll(`[${ORIGINAL_LINES_ATTRIBUTE}="true"]`).forEach((element) => {
    element.hidden = false;
    element.removeAttribute(ORIGINAL_LINES_ATTRIBUTE);
  });
}

function restoreDefaultArchiveTarget() {
  if (!getGuide()) {
    return;
  }

  const archiveButton = findActionButton(getTargetPostCard(), (label) => label.includes("Archive"));
  archiveButton?.setAttribute("data-onboarding-target", ACTIVE_TARGET_NAME);
}

function cleanupObserveExperience() {
  clearGuideTargets();
  restoreDialogue();
  restoreDefaultArchiveTarget();

  const guide = document.querySelector(".onboarding-guide[data-onboarding-observe-stage]");
  guide?.removeAttribute("data-onboarding-observe-stage");

  activeContextKey = "";
  activeStage = "";
  activeUserId = "";
  activeTargetPostId = "";
  actionRequestId += 1;
}

function createInjectedLines(definition) {
  const container = document.createElement("div");
  container.setAttribute(INJECTED_LINES_ATTRIBUTE, "true");
  container.className = "mt-1.5 space-y-1.5 text-[13px] font-bold leading-5 text-white";

  for (const line of definition.lines) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    container.append(paragraph);
  }

  return container;
}

function setObserveStage(nextStage) {
  if (!STAGE_DEFINITIONS[nextStage]) {
    return;
  }

  activeStage = nextStage;
  applyObserveGuide();
}

function createSkipButton(label) {
  const button = document.createElement("button");
  button.setAttribute(INJECTED_SKIP_ATTRIBUTE, "true");
  button.className =
    "mt-2 min-h-9 w-full rounded-2xl border border-white/15 bg-white/5 px-3 text-[11px] font-black text-slate-200 transition hover:bg-white/10";
  button.textContent = label;
  button.type = "button";
  button.addEventListener("click", () => setObserveStage("archive"));
  return button;
}

function isGuideAlreadyApplied({ definition, dialogue, guide, originalLines, target }) {
  const injectedLines = dialogue.querySelector(`[${INJECTED_LINES_ATTRIBUTE}]`);
  const injectedSkip = dialogue.querySelector(`[${INJECTED_SKIP_ATTRIBUTE}]`);
  const renderedLines = [...(injectedLines?.querySelectorAll(":scope > p") ?? [])].map(
    (paragraph) => paragraph.textContent ?? "",
  );
  const expectedSkipLabel = definition.optionalLabel ?? "";
  const skipIsReady = expectedSkipLabel
    ? injectedSkip?.textContent?.trim() === expectedSkipLabel
    : !injectedSkip;
  const activeTargets = [...document.querySelectorAll(`[data-onboarding-target="${ACTIVE_TARGET_NAME}"]`)];
  const targetIsReady =
    activeTargets.length === 1 &&
    activeTargets[0] === target &&
    target?.getAttribute(DYNAMIC_TARGET_ATTRIBUTE) === "true";

  return Boolean(
    guide.getAttribute("data-onboarding-observe-stage") === activeStage &&
      originalLines.hidden &&
      injectedLines &&
      renderedLines.length === definition.lines.length &&
      renderedLines.every((line, index) => line === definition.lines[index]) &&
      skipIsReady &&
      targetIsReady,
  );
}

function applyObserveGuide() {
  const guide = getGuide();
  const definition = STAGE_DEFINITIONS[activeStage];

  if (!guide || !definition) {
    return;
  }

  if (activeStage === "star_letter_write" && !getObserveTarget("star_letter_write")) {
    activeStage = "star_letter_open";
  }

  const currentDefinition = STAGE_DEFINITIONS[activeStage];
  const dialogue = guide.querySelector(".onboarding-dialogue");
  const originalLines = getOriginalDialogueLines(dialogue);
  const target = getObserveTarget(activeStage);

  if (!dialogue || !originalLines || !target) {
    return;
  }

  if (isGuideAlreadyApplied({ definition: currentDefinition, dialogue, guide, originalLines, target })) {
    return;
  }

  guide.setAttribute("data-onboarding-observe-stage", activeStage);
  originalLines.hidden = true;
  originalLines.setAttribute(ORIGINAL_LINES_ATTRIBUTE, "true");

  dialogue.querySelector(`[${INJECTED_LINES_ATTRIBUTE}]`)?.remove();
  dialogue.querySelector(`[${INJECTED_SKIP_ATTRIBUTE}]`)?.remove();

  const injectedLines = createInjectedLines(currentDefinition);
  originalLines.insertAdjacentElement("afterend", injectedLines);

  if (currentDefinition.optionalLabel) {
    injectedLines.insertAdjacentElement("afterend", createSkipButton(currentDefinition.optionalLabel));
  }

  clearGuideTargets();
  target.setAttribute(DYNAMIC_TARGET_ATTRIBUTE, "true");
  target.setAttribute("data-onboarding-target", ACTIVE_TARGET_NAME);

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  target.scrollIntoView?.({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

async function hasMatchingRow(table, userColumn) {
  if (!activeUserId || !activeTargetPostId) {
    return false;
  }

  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq(userColumn, activeUserId)
    .eq("post_id", activeTargetPostId)
    .limit(1);

  return !error && Boolean(data?.length);
}

async function determineInitialStage() {
  const [hasResonance, hasStarLetter] = await Promise.all([
    hasMatchingRow("resonances", "profile_id"),
    hasMatchingRow("star_letters", "author_id"),
  ]);

  if (hasStarLetter) {
    return "archive";
  }

  return hasResonance ? "star_letter_open" : "resonance";
}

async function readObserveContext() {
  const guide = getGuide();

  if (!guide) {
    cleanupObserveExperience();
    return;
  }

  const requestId = ++contextRequestId;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? "";

  if (!userId || requestId !== contextRequestId) {
    cleanupObserveExperience();
    return;
  }

  const { data: progress, error } = await supabase
    .from("user_onboarding_progress")
    .select("user_id, current_step, target_post_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    error ||
    requestId !== contextRequestId ||
    progress?.current_step !== "archive_prompt" ||
    !progress?.target_post_id
  ) {
    cleanupObserveExperience();
    return;
  }

  const nextContextKey = `${userId}:${progress.target_post_id}`;

  if (nextContextKey !== activeContextKey) {
    activeContextKey = nextContextKey;
    activeUserId = userId;
    activeTargetPostId = progress.target_post_id;
    activeStage = await determineInitialStage();
  }

  applyObserveGuide();
}

async function waitForActionResult(table, userColumn, successStage) {
  const requestId = ++actionRequestId;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));

    if (requestId !== actionRequestId || !getGuide()) {
      return;
    }

    if (await hasMatchingRow(table, userColumn)) {
      setObserveStage(successStage);
      return;
    }
  }
}

function handleDocumentClick(event) {
  const card = getTargetPostCard();
  const button = event.target?.closest?.("button");

  if (!card || !button || !card.contains(button)) {
    return;
  }

  const label = button.textContent?.trim() ?? "";

  if (activeStage === "resonance" && label.includes("共鳴")) {
    void waitForActionResult("resonances", "profile_id", "star_letter_open");
    return;
  }

  if (activeStage === "star_letter_open" && label.startsWith("星文")) {
    window.setTimeout(() => setObserveStage("star_letter_write"), 60);
  }
}

function handleDocumentSubmit(event) {
  if (activeStage !== "star_letter_write") {
    return;
  }

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

  void waitForActionResult("star_letters", "author_id", "archive");
}

function scheduleSynchronization() {
  if (scheduledFrameId !== null) {
    return;
  }

  scheduledFrameId = window.requestAnimationFrame(() => {
    scheduledFrameId = null;

    if (activeContextKey && getGuide()) {
      applyObserveGuide();
      return;
    }

    void readObserveContext();
  });
}

function refreshContext() {
  activeContextKey = "";
  scheduleSynchronization();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(scheduleSynchronization);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-onboarding-step", "data-onboarding-target"],
    childList: true,
    subtree: true,
  });

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("submit", handleDocumentSubmit, true);
  window.addEventListener("load", refreshContext);
  window.addEventListener("focus", refreshContext);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshContext();
    }
  });

  scheduleSynchronization();
}

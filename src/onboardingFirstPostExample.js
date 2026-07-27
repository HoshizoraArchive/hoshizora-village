import { supabase } from "./lib/supabaseClient";

const ONBOARDING_FORM_SELECTOR = 'form[data-onboarding-target="post-composer"]';
const EXAMPLE_CONTAINER_ATTRIBUTE = "data-onboarding-first-post-example";
const DEFAULT_COMPOSER_PLACEHOLDER = "今夜、どの星を観測してほしい？";

let activeTextarea = null;
let activeExampleContainer = null;
let activeExampleText = "";
let scheduledFrameId = null;
let profileRequestId = 0;
let cachedUserId = "";
let cachedDisplayName = "";

function buildFirstPostExample(displayName) {
  const safeName = String(displayName ?? "").trim() || "あなた";
  return `はじめまして！${safeName}です！よろしくお願いします！`;
}

function setControlledTextareaValue(textarea, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

  if (valueSetter) {
    valueSetter.call(textarea, value);
  } else {
    textarea.value = value;
  }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

function updateExampleVisibility() {
  if (!activeTextarea || !activeExampleContainer) {
    return;
  }

  activeExampleContainer.hidden = Boolean(activeTextarea.value.trim());
}

function removeFirstPostExample() {
  if (activeTextarea) {
    activeTextarea.removeEventListener("input", updateExampleVisibility);

    if (activeTextarea.placeholder === activeExampleText) {
      activeTextarea.placeholder = DEFAULT_COMPOSER_PLACEHOLDER;
    }
  }

  activeExampleContainer?.remove();
  activeTextarea = null;
  activeExampleContainer = null;
  activeExampleText = "";
}

function createExampleContainer(textarea, exampleText) {
  const container = document.createElement("div");
  container.setAttribute(EXAMPLE_CONTAINER_ATTRIBUTE, "true");
  container.className =
    "mt-3 rounded-2xl border border-comet/25 bg-comet/10 px-3 py-3 text-left shadow-[0_10px_35px_rgba(125,223,255,0.08)]";

  const label = document.createElement("p");
  label.className = "text-[11px] font-black text-comet";
  label.textContent = "はじめての流星便に使える例文";

  const preview = document.createElement("p");
  preview.className = "mt-1 text-xs leading-6 text-slate-200";
  preview.textContent = exampleText;

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "mt-2 min-h-9 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01]";
  button.textContent = "この例文を使う";
  button.addEventListener("click", () => {
    setControlledTextareaValue(textarea, exampleText);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(exampleText.length, exampleText.length);
    updateExampleVisibility();
  });

  container.append(label, preview, button);
  return container;
}

async function readCurrentDisplayName() {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? "";

  if (!userId) {
    cachedUserId = "";
    cachedDisplayName = "";
    return "";
  }

  if (cachedUserId === userId && cachedDisplayName) {
    return cachedDisplayName;
  }

  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  cachedUserId = userId;
  cachedDisplayName = String(data?.display_name ?? "").trim();
  return cachedDisplayName;
}

async function synchronizeFirstPostExample() {
  const form = document.querySelector(ONBOARDING_FORM_SELECTOR);
  const textarea = form?.querySelector("textarea") ?? null;

  if (!textarea) {
    removeFirstPostExample();
    return;
  }

  if (activeTextarea === textarea && activeExampleContainer?.isConnected) {
    updateExampleVisibility();
    return;
  }

  const requestId = ++profileRequestId;
  const displayName = await readCurrentDisplayName();

  if (requestId !== profileRequestId || !textarea.isConnected || !textarea.closest(ONBOARDING_FORM_SELECTOR)) {
    return;
  }

  removeFirstPostExample();

  const exampleText = buildFirstPostExample(displayName);
  const textareaShell = textarea.parentElement;
  const container = createExampleContainer(textarea, exampleText);

  textarea.placeholder = exampleText;
  textareaShell?.insertAdjacentElement("afterend", container);
  textarea.addEventListener("input", updateExampleVisibility);

  activeTextarea = textarea;
  activeExampleContainer = container;
  activeExampleText = exampleText;
  updateExampleVisibility();
}

function scheduleSynchronization() {
  if (scheduledFrameId !== null) {
    return;
  }

  scheduledFrameId = window.requestAnimationFrame(() => {
    scheduledFrameId = null;
    void synchronizeFirstPostExample();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(scheduleSynchronization);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-onboarding-target"],
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

export { buildFirstPostExample };

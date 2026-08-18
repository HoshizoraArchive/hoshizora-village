import { supabase } from "./lib/supabaseClient";

const GIFT_TYPE = "opening_memorial_gift";
const MODAL_ATTRIBUTE = "data-opening-memorial-gift-modal";
const CARD_BUTTON_ATTRIBUTE = "data-opening-memorial-frame-button";
const FRAME_NAVIGATION_TIMEOUT_MS = 12_000;
const FRAME_NAVIGATION_POLL_MS = 120;
let currentUserId = null;
let sessionCheckedUserId = null;
let activeNotificationId = null;
let observer = null;
let frameNavigationSequence = 0;

function isVisibleElement(element) {
  return element instanceof HTMLElement && element.getClientRects().length > 0;
}

function findFrameEditorLabel() {
  return Array.from(document.querySelectorAll("p")).find(
    (element) =>
      element.textContent?.trim() === "アイコンフレーム" && isVisibleElement(element),
  ) ?? null;
}

function findReadyProfileEditButton(myUniverseButton) {
  if (myUniverseButton?.getAttribute("aria-current") !== "page") return null;

  return Array.from(document.querySelectorAll("button")).find(
    (button) =>
      button.textContent?.trim() === "編集" &&
      !button.disabled &&
      isVisibleElement(button),
  ) ?? null;
}

function waitForDomMatch(findMatch, timeoutMs = FRAME_NAVIGATION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const immediateMatch = findMatch();
    if (immediateMatch) {
      resolve(immediateMatch);
      return;
    }

    let settled = false;
    let mutationObserver = null;
    let pollId = null;
    let timeoutId = null;

    const finish = (match) => {
      if (settled) return;
      settled = true;
      mutationObserver?.disconnect();
      if (pollId !== null) window.clearInterval(pollId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve(match ?? null);
    };

    const check = () => {
      const match = findMatch();
      if (match) finish(match);
    };

    mutationObserver = new MutationObserver(check);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-current", "class", "disabled", "hidden"],
    });
    pollId = window.setInterval(check, FRAME_NAVIGATION_POLL_MS);
    timeoutId = window.setTimeout(() => finish(null), timeoutMs);
  });
}

function scrollFrameEditorIntoView(frameLabel) {
  const target = frameLabel?.closest("div.rounded-2xl") ?? frameLabel;
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function openMyFrames() {
  const navigationSequence = ++frameNavigationSequence;
  const myUniverseButton = document.querySelector('button[aria-label="My Universe"]');
  if (!(myUniverseButton instanceof HTMLButtonElement)) return;

  myUniverseButton.click();

  const existingFrameLabel = findFrameEditorLabel();
  if (existingFrameLabel) {
    scrollFrameEditorIntoView(existingFrameLabel);
    return;
  }

  const editButton = await waitForDomMatch(() => findReadyProfileEditButton(myUniverseButton));
  if (
    navigationSequence !== frameNavigationSequence ||
    !(editButton instanceof HTMLButtonElement) ||
    myUniverseButton.getAttribute("aria-current") !== "page"
  ) return;

  editButton.click();

  const frameLabel = await waitForDomMatch(findFrameEditorLabel);
  if (navigationSequence !== frameNavigationSequence || !frameLabel) return;

  scrollFrameEditorIntoView(frameLabel);
}

async function markGiftRead(notificationId) {
  if (!notificationId || !currentUserId) return;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("recipient_id", currentUserId)
    .eq("type", GIFT_TYPE);

  if (error) {
    console.warn("[opening-memorial-gift] Failed to mark gift notification read.", error.code ?? "unknown_error");
  }
}

function removeModal() {
  document.querySelector(`[${MODAL_ATTRIBUTE}]`)?.remove();
  activeNotificationId = null;
}

function closeGiftModal({ openFrames = false } = {}) {
  const notificationId = activeNotificationId;
  removeModal();
  if (notificationId) void markGiftRead(notificationId);
  if (openFrames) void openMyFrames();
}

function createGiftModal(notification) {
  if (
    !notification?.id ||
    notification.type !== GIFT_TYPE ||
    document.querySelector(`[${MODAL_ATTRIBUTE}]`)
  ) return;

  activeNotificationId = notification.id;

  const overlay = document.createElement("div");
  overlay.setAttribute(MODAL_ATTRIBUTE, "true");
  overlay.setAttribute("role", "presentation");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "100000",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "rgba(2, 6, 23, 0.72)",
    backdropFilter: "blur(12px)",
  });

  const dialog = document.createElement("section");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "opening-memorial-gift-title");
  Object.assign(dialog.style, {
    position: "relative",
    width: "min(100%, 430px)",
    overflow: "hidden",
    border: "1px solid rgba(125, 223, 255, 0.34)",
    borderRadius: "28px",
    background: "linear-gradient(160deg, rgba(11,18,42,.98), rgba(20,13,43,.98))",
    boxShadow: "0 28px 90px rgba(0,0,0,.56), 0 0 48px rgba(125,223,255,.12)",
    color: "#f8fafc",
    padding: "26px 22px 22px",
    textAlign: "center",
  });

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "贈りものを閉じる");
  close.textContent = "×";
  Object.assign(close.style, {
    position: "absolute",
    top: "10px",
    right: "12px",
    border: "0",
    background: "transparent",
    color: "#94a3b8",
    fontSize: "26px",
    lineHeight: "1",
    padding: "6px",
  });
  close.addEventListener("click", () => closeGiftModal());

  const chia = document.createElement("img");
  chia.src = "/images/onboarding/mini-chia.png";
  chia.alt = "星空ちあ";
  Object.assign(chia.style, {
    width: "88px",
    height: "88px",
    objectFit: "contain",
    margin: "0 auto 10px",
    filter: "drop-shadow(0 0 18px rgba(125,223,255,.22))",
  });

  const eyebrow = document.createElement("p");
  eyebrow.textContent = "✦ 星空ちあからの贈りもの ✦";
  Object.assign(eyebrow.style, {
    margin: "0",
    color: "#8be8ff",
    fontSize: "11px",
    fontWeight: "900",
    letterSpacing: ".12em",
  });

  const title = document.createElement("h2");
  title.id = "opening-memorial-gift-title";
  title.textContent = "アイコンフレームが届きました！";
  Object.assign(title.style, {
    margin: "8px 0 0",
    fontSize: "20px",
    lineHeight: "1.45",
    fontWeight: "900",
  });

  const copy = document.createElement("p");
  copy.innerHTML =
    '公開βに参加してくれたあなたへ。<br><strong style="color:#f8d9ff">「Opening Memorial」</strong> アイコンフレームを贈りますっ！<br><br>この街の最初期を一緒に歩いてくれた証です✨';
  Object.assign(copy.style, {
    margin: "14px 0 0",
    color: "#cbd5e1",
    fontSize: "13px",
    lineHeight: "1.8",
  });

  const frameButton = document.createElement("button");
  frameButton.type = "button";
  frameButton.textContent = "フレームを見る";
  Object.assign(frameButton.style, {
    width: "100%",
    minHeight: "48px",
    marginTop: "20px",
    border: "0",
    borderRadius: "18px",
    background: "linear-gradient(90deg, #7de0ff, #c995ff, #ff91cd)",
    color: "#07101d",
    fontSize: "13px",
    fontWeight: "900",
    boxShadow: "0 10px 28px rgba(125,223,255,.18)",
  });
  frameButton.addEventListener("click", () => closeGiftModal({ openFrames: true }));

  const receiveButton = document.createElement("button");
  receiveButton.type = "button";
  receiveButton.textContent = "受け取る ✨";
  Object.assign(receiveButton.style, {
    width: "100%",
    minHeight: "42px",
    marginTop: "9px",
    border: "1px solid rgba(255,255,255,.10)",
    borderRadius: "16px",
    background: "rgba(255,255,255,.06)",
    color: "#cbd5e1",
    fontSize: "12px",
    fontWeight: "800",
  });
  receiveButton.addEventListener("click", () => closeGiftModal());

  dialog.append(close, chia, eyebrow, title, copy, frameButton, receiveButton);
  overlay.append(dialog);
  document.body.append(overlay);
  frameButton.focus();
}

async function maybeShowGift() {
  if (!currentUserId || sessionCheckedUserId === currentUserId || document.visibilityState === "hidden") return;

  sessionCheckedUserId = currentUserId;
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, message, created_at")
    .eq("recipient_id", currentUserId)
    .eq("type", GIFT_TYPE)
    .eq("is_read", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[opening-memorial-gift] Failed to load gift notification.", error.code ?? "unknown_error");
    sessionCheckedUserId = null;
    return;
  }

  if (data?.id) createGiftModal(data);
}

function enhanceGiftCards() {
  const typeLabels = Array.from(document.querySelectorAll("p")).filter(
    (element) => element.textContent?.trim() === `type: ${GIFT_TYPE}`,
  );

  for (const typeLabel of typeLabels) {
    const card = typeLabel.closest("article");
    if (!card || card.querySelector(`[${CARD_BUTTON_ATTRIBUTE}]`)) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(CARD_BUTTON_ATTRIBUTE, "true");
    button.textContent = "フレームを見る";
    button.className =
      "mt-3 min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15";
    button.addEventListener("click", () => {
      Array.from(card.querySelectorAll("button")).find(
        (cardButton) => cardButton.textContent?.trim() === "既読にする",
      )?.click();
      void openMyFrames();
    });
    card.append(button);
  }
}

function startObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver(enhanceGiftCards);
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceGiftCards();
}

async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  const nextUserId = data?.session?.user?.id ?? null;
  if (nextUserId !== currentUserId) {
    currentUserId = nextUserId;
    sessionCheckedUserId = null;
    removeModal();
  }
  if (currentUserId) window.setTimeout(() => void maybeShowGift(), 700);
}

if (
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  !window.location.pathname.startsWith("/admin/")
) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }

  void refreshSession();
  supabase.auth.onAuthStateChange(() => window.setTimeout(() => void refreshSession(), 0));
}

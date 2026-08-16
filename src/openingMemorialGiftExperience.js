import { supabase } from "./lib/supabaseClient";

const OPENING_MEMORIAL_GIFT_TYPE = "profile_frame_gift";
const OPENING_MEMORIAL_GIFT_TITLE = "星空ちあからアイコンフレームが届きました！";
const OPENING_MEMORIAL_FRAME_NAME = "Opening Memorial";

let checkedUserId = null;
let activeNotificationId = null;
let authSubscription = null;

function isAdminRoute(pathname = window.location.pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text != null) {
    element.textContent = text;
  }
  return element;
}

function removeGiftDialog() {
  document.querySelector("[data-opening-memorial-gift]")?.remove();
  activeNotificationId = null;
}

async function markGiftRead(notificationId, button) {
  if (!notificationId || button.dataset.saving === "true") {
    return;
  }

  button.dataset.saving = "true";
  button.disabled = true;
  button.textContent = "受け取っています…";

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("type", OPENING_MEMORIAL_GIFT_TYPE)
    .select("id")
    .maybeSingle();

  if (error) {
    button.dataset.saving = "false";
    button.disabled = false;
    button.textContent = "もう一度受け取る";
    return;
  }

  removeGiftDialog();
}

export function renderOpeningMemorialGiftDialog(notification) {
  if (!notification?.id || activeNotificationId === notification.id) {
    return;
  }

  removeGiftDialog();
  activeNotificationId = notification.id;

  const overlay = createElement("div", "opening-memorial-gift-overlay");
  overlay.dataset.openingMemorialGift = "true";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "opening-memorial-gift-title");

  const card = createElement("section", "opening-memorial-gift-card");
  const sparkles = createElement("div", "opening-memorial-gift-sparkles", "✦ ･ﾟ✧ ･ﾟ✦");
  sparkles.setAttribute("aria-hidden", "true");

  const chiaImage = document.createElement("img");
  chiaImage.className = "opening-memorial-gift-chia";
  chiaImage.src = "/images/onboarding/mini-chia.png";
  chiaImage.alt = "星空ちあ";

  const title = createElement(
    "h2",
    "opening-memorial-gift-title",
    notification.message || OPENING_MEMORIAL_GIFT_TITLE,
  );
  title.id = "opening-memorial-gift-title";

  const lead = createElement(
    "p",
    "opening-memorial-gift-lead",
    "公開βに参加してくれたあなたへ、ちあから記念の贈りものですっ！",
  );

  const preview = createElement("div", "opening-memorial-gift-preview");
  const previewCore = createElement("div", "opening-memorial-gift-preview-core", "✦");
  previewCore.setAttribute("aria-hidden", "true");
  const frameImage = document.createElement("img");
  frameImage.className = "opening-memorial-gift-frame";
  frameImage.src = "/profile-frames/opening-memorial.png";
  frameImage.alt = `${OPENING_MEMORIAL_FRAME_NAME} アイコンフレーム`;
  preview.append(previewCore, frameImage);

  const frameName = createElement(
    "p",
    "opening-memorial-gift-frame-name",
    `「${OPENING_MEMORIAL_FRAME_NAME}」`,
  );
  const description = createElement(
    "p",
    "opening-memorial-gift-description",
    "この街の最初期を一緒に歩いてくれた証です。My Universeからいつでも付け替えられるよっ🌟",
  );

  const receiveButton = createElement("button", "opening-memorial-gift-button", "受け取る");
  receiveButton.type = "button";
  receiveButton.addEventListener("click", () => {
    void markGiftRead(notification.id, receiveButton);
  });

  card.append(sparkles, chiaImage, title, lead, preview, frameName, description, receiveButton);
  overlay.append(card);
  document.body.append(overlay);
  receiveButton.focus({ preventScroll: true });
}

async function findUnreadGift(userId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, message, is_read, created_at")
    .eq("recipient_id", userId)
    .eq("type", OPENING_MEMORIAL_GIFT_TYPE)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

async function showGiftForSession(session) {
  const userId = session?.user?.id;
  if (!userId || checkedUserId === userId || isAdminRoute()) {
    return;
  }

  checkedUserId = userId;
  const notification = await findUnreadGift(userId);
  if (notification) {
    renderOpeningMemorialGiftDialog(notification);
  }
}

async function startOpeningMemorialGiftExperience() {
  if (typeof window === "undefined" || typeof document === "undefined" || isAdminRoute()) {
    return;
  }

  const { data } = await supabase.auth.getSession();
  await showGiftForSession(data?.session ?? null);

  const authState = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      checkedUserId = null;
      removeGiftDialog();
      return;
    }

    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      void showGiftForSession(session);
    }
  });

  authSubscription = authState.data.subscription;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void startOpeningMemorialGiftExperience();
    }, { once: true });
  } else {
    void startOpeningMemorialGiftExperience();
  }

  window.addEventListener("beforeunload", () => {
    authSubscription?.unsubscribe();
  }, { once: true });
}

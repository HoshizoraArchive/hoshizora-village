const CARD_ID = "hoshizora-notification-test-card";
const SERVICE_WORKER_PATH = "/sw.js";

let registrationPromise = null;
let syncQueued = false;

function isSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

function registerWorker() {
  if (!isSupported()) {
    return Promise.resolve(null);
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch((error) => {
      registrationPromise = null;
      throw error;
    });
  }

  return registrationPromise;
}

function findRConnectRoot() {
  const heading = [...document.querySelectorAll("h1")].find((node) => node.textContent?.trim() === "R.Connect");
  return heading?.closest("section") ?? heading?.parentElement ?? null;
}

function setStatus(card, text) {
  const status = card.querySelector("[data-notification-status]");
  if (status) status.textContent = text;
}

function updatePermission(card) {
  const label = card.querySelector("[data-notification-permission]");
  if (!label) return;

  if (!isSupported()) {
    label.textContent = "通知: この表示環境では未対応";
    return;
  }

  if (Notification.permission === "granted") {
    label.textContent = "通知: 許可済み";
  } else if (Notification.permission === "denied") {
    label.textContent = "通知: ブロック中";
  } else {
    label.textContent = "通知: 未設定";
  }
}

async function requestPermission(card) {
  if (!isSupported()) {
    setStatus(card, "この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
    updatePermission(card);
    return;
  }

  try {
    await registerWorker();
    await Notification.requestPermission();
    updatePermission(card);
    setStatus(card, Notification.permission === "granted" ? "通知を許可しました。" : "通知許可は完了していません。");
  } catch {
    setStatus(card, "通知許可の準備に失敗しました。");
  }
}

async function sendTest(card) {
  if (!isSupported()) {
    setStatus(card, "この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
    updatePermission(card);
    return;
  }

  if (Notification.permission !== "granted") {
    setStatus(card, "先に通知を許可してください。");
    updatePermission(card);
    return;
  }

  try {
    const registration = await registerWorker();
    await registration.showNotification("星空Village", {
      body: "R.Connect通知のテストです。",
      icon: "/images/icons/hoshizora-village-icon-192.png",
      badge: "/images/icons/favicon-32.png",
      data: { url: "/" },
    });
    setStatus(card, "テスト通知を送りました。");
  } catch {
    setStatus(card, "テスト通知に失敗しました。");
  }
}

function createCard() {
  const card = document.createElement("section");
  card.id = CARD_ID;
  card.className = "mt-5 rounded-[28px] border border-cyan-300/25 bg-cyan-300/10 p-5 text-cyan-50";

  const title = document.createElement("h2");
  title.className = "text-xl font-black text-white";
  title.textContent = "スマホ通知テスト";

  const description = document.createElement("p");
  description.className = "mt-2 text-sm leading-6 text-slate-200";
  description.textContent = "この端末でR.Connect通知を表示できるか確認します。iPhoneではホーム画面に追加した星空Villageから試してください。";

  const permission = document.createElement("p");
  permission.className = "mt-3 text-xs font-bold text-cyan-100";
  permission.dataset.notificationPermission = "true";

  const actions = document.createElement("div");
  actions.className = "mt-4 flex flex-wrap gap-3";

  const allowButton = document.createElement("button");
  allowButton.type = "button";
  allowButton.className = "rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100";
  allowButton.textContent = "通知を許可";
  allowButton.addEventListener("click", () => void requestPermission(card));

  const testButton = document.createElement("button");
  testButton.type = "button";
  testButton.className = allowButton.className;
  testButton.textContent = "テスト通知";
  testButton.addEventListener("click", () => void sendTest(card));

  const status = document.createElement("p");
  status.className = "mt-3 text-xs leading-5 text-cyan-100/80";
  status.dataset.notificationStatus = "true";

  actions.append(allowButton, testButton);
  card.append(title, description, permission, actions, status);
  updatePermission(card);

  if (!isSupported()) {
    allowButton.disabled = true;
    testButton.disabled = true;
    setStatus(card, "この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
  } else {
    void registerWorker().catch(() => setStatus(card, "通知準備に失敗しました。"));
  }

  return card;
}

function syncCard() {
  const root = findRConnectRoot();
  const existing = document.getElementById(CARD_ID);

  if (!root) {
    existing?.remove();
    return;
  }

  if (existing) {
    updatePermission(existing);
    return;
  }

  root.append(createCard());
}

function queueSyncCard() {
  if (syncQueued) return;
  syncQueued = true;
  window.requestAnimationFrame(() => {
    syncQueued = false;
    syncCard();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", queueSyncCard);
  window.addEventListener("focus", queueSyncCard);

  const observer = new MutationObserver(queueSyncCard);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

const RECONNECT_NOTIFICATION_DESCRIPTION =
  "この端末でRe:Connect通知を表示できるか確認します。";
const LEGACY_RECONNECT_NOTIFICATION_DESCRIPTION =
  "この端末でRe:Connect通知を表示できるか確認します。iPhoneではホーム画面に追加した星空Villageから試してください。";
const LEGACY_UNSUPPORTED_MESSAGE =
  "この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。";
const UNSUPPORTED_MESSAGE = "この表示環境では通知テストを利用できません。";

export function getReconnectNotificationPlatform(environment = {}) {
  const userAgent = String(
    environment.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : ""),
  );
  const platform = String(
    environment.platform ?? (typeof navigator !== "undefined" ? navigator.platform : ""),
  );
  const maxTouchPoints = Number(
    environment.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0),
  );

  if (/Android/i.test(userAgent)) {
    return "android";
  }

  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return "ios";
  }

  return "other";
}

export function getReconnectNotificationCopy(environment = {}) {
  const platform = getReconnectNotificationPlatform(environment);

  if (platform === "ios") {
    return {
      description: RECONNECT_NOTIFICATION_DESCRIPTION,
      note: "⚠️ iPhoneでは、星空Villageをホーム画面に追加しないと通知を受け取れません。",
      title: "iPhone Re:Connectテスト",
    };
  }

  if (platform === "android") {
    return {
      description: RECONNECT_NOTIFICATION_DESCRIPTION,
      note: "ホーム画面に追加すると、星空Villageをよりアプリらしく楽しめます。",
      title: "Android Re:Connectテスト",
    };
  }

  return {
    description: RECONNECT_NOTIFICATION_DESCRIPTION,
    note: "",
    title: "スマホ通知テスト",
  };
}

function replaceNotificationDescription(node, copy) {
  const element = node.parentElement;

  if (!element || element.dataset.reconnectPlatformCopy === "true") {
    return false;
  }

  element.replaceChildren(document.createTextNode(copy.description));

  if (copy.note) {
    element.append(document.createElement("br"), document.createTextNode(copy.note));
  }

  element.dataset.reconnectPlatformCopy = "true";
  return true;
}

function enhanceTextNode(node, copy) {
  const currentText = node.textContent?.trim() ?? "";

  if (currentText === "スマホ通知テスト") {
    node.textContent = copy.title;
    return;
  }

  if (currentText === LEGACY_RECONNECT_NOTIFICATION_DESCRIPTION) {
    replaceNotificationDescription(node, copy);
    return;
  }

  if (currentText === LEGACY_UNSUPPORTED_MESSAGE) {
    node.textContent = UNSUPPORTED_MESSAGE;
  }
}

function enhanceReconnectNotificationCopy(root = document.body) {
  if (!root) {
    return;
  }

  const copy = getReconnectNotificationCopy();
  const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (treeWalker.nextNode()) {
    enhanceTextNode(treeWalker.currentNode, copy);
  }
}

let syncQueued = false;

function queueReconnectNotificationCopySync() {
  if (syncQueued) {
    return;
  }

  syncQueued = true;
  window.requestAnimationFrame(() => {
    syncQueued = false;
    enhanceReconnectNotificationCopy();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", queueReconnectNotificationCopySync);

  const observer = new MutationObserver(queueReconnectNotificationCopySync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

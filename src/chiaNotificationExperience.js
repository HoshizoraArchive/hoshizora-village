const CHIA_NOTIFICATION_REPLACEMENTS = new Map([
  [
    "星空ちあさんがあなたの流星便に共鳴しました。",
    "星空ちあが、あなたの流星便をそっと観測しました。",
  ],
  [
    "星空ちあさんがあなたの流星便に共鳴しました。",
    "星空ちあが、あなたの流星便をそっと観測しました。",
  ],
  [
    "chia_hoshizoraさんがあなたの流星便に共鳴しました。",
    "星空ちあが、あなたの流星便をそっと観測しました。",
  ],
  [
    "星空ちあさんがあなたの流星便に星文を送りました。",
    "星空ちあが、あなたの流星便に星文を届けました。",
  ],
  [
    "星空ちあさんがあなたの流星便に星文を送りました。",
    "星空ちあが、あなたの流星便に星文を届けました。",
  ],
  [
    "chia_hoshizoraさんがあなたの流星便に星文を送りました。",
    "星空ちあが、あなたの流星便に星文を届けました。",
  ],
]);

function enhanceTextNode(node) {
  const currentText = node.textContent ?? "";
  const replacement = CHIA_NOTIFICATION_REPLACEMENTS.get(currentText.trim());

  if (!replacement || currentText === replacement) {
    return;
  }

  node.textContent = currentText.replace(currentText.trim(), replacement);
}

function enhanceChiaNotificationCopy(root = document.body) {
  if (!root) {
    return;
  }

  const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (treeWalker.nextNode()) {
    enhanceTextNode(treeWalker.currentNode);
  }
}

let syncQueued = false;

function queueEnhanceChiaNotificationCopy() {
  if (syncQueued) {
    return;
  }

  syncQueued = true;
  window.requestAnimationFrame(() => {
    syncQueued = false;
    enhanceChiaNotificationCopy();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", queueEnhanceChiaNotificationCopy);

  const observer = new MutationObserver(queueEnhanceChiaNotificationCopy);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

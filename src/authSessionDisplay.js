function findHeaderAuthPanel() {
  return [...document.querySelectorAll("header section")].find((section) =>
    section.textContent?.includes("Supabase Auth"),
  );
}

function findSettingsStatusCard() {
  const statusLabel = [...document.querySelectorAll("p")].find(
    (paragraph) => paragraph.textContent?.trim() === "ログイン状態",
  );

  return statusLabel?.parentElement ?? null;
}

function readLoggedInEmail(panel) {
  const text = panel?.textContent ?? "";
  const match = text.match(/([^\s]+@[^\s]+)\s*でログイン中/);
  return match?.[1] ?? "";
}

function syncAuthSessionDisplay() {
  const panel = findHeaderAuthPanel();

  if (!panel) {
    return;
  }

  const isLoggedIn = !panel.querySelector("form") && panel.textContent?.includes("ログイン中");
  const header = panel.closest("header");
  const email = isLoggedIn ? readLoggedInEmail(panel) : "";

  panel.hidden = Boolean(isLoggedIn);
  panel.dataset.authSessionPanel = isLoggedIn ? "logged-in" : "guest";

  if (header) {
    header.dataset.authPanel = isLoggedIn ? "hidden" : "visible";
  }

  if (!email) {
    document.querySelectorAll("[data-auth-email-mirror]").forEach((node) => {
      node.remove();
    });
    return;
  }

  const settingsStatusCard = findSettingsStatusCard();

  if (!settingsStatusCard) {
    document.querySelectorAll("[data-auth-email-mirror]").forEach((node) => {
      node.remove();
    });
    return;
  }

  document.querySelectorAll("[data-auth-email-mirror]").forEach((node) => {
    if (node.parentElement !== settingsStatusCard) {
      node.remove();
    }
  });

  const existingEmailNode = settingsStatusCard.querySelector("[data-auth-email-mirror]");

  if (existingEmailNode) {
    if (existingEmailNode.textContent !== email) {
      existingEmailNode.textContent = email;
    }

    return;
  }

  const emailNode = document.createElement("p");
  emailNode.dataset.authEmailMirror = "true";
  emailNode.className = "mt-1 break-all text-xs leading-5 text-slate-400";
  emailNode.textContent = email;
  settingsStatusCard.append(emailNode);
}

let syncQueued = false;

function queueSyncAuthSessionDisplay() {
  if (syncQueued) {
    return;
  }

  syncQueued = true;
  window.requestAnimationFrame(() => {
    syncQueued = false;
    syncAuthSessionDisplay();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", queueSyncAuthSessionDisplay);

  const observer = new MutationObserver(queueSyncAuthSessionDisplay);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

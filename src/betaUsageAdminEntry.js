import { supabase } from "./lib/supabaseClient";

const PROFILE_HEADER_ACTIONS_SELECTOR = ".profile-card-header-actions";
const ADMIN_ENTRY_ATTRIBUTE = "data-beta-usage-admin-entry";
const BETA_USAGE_ADMIN_PATH = "/admin/beta-usage";

let adminAccess = false;
let accessRequestVersion = 0;
let observer = null;

function removeAdminEntries() {
  document.querySelectorAll(`[${ADMIN_ENTRY_ATTRIBUTE}]`).forEach((entry) => entry.remove());
}

function createAdminEntry() {
  const button = document.createElement("button");
  button.setAttribute(ADMIN_ENTRY_ATTRIBUTE, "true");
  button.setAttribute("aria-label", "運営・β利用状況を開く");
  button.className =
    "min-h-9 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-black text-amber-100 transition hover:border-amber-200/45 hover:bg-amber-300/15 hover:text-white";
  button.textContent = "運営";
  button.title = "β利用状況";
  button.type = "button";
  button.addEventListener("click", () => {
    window.location.assign(BETA_USAGE_ADMIN_PATH);
  });
  return button;
}

function syncAdminEntry() {
  if (!adminAccess) {
    removeAdminEntries();
    return;
  }

  document.querySelectorAll(PROFILE_HEADER_ACTIONS_SELECTOR).forEach((actions) => {
    if (actions.querySelector(`[${ADMIN_ENTRY_ATTRIBUTE}]`)) {
      return;
    }

    actions.prepend(createAdminEntry());
  });
}

async function refreshAdminAccess() {
  const requestVersion = ++accessRequestVersion;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (requestVersion !== accessRequestVersion) {
    return;
  }

  if (sessionError || !sessionData?.session?.user?.id) {
    adminAccess = false;
    syncAdminEntry();
    return;
  }

  const { data, error } = await supabase.rpc("is_app_admin");

  if (requestVersion !== accessRequestVersion) {
    return;
  }

  adminAccess = !error && data === true;
  syncAdminEntry();
}

function startBetaUsageAdminEntry() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === BETA_USAGE_ADMIN_PATH) {
    return;
  }

  const startObserver = () => {
    if (!document.body || observer) {
      return;
    }

    observer = new MutationObserver(() => {
      syncAdminEntry();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    syncAdminEntry();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }

  void refreshAdminAccess();

  supabase.auth.onAuthStateChange(() => {
    window.setTimeout(() => {
      void refreshAdminAccess();
    }, 0);
  });
}

startBetaUsageAdminEntry();

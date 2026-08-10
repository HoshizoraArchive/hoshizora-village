import { supabase } from "./lib/supabaseClient";

const CHIA_USERNAME = "chia_hoshizora";
const CHIA_USERNAME_LABEL = `@${CHIA_USERNAME}`;
const SETTING_ATTRIBUTE = "data-chia-post-notification-setting";
const BANNER_ATTRIBUTE = "data-chia-post-banner";
let chiaProfileId = null;
let currentUserId = null;
let postChannel = null;
let observer = null;
let bannerTimer = null;
let settingSyncInFlight = false;

function removeBanner() {
  document.querySelector(`[${BANNER_ATTRIBUTE}]`)?.remove();
  if (bannerTimer) {
    window.clearTimeout(bannerTimer);
    bannerTimer = null;
  }
}

function showChiaPostBanner(post) {
  if (!post?.id || !currentUserId || post.author_id === currentUserId) return;

  removeBanner();
  const root = document.createElement("div");
  root.setAttribute(BANNER_ATTRIBUTE, "true");
  Object.assign(root.style, {
    position: "fixed",
    top: "max(14px, env(safe-area-inset-top))",
    left: "14px",
    right: "14px",
    zIndex: "99999",
    maxWidth: "680px",
    margin: "0 auto",
    border: "1px solid rgba(116, 225, 255, 0.38)",
    borderRadius: "20px",
    background: "rgba(7, 12, 29, 0.96)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
    color: "white",
    padding: "14px",
    backdropFilter: "blur(18px)",
  });

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "12px";
  row.style.alignItems = "center";

  const content = document.createElement("button");
  content.type = "button";
  content.style.flex = "1";
  content.style.textAlign = "left";
  content.style.background = "transparent";
  content.style.border = "0";
  content.style.color = "inherit";
  content.style.padding = "0";
  content.innerHTML = '<div style="font-size:11px;font-weight:900;letter-spacing:.12em;color:#73ddff">✨ 星空ちあから流星便</div><div style="margin-top:4px;font-size:14px;font-weight:800">星空ちあが流星便を放流しました</div><div style="margin-top:5px;font-size:11px;color:#8f9bb4">タップして流星便を見る</div>';
  content.addEventListener("click", () => {
    window.location.assign(`/meteor/${encodeURIComponent(post.id)}`);
  });

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "通知を閉じる");
  close.textContent = "×";
  Object.assign(close.style, {
    background: "transparent",
    border: "0",
    color: "#94a3b8",
    fontSize: "24px",
    padding: "4px 6px",
  });
  close.addEventListener("click", removeBanner);

  row.append(content, close);
  root.append(row);
  document.body.append(root);
  bannerTimer = window.setTimeout(removeBanner, 9000);
}

async function resolveChiaProfileId() {
  if (chiaProfileId) return chiaProfileId;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", CHIA_USERNAME)
    .maybeSingle();
  if (!error && data?.id) chiaProfileId = data.id;
  return chiaProfileId;
}

async function startPostChannel() {
  if (postChannel) {
    await supabase.removeChannel(postChannel);
    postChannel = null;
  }
  const id = await resolveChiaProfileId();
  if (!id || !currentUserId) return;

  postChannel = supabase
    .channel(`chia-post-banner-${currentUserId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "posts", filter: `author_id=eq.${id}` },
      (payload) => {
        if (document.visibilityState !== "hidden") showChiaPostBanner(payload.new);
      },
    )
    .subscribe();
}

function findChiaStarChartAnchor() {
  const page = document.querySelector(".public-profile-page");
  if (!page) return null;

  const chiaUsername = Array.from(page.querySelectorAll("p, span")).find(
    (element) => element.textContent?.trim() === CHIA_USERNAME_LABEL,
  );
  if (!chiaUsername) return null;

  const profileSurface = chiaUsername.closest(".profile-surface");
  if (!profileSurface) return null;

  const starChartLabel = Array.from(profileSurface.querySelectorAll("p")).find(
    (element) => element.textContent?.trim() === "My Star Chart",
  );
  return starChartLabel?.parentElement ?? null;
}

function updateToggleVisual(button, checked) {
  button.setAttribute("aria-checked", String(checked));
  button.dataset.checked = String(checked);
  button.innerHTML = `
    <span style="position:absolute;top:3px;left:${checked ? "25px" : "3px"};width:22px;height:22px;border-radius:999px;background:${checked ? "#06101d" : "#dbeafe"};box-shadow:0 2px 8px rgba(0,0,0,.28);transition:left .18s ease"></span>
  `;
  Object.assign(button.style, {
    background: checked
      ? "linear-gradient(90deg, rgba(116,225,255,.95), rgba(198,149,255,.95), rgba(255,145,205,.95))"
      : "rgba(100,116,139,.42)",
    borderColor: checked ? "rgba(116,225,255,.55)" : "rgba(148,163,184,.25)",
  });
}

function buildProfileToggle(checked) {
  const card = document.createElement("section");
  card.setAttribute(SETTING_ATTRIBUTE, "true");
  card.className = "mt-3 rounded-2xl border border-comet/20 bg-night-950/45 px-3 py-3 backdrop-blur-sm";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "14px";

  const copy = document.createElement("div");
  copy.style.minWidth = "0";
  copy.innerHTML = `
    <p style="font-size:12px;font-weight:900;color:#8be8ff">✦ ちあの流星便通知</p>
    <p style="margin-top:5px;font-size:12px;line-height:1.65;color:#d7e0ef">ちあが流星便を放流したら、スマホにお知らせします。</p>
    <p style="margin-top:4px;font-size:10px;line-height:1.55;color:#7f8ba3">Village内のRe:Connectとバナーは、この設定に関係なく届きます。</p>
  `;

  const control = document.createElement("div");
  control.style.display = "flex";
  control.style.flexDirection = "column";
  control.style.alignItems = "center";
  control.style.gap = "5px";
  control.style.flexShrink = "0";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", "星空ちあの流星便スマホ通知");
  Object.assign(toggle.style, {
    position: "relative",
    width: "50px",
    height: "28px",
    borderRadius: "999px",
    border: "1px solid",
    padding: "0",
    transition: "background .18s ease,border-color .18s ease,opacity .18s ease",
  });
  updateToggleVisual(toggle, checked);

  const stateLabel = document.createElement("span");
  stateLabel.style.fontSize = "10px";
  stateLabel.style.fontWeight = "900";
  stateLabel.style.color = checked ? "#8be8ff" : "#94a3b8";
  stateLabel.textContent = checked ? "ON" : "OFF";

  const message = document.createElement("p");
  message.setAttribute("data-chia-post-setting-message", "true");
  message.style.marginTop = "7px";
  message.style.fontSize = "10px";
  message.style.minHeight = "1em";
  message.style.color = "#7f8ba3";

  toggle.addEventListener("click", async () => {
    if (!currentUserId || toggle.disabled) return;

    const previousValue = toggle.dataset.checked === "true";
    const nextValue = !previousValue;
    toggle.disabled = true;
    toggle.style.opacity = ".62";
    message.textContent = "保存中...";
    updateToggleVisual(toggle, nextValue);
    stateLabel.textContent = nextValue ? "ON" : "OFF";
    stateLabel.style.color = nextValue ? "#8be8ff" : "#94a3b8";

    const { error } = await supabase
      .from("profiles")
      .update({ notify_chia_posts: nextValue })
      .eq("id", currentUserId);

    if (error) {
      updateToggleVisual(toggle, previousValue);
      stateLabel.textContent = previousValue ? "ON" : "OFF";
      stateLabel.style.color = previousValue ? "#8be8ff" : "#94a3b8";
      message.textContent = "保存できませんでした。もう一度お試しください。";
    } else {
      message.textContent = nextValue ? "ちあのスマホ通知をONにしました。" : "ちあのスマホ通知をOFFにしました。";
    }

    toggle.disabled = false;
    toggle.style.opacity = "1";
  });

  control.append(toggle, stateLabel);
  row.append(copy, control);
  card.append(row, message);
  return card;
}

async function syncSetting() {
  if (!currentUserId || settingSyncInFlight || document.querySelector(`[${SETTING_ATTRIBUTE}]`)) return;

  const starChartAnchor = findChiaStarChartAnchor();
  if (!starChartAnchor) return;

  settingSyncInFlight = true;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("notify_chia_posts")
      .eq("id", currentUserId)
      .maybeSingle();

    if (error || document.querySelector(`[${SETTING_ATTRIBUTE}]`)) return;

    starChartAnchor.insertAdjacentElement("afterend", buildProfileToggle(data?.notify_chia_posts !== false));
  } finally {
    settingSyncInFlight = false;
  }
}

function startObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver(() => void syncSetting());
  observer.observe(document.body, { childList: true, subtree: true });
  void syncSetting();
}

async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  currentUserId = data?.session?.user?.id ?? null;
  document.querySelector(`[${SETTING_ATTRIBUTE}]`)?.remove();
  await startPostChannel();
  void syncSetting();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
  void refreshSession();
  supabase.auth.onAuthStateChange(() => window.setTimeout(() => void refreshSession(), 0));
}

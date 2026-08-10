import { supabase } from "./lib/supabaseClient";

const CHIA_USERNAME = "chia_hoshizora";
const SETTING_ATTRIBUTE = "data-chia-post-notification-setting";
const BANNER_ATTRIBUTE = "data-chia-post-banner";
let chiaProfileId = null;
let currentUserId = null;
let postChannel = null;
let observer = null;
let bannerTimer = null;

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
  Object.assign(close.style, { background: "transparent", border: "0", color: "#94a3b8", fontSize: "24px", padding: "4px 6px" });
  close.addEventListener("click", removeBanner);

  row.append(content, close);
  root.append(row);
  document.body.append(root);
  bannerTimer = window.setTimeout(removeBanner, 9000);
}

async function resolveChiaProfileId() {
  if (chiaProfileId) return chiaProfileId;
  const { data, error } = await supabase.from("profiles").select("id").eq("username", CHIA_USERNAME).maybeSingle();
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
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: `author_id=eq.${id}` }, (payload) => {
      if (document.visibilityState !== "hidden") showChiaPostBanner(payload.new);
    })
    .subscribe();
}

function buildSettingForm(checked) {
  const form = document.createElement("form");
  form.setAttribute(SETTING_ATTRIBUTE, "true");
  form.className = "rounded-2xl border border-white/10 bg-night-950/35 px-3 py-3";
  form.innerHTML = `
    <label class="flex items-start gap-3">
      <input name="notify_chia_posts" type="checkbox" ${checked ? "checked" : ""} class="mt-1 h-4 w-4 accent-cyan-300" />
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-black text-white">ちあの流星便をスマホ通知する</span>
        <span class="mt-1 block text-xs leading-6 text-slate-400">OFFにしても、Village内のRe:Connectとバナーにはちあの流星便が届きます。</span>
      </span>
    </label>
    <div class="mt-3 flex items-center justify-between gap-3">
      <span data-chia-post-setting-message class="text-[11px] text-slate-500"></span>
      <button type="submit" class="min-h-9 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-200">保存</button>
    </div>`;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const checkbox = form.querySelector('input[name="notify_chia_posts"]');
    const button = form.querySelector('button[type="submit"]');
    const message = form.querySelector("[data-chia-post-setting-message]");
    button.disabled = true;
    message.textContent = "保存中...";
    const { error } = await supabase.from("profiles").update({ notify_chia_posts: Boolean(checkbox.checked) }).eq("id", currentUserId);
    message.textContent = error ? "保存できませんでした" : "保存しました";
    button.disabled = false;
  });
  return form;
}

async function syncSetting() {
  if (!currentUserId || document.querySelector(`[${SETTING_ATTRIBUTE}]`)) return;
  const anchor = document.querySelector('input[name="notify_authors_when_i_archive"]')?.closest("form")
    ?? document.querySelector('input[name="notify_authors_when_i_resonate"]')?.closest("form");
  if (!anchor?.parentElement) return;

  const { data, error } = await supabase.from("profiles").select("notify_chia_posts").eq("id", currentUserId).maybeSingle();
  if (error || document.querySelector(`[${SETTING_ATTRIBUTE}]`)) return;
  anchor.parentElement.append(buildSettingForm(data?.notify_chia_posts !== false));
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();
  void refreshSession();
  supabase.auth.onAuthStateChange(() => window.setTimeout(() => void refreshSession(), 0));
}

import { supabase } from "./lib/supabaseClient";

const MENTION_PATTERN = /@([A-Za-z0-9_]{1,64})/g;
const INVALID_PREFIX_PATTERN = /[A-Za-z0-9._%+-]/;
const INVALID_SUFFIX_PATTERN = /[A-Za-z0-9_-]/;
const TARGET_SELECTOR = "p.whitespace-pre-wrap";
const DECORATED_ATTRIBUTE = "data-profile-mentions-decorated";
const PROFILE_LINK_ATTRIBUTE = "data-profile-mention-username";
let decorationFrame = 0;

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function buildStarProfilePath(username) {
  const normalized = normalizeUsername(username);
  return normalized ? `/stars/${encodeURIComponent(normalized)}` : "";
}

function navigateToStarProfile(username) {
  const nextPath = buildStarProfilePath(username);
  if (!nextPath) return;

  if (window.location.pathname !== nextPath) {
    window.history.pushState({ hoshizoraRoute: "starProfile" }, "", nextPath);
  }
  window.dispatchEvent(new PopStateEvent("popstate", {
    state: { hoshizoraRoute: "starProfile" },
  }));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function isStandaloneMention(source, match) {
  const atIndex = match.index ?? -1;
  if (atIndex < 0) return false;

  const before = atIndex > 0 ? source[atIndex - 1] : "";
  const afterIndex = atIndex + match[0].length;
  const after = afterIndex < source.length ? source[afterIndex] : "";

  if (before && INVALID_PREFIX_PATTERN.test(before)) return false;
  if (after && INVALID_SUFFIX_PATTERN.test(after)) return false;
  return true;
}

function collectUsernames(root) {
  const usernames = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    if (!node.parentElement?.closest("a, button, code, pre")) {
      const source = String(node.nodeValue || "");
      for (const match of source.matchAll(MENTION_PATTERN)) {
        if (!isStandaloneMention(source, match)) continue;
        usernames.add(match[1]);
      }
    }
    node = walker.nextNode();
  }

  return [...usernames];
}

async function resolveProfiles(usernames) {
  if (!usernames.length) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name")
    .in("username", usernames);

  if (error) return new Map();
  return new Map((data || []).map((profile) => [profile.username, profile]));
}

function decorateTextNode(node, profiles) {
  if (!node?.parentNode || node.parentElement?.closest("a, button, code, pre")) return;
  const text = String(node.nodeValue || "");
  MENTION_PATTERN.lastIndex = 0;
  const matches = [...text.matchAll(MENTION_PATTERN)].filter((match) => isStandaloneMention(text, match));
  if (!matches.length) return;

  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of matches) {
    const profile = profiles.get(match[1]);
    if (!profile) continue;

    if (match.index > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(PROFILE_LINK_ATTRIBUTE, profile.username);
    button.setAttribute("aria-label", `${profile.display_name || profile.username}のプロフィールを見る`);
    button.className = "profile-mention-link";
    button.textContent = profile.display_name || `@${profile.username}`;
    fragment.append(button);
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return;
  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
  node.parentNode.replaceChild(fragment, node);
}

async function decorateRoot(root) {
  if (!root || root.hasAttribute(DECORATED_ATTRIBUTE)) return;
  const usernames = collectUsernames(root);
  if (!usernames.length) {
    root.setAttribute(DECORATED_ATTRIBUTE, "true");
    return;
  }

  const profiles = await resolveProfiles(usernames);
  if (!root.isConnected) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  nodes.forEach((textNode) => decorateTextNode(textNode, profiles));
  root.setAttribute(DECORATED_ATTRIBUTE, "true");
}

function scheduleDecoration() {
  if (decorationFrame) return;
  decorationFrame = window.requestAnimationFrame(() => {
    decorationFrame = 0;
    document.querySelectorAll(TARGET_SELECTOR).forEach((root) => void decorateRoot(root));
  });
}

function handleMentionClick(event) {
  if (!(event.target instanceof Element)) return;
  const target = event.target.closest(`[${PROFILE_LINK_ATTRIBUTE}]`);
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  navigateToStarProfile(target.getAttribute(PROFILE_LINK_ATTRIBUTE));
}

if (typeof document !== "undefined") {
  scheduleDecoration();
  const observer = new MutationObserver(scheduleDecoration);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", handleMentionClick, true);
}

export { buildStarProfilePath, normalizeUsername };

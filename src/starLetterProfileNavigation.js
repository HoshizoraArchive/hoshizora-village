const STAR_LETTER_SELECTOR = 'article[id^="star-letter-"]';
const PROFILE_LINK_ATTRIBUTE = "data-star-letter-profile-username";
const SENT_STAR_LETTER_SOURCE_LABEL = "元の流星便";

let decorationFrame = 0;

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[.,!?;:、。！？）」』】]+$/u, "");
}

function extractUsernameFromText(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:^|\s)@([^\s·]+)/u);

  if (match?.[1]) {
    return normalizeUsername(match[1]);
  }

  return text.startsWith("@") ? normalizeUsername(text) : "";
}

function buildStarProfilePath(username) {
  const normalized = normalizeUsername(username);
  return normalized ? `/stars/${encodeURIComponent(normalized)}` : "";
}

function navigateToStarProfile(username) {
  const normalized = normalizeUsername(username);
  const nextPath = buildStarProfilePath(normalized);

  if (!nextPath) {
    return;
  }

  if (window.location.pathname !== nextPath) {
    window.history.pushState({ hoshizoraRoute: "starProfile" }, "", nextPath);
  }

  window.dispatchEvent(new PopStateEvent("popstate", {
    state: { hoshizoraRoute: "starProfile" },
  }));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function makeProfileLink(element, username, displayName) {
  const normalized = normalizeUsername(username);

  if (!element || !normalized) {
    return;
  }

  element.setAttribute(PROFILE_LINK_ATTRIBUTE, normalized);
  element.setAttribute("aria-label", `${displayName || normalized}のプロフィールを見る`);
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.classList.add("star-letter-profile-link");
}

function findHandleElement(root) {
  if (!root) {
    return null;
  }

  return Array.from(root.querySelectorAll("span, p, button")).find((element) =>
    Boolean(extractUsernameFromText(element.textContent)),
  ) ?? null;
}

function getDisplayName(root, username) {
  const text = String(root?.textContent || "")
    .replace(`@${username}`, "")
    .split("·")[0]
    .trim();

  return text || username;
}

function decorateThreadStarLetter(article) {
  if (!article?.matches?.(STAR_LETTER_SELECTOR)) {
    return;
  }

  const authorRow = article.querySelector(":scope > div");
  const avatarElement = authorRow?.firstElementChild;
  const identityColumn = avatarElement?.nextElementSibling;
  const identityRow = identityColumn?.firstElementChild;
  const handleElement = findHandleElement(identityRow);
  const username = extractUsernameFromText(handleElement?.textContent || identityRow?.textContent);

  if (!username) {
    return;
  }

  const displayName = getDisplayName(identityRow, username);

  makeProfileLink(avatarElement, username, displayName);
  makeProfileLink(identityRow, username, displayName);
}

function findSentStarLetterSourceContainer(article) {
  const sourceLabel = Array.from(article?.querySelectorAll?.("p") || []).find(
    (element) => element.textContent?.trim() === SENT_STAR_LETTER_SOURCE_LABEL,
  );

  return sourceLabel?.parentElement ?? null;
}

function decorateSentStarLetterCard(article) {
  const sourceContainer = findSentStarLetterSourceContainer(article);

  if (!sourceContainer) {
    return;
  }

  const authorRow = article.querySelector(":scope > div");
  const avatarElement = authorRow?.firstElementChild;
  const identityColumn = avatarElement?.nextElementSibling;
  const identityRow = identityColumn?.firstElementChild;
  const authorUsername = extractUsernameFromText(identityRow?.textContent);

  if (authorUsername) {
    const displayName = getDisplayName(identityRow, authorUsername);
    makeProfileLink(avatarElement, authorUsername, displayName);
    makeProfileLink(identityRow, authorUsername, displayName);
  }

  const sourceIdentity = Array.from(sourceContainer.querySelectorAll("p")).find(
    (element) => extractUsernameFromText(element.textContent),
  );
  const sourceUsername = extractUsernameFromText(sourceIdentity?.textContent);

  if (sourceUsername) {
    makeProfileLink(sourceIdentity, sourceUsername, getDisplayName(sourceIdentity, sourceUsername));
  }
}

function decorateArticle(article) {
  decorateThreadStarLetter(article);
  decorateSentStarLetterCard(article);
}

function decorateStarLetterProfiles() {
  document.querySelectorAll("article").forEach(decorateArticle);
}

function scheduleDecoration() {
  if (decorationFrame) {
    return;
  }

  decorationFrame = window.requestAnimationFrame(() => {
    decorationFrame = 0;
    decorateStarLetterProfiles();
  });
}

function getProfileLinkTarget(event) {
  if (!(event.target instanceof Element)) {
    return null;
  }

  let target = event.target.closest(`[${PROFILE_LINK_ATTRIBUTE}]`);

  if (target) {
    return target;
  }

  const article = event.target.closest("article");

  if (!article) {
    return null;
  }

  decorateArticle(article);
  target = event.target.closest(`[${PROFILE_LINK_ATTRIBUTE}]`);
  return target;
}

function handleProfileLinkClick(event) {
  const target = getProfileLinkTarget(event);

  if (!target) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  navigateToStarProfile(target.getAttribute(PROFILE_LINK_ATTRIBUTE));
}

function handleProfileLinkKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const target = getProfileLinkTarget(event);

  if (!target) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  navigateToStarProfile(target.getAttribute(PROFILE_LINK_ATTRIBUTE));
}

if (typeof document !== "undefined") {
  scheduleDecoration();

  const observer = new MutationObserver(scheduleDecoration);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // StarLettersPanel stops bubbling so the post card itself does not open.
  // Listen during capture so profile navigation runs before that stopPropagation.
  document.addEventListener("click", handleProfileLinkClick, true);
  document.addEventListener("keydown", handleProfileLinkKeydown, true);
}

export { buildStarProfilePath, extractUsernameFromText, normalizeUsername };

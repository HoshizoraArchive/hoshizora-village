const STAR_LETTER_SELECTOR = 'article[id^="star-letter-"]';
const PROFILE_LINK_ATTRIBUTE = "data-star-letter-profile-username";

let decorationFrame = 0;

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@/, "");
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
  if (!element || element.hasAttribute(PROFILE_LINK_ATTRIBUTE)) {
    return;
  }

  element.setAttribute(PROFILE_LINK_ATTRIBUTE, username);
  element.setAttribute("aria-label", `${displayName || username}のプロフィールを見る`);
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.classList.add("star-letter-profile-link");
}

function decorateStarLetter(article) {
  const identityRow = article.querySelector(":scope > div > div > div");

  if (!identityRow) {
    return;
  }

  const textElements = Array.from(identityRow.querySelectorAll("span"));
  const handleElement = textElements.find((element) => element.textContent?.trim().startsWith("@"));
  const username = normalizeUsername(handleElement?.textContent);

  if (!username) {
    return;
  }

  const nameElement = textElements.find((element) => {
    const text = element.textContent?.trim();
    return text && !text.startsWith("@") && !text.startsWith("·") && text !== "削除済み";
  });
  const displayName = nameElement?.textContent?.trim() || handleElement.textContent?.trim() || username;
  const authorColumn = article.querySelector(":scope > div");
  const avatarElement = authorColumn?.firstElementChild;

  makeProfileLink(avatarElement, username, displayName);
  makeProfileLink(nameElement, username, displayName);
  makeProfileLink(handleElement, username, displayName);
}

function decorateStarLetterProfiles() {
  document.querySelectorAll(STAR_LETTER_SELECTOR).forEach(decorateStarLetter);
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
  return event.target instanceof Element
    ? event.target.closest(`[${PROFILE_LINK_ATTRIBUTE}]`)
    : null;
}

function handleProfileLinkClick(event) {
  const target = getProfileLinkTarget(event);

  if (!target) {
    return;
  }

  event.preventDefault();
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

export { buildStarProfilePath, normalizeUsername };

const STAR_CHART_ENTRY_LABEL = "My Star Chart";
const STAR_CHART_OPEN_CLASS = "my-star-chart-preview-open";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let activeOverlay = null;
let lastTrigger = null;
let decorationFrame = 0;

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text) {
    element.textContent = text;
  }

  return element;
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });

  return element;
}

function buildConstellationGraphic() {
  const svg = createSvgElement("svg", {
    "aria-hidden": "true",
    class: "my-star-chart-preview__constellation",
    viewBox: "0 0 760 460",
  });

  const glow = createSvgElement("defs");
  const filter = createSvgElement("filter", {
    height: "180%",
    id: "my-star-chart-star-glow",
    width: "180%",
    x: "-40%",
    y: "-40%",
  });
  const blur = createSvgElement("feGaussianBlur", { result: "blur", stdDeviation: "5" });
  const merge = createSvgElement("feMerge");
  merge.append(
    createSvgElement("feMergeNode", { in: "blur" }),
    createSvgElement("feMergeNode", { in: "SourceGraphic" }),
  );
  filter.append(blur, merge);
  glow.append(filter);
  svg.append(glow);

  const paths = [
    "M98 304 L196 216 L286 258 L379 150 L472 222 L580 126 L666 198",
    "M196 216 L218 104 L379 150 L420 70",
    "M286 258 L330 354 L472 222 L544 330",
  ];

  paths.forEach((pathData, index) => {
    svg.append(
      createSvgElement("path", {
        class: `my-star-chart-preview__constellation-line line-${index + 1}`,
        d: pathData,
      }),
    );
  });

  const stars = [
    [98, 304, 7],
    [196, 216, 9],
    [218, 104, 6],
    [286, 258, 7],
    [330, 354, 6],
    [379, 150, 10],
    [420, 70, 6],
    [472, 222, 8],
    [544, 330, 6],
    [580, 126, 9],
    [666, 198, 7],
  ];

  stars.forEach(([cx, cy, radius], index) => {
    const starGroup = createSvgElement("g", {
      class: `my-star-chart-preview__star star-${index + 1}`,
      filter: "url(#my-star-chart-star-glow)",
    });
    starGroup.append(
      createSvgElement("circle", { class: "my-star-chart-preview__star-halo", cx, cy, r: radius * 2.5 }),
      createSvgElement("circle", { class: "my-star-chart-preview__star-core", cx, cy, r: radius }),
    );
    svg.append(starGroup);
  });

  return svg;
}

function closeStarChartPreview() {
  if (!activeOverlay) {
    return;
  }

  const overlayToRemove = activeOverlay;
  activeOverlay = null;
  overlayToRemove.classList.remove("is-visible");
  document.documentElement.classList.remove(STAR_CHART_OPEN_CLASS);
  document.body.classList.remove(STAR_CHART_OPEN_CLASS);

  window.setTimeout(() => {
    overlayToRemove.remove();
  }, 240);

  window.requestAnimationFrame(() => {
    lastTrigger?.focus?.({ preventScroll: true });
    lastTrigger = null;
  });
}

function buildPreviewOverlay({ displayName, constellationNote }) {
  const overlay = createElement("section", "my-star-chart-preview");
  overlay.setAttribute("aria-labelledby", "my-star-chart-preview-title");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("role", "dialog");

  const sky = createElement("div", "my-star-chart-preview__sky");
  sky.setAttribute("aria-hidden", "true");
  sky.append(
    createElement("div", "my-star-chart-preview__nebula my-star-chart-preview__nebula--blue"),
    createElement("div", "my-star-chart-preview__nebula my-star-chart-preview__nebula--violet"),
    createElement("div", "my-star-chart-preview__stars my-star-chart-preview__stars--near"),
    createElement("div", "my-star-chart-preview__stars my-star-chart-preview__stars--far"),
    buildConstellationGraphic(),
  );

  const header = createElement("header", "my-star-chart-preview__header");
  const backButton = createElement("button", "my-star-chart-preview__back", "← My Constellationへ戻る");
  backButton.type = "button";
  backButton.addEventListener("click", closeStarChartPreview);
  header.append(backButton);

  const content = createElement("main", "my-star-chart-preview__content");
  const eyebrow = createElement("p", "my-star-chart-preview__eyebrow", "MY STAR CHART");
  const title = createElement(
    "h1",
    "my-star-chart-preview__title",
    `${displayName || "あなた"}の人格星座`,
  );
  title.id = "my-star-chart-preview-title";

  const status = createElement("div", "my-star-chart-preview__status");
  status.append(
    createElement("span", "my-star-chart-preview__status-star", "✦"),
    createElement("p", "my-star-chart-preview__status-text", "ここはまだ実装途中です。"),
  );

  const description = createElement(
    "p",
    "my-star-chart-preview__description",
    "好きなもの、価値観、性格、活動が星になり、あなただけの人格設計図としてつながっていく場所です。",
  );

  content.append(eyebrow, title, status, description);

  if (constellationNote) {
    const coreStar = createElement("div", "my-star-chart-preview__core-star");
    coreStar.append(
      createElement("span", "my-star-chart-preview__core-star-label", "現在の核星"),
      createElement("strong", "my-star-chart-preview__core-star-value", constellationNote),
    );
    content.append(coreStar);
  }

  overlay.append(sky, header, content);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeStarChartPreview();
    }
  });

  return { backButton, overlay };
}

function openStarChartPreview(trigger, profileSection, entryCard) {
  if (activeOverlay) {
    return;
  }

  const displayName = profileSection.querySelector("h2")?.textContent?.trim() || "あなた";
  const constellationNote = entryCard.querySelectorAll("p")[1]?.textContent?.trim() || "";
  const { backButton, overlay } = buildPreviewOverlay({ displayName, constellationNote });

  lastTrigger = trigger;
  activeOverlay = overlay;
  document.documentElement.classList.add(STAR_CHART_OPEN_CLASS);
  document.body.classList.add(STAR_CHART_OPEN_CLASS);
  document.body.append(overlay);

  window.requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
    backButton.focus({ preventScroll: true });
  });
}

function getOwnProfileSection(entryCard) {
  const profileSection = entryCard.closest("section");

  if (!profileSection) {
    return null;
  }

  const hasShareButton = Array.from(profileSection.querySelectorAll("button")).some(
    (button) => button.textContent?.trim() === "星座URLを共有",
  );

  return hasShareButton ? profileSection : null;
}

function decorateStarChartEntries() {
  const labels = Array.from(document.querySelectorAll("p")).filter(
    (element) => element.textContent?.trim() === STAR_CHART_ENTRY_LABEL,
  );

  labels.forEach((label) => {
    const entryCard = label.parentElement;

    if (!entryCard || entryCard.dataset.myStarChartEntry === "true") {
      return;
    }

    const profileSection = getOwnProfileSection(entryCard);

    if (!profileSection) {
      return;
    }

    entryCard.dataset.myStarChartEntry = "true";
    entryCard.classList.add("my-star-chart-entry");
    entryCard.setAttribute("aria-label", "My Star Chartを開く");
    entryCard.setAttribute("role", "button");
    entryCard.tabIndex = 0;

    entryCard.addEventListener("click", () => {
      openStarChartPreview(entryCard, profileSection, entryCard);
    });

    entryCard.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openStarChartPreview(entryCard, profileSection, entryCard);
    });
  });
}

function scheduleEntryDecoration() {
  if (decorationFrame) {
    return;
  }

  decorationFrame = window.requestAnimationFrame(() => {
    decorationFrame = 0;
    decorateStarChartEntries();
  });
}

if (typeof document !== "undefined") {
  scheduleEntryDecoration();

  const observer = new MutationObserver(scheduleEntryDecoration);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

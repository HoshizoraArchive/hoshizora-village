import { URL_PATTERN, extractMeteorTags, getCleanMatchedUrl, getSafeLinkUrl } from "../lib/postTextUtils";

function LinkedText({ children, highlightMeteorTags = false, onMeteorTagClick }) {
  const text = String(children ?? "");
  const tokens = [];

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;
    const urlText = getCleanMatchedUrl(matchedText);
    const safeUrl = getSafeLinkUrl(urlText);

    if (!safeUrl) {
      continue;
    }

    tokens.push({
      end: matchIndex + urlText.length,
      href: safeUrl,
      kind: "url",
      start: matchIndex,
      text: urlText,
    });
  }

  if (highlightMeteorTags || onMeteorTagClick) {
    for (const tag of extractMeteorTags(text, { includePositions: true })) {
      tokens.push({
        ...tag,
        kind: "tag",
        text: tag.label,
      });
    }
  }

  tokens.sort((a, b) => a.start - b.start || (a.kind === "url" ? -1 : 1));

  const parts = [];
  let lastIndex = 0;

  for (const token of tokens) {
    if (token.start < lastIndex) {
      continue;
    }

    if (token.start > lastIndex) {
      parts.push(text.slice(lastIndex, token.start));
    }

    if (token.kind === "url") {
      parts.push(
        <a
          className="break-all text-comet underline decoration-comet/50 underline-offset-4 transition hover:text-aurora hover:decoration-aurora"
          href={token.href}
          key={`url-${token.start}-${token.text}`}
          onClick={(event) => event.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          {token.text}
        </a>,
      );
    } else {
      const tagContent = (
        <span className="font-black text-amber-200 drop-shadow-[0_0_10px_rgba(251,191,36,0.2)]">
          {token.label}
        </span>
      );

      parts.push(
        onMeteorTagClick ? (
          <button
            className="rounded px-0.5 text-left transition hover:bg-amber-300/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/20"
            data-card-action="true"
            key={`tag-${token.start}-${token.normalizedName}`}
            onClick={(event) => {
              event.stopPropagation();
              onMeteorTagClick(token.name);
            }}
            type="button"
          >
            {tagContent}
          </button>
        ) : (
          <span key={`tag-${token.start}-${token.normalizedName}`}>{tagContent}</span>
        ),
      );
    }

    lastIndex = token.end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

export { LinkedText };

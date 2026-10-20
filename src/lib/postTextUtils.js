import { YOUTUBE_VIDEO_ID_PATTERN } from "./mediaEditorUtils.js";

const STAR_LETTER_MAX_LENGTH = 500;

const POST_MAX_LENGTH = 500;

const METEOR_TAG_MAX_COUNT = 3;

const METEOR_TAG_MAX_LENGTH = 30;

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

const METEOR_TAG_CHARACTER_PATTERN = /[\p{L}\p{N}\p{M}_]/u;

function getTrimmedCharacterLength(value) {
  return Array.from(value.trim()).length;
}

function getSafeLinkUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function getCleanMatchedUrl(rawUrl) {
  const trailingText = rawUrl.match(/[.,!?;:)\]}、。！？）」』】]+$/)?.[0] ?? "";
  return trailingText ? rawUrl.slice(0, -trailingText.length) : rawUrl;
}

function getUrlRanges(text) {
  return [...String(text ?? "").matchAll(URL_PATTERN)].map((match) => ({
    end: (match.index ?? 0) + match[0].length,
    start: match.index ?? 0,
  }));
}

function isIndexInRanges(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function isMeteorTagCharacter(character) {
  return METEOR_TAG_CHARACTER_PATTERN.test(character);
}

function normalizeMeteorTagName(value) {
  return String(value ?? "").replace(/^#/, "").trim().normalize("NFKC");
}

function getMeteorTagSearchKey(value) {
  return normalizeMeteorTagName(value).toLocaleLowerCase("ja-JP");
}

function getMeteorTagLabel(tag) {
  const name = typeof tag === "string" ? tag : tag?.name;
  const normalizedName = normalizeMeteorTagName(name);
  return normalizedName ? `#${normalizedName}` : "";
}

function extractMeteorTags(text, { includePositions = false } = {}) {
  const source = String(text ?? "");
  const urlRanges = getUrlRanges(source);
  const tags = [];
  const seen = new Set();
  let index = 0;

  while (index < source.length) {
    const codePoint = source.codePointAt(index);
    const character = String.fromCodePoint(codePoint);

    if (character !== "#" || isIndexInRanges(index, urlRanges)) {
      index += character.length;
      continue;
    }

    const markerStart = index;
    let cursor = index + character.length;

    while (cursor < source.length) {
      const nextCodePoint = source.codePointAt(cursor);
      const nextCharacter = String.fromCodePoint(nextCodePoint);

      if (!isMeteorTagCharacter(nextCharacter)) {
        break;
      }

      cursor += nextCharacter.length;
    }

    const rawName = source.slice(index + character.length, cursor);
    const name = String(rawName).trim();
    const normalizedName = getMeteorTagSearchKey(rawName);

    if (name && normalizedName && !seen.has(normalizedName)) {
      seen.add(normalizedName);
      tags.push({
        end: cursor,
        label: `#${name}`,
        name,
        normalizedName,
        start: markerStart,
      });
    }

    index = Math.max(cursor, index + character.length);
  }

  return includePositions ? tags : tags.map(({ end, start, ...tag }) => tag);
}

function validateMeteorTagsFromText(text) {
  const tags = extractMeteorTags(text);

  if (tags.length > METEOR_TAG_MAX_COUNT) {
    return {
      error: "流星タグは3つまで添えられます",
      tags,
    };
  }

  const hasLongTag = tags.some((tag) => Array.from(tag.name).length > METEOR_TAG_MAX_LENGTH);

  if (hasLongTag) {
    return {
      error: "流星タグは30文字以内で入力してください",
      tags,
    };
  }

  return { error: "", tags };
}

function getYouTubeVideoIdFromUrl(rawUrl) {
  const safeUrl = getSafeLinkUrl(rawUrl);

  if (!safeUrl) {
    return null;
  }

  try {
    const url = new URL(safeUrl);
    const hostname = url.hostname.toLowerCase();
    const pathParts = url.pathname.split("/").filter(Boolean);
    let videoId = null;

    if (hostname === "youtu.be") {
      videoId = pathParts[0] ?? null;
    }

    if (hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else if (pathParts[0] === "shorts") {
        videoId = pathParts[1] ?? null;
      }
    }

    return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

function findFirstYouTubeVideoId(text) {
  for (const match of String(text ?? "").matchAll(URL_PATTERN)) {
    const videoId = getYouTubeVideoIdFromUrl(getCleanMatchedUrl(match[0]));

    if (videoId) {
      return videoId;
    }
  }

  return null;
}

function getSunoUrl(rawUrl) {
  const safeUrl = getSafeLinkUrl(rawUrl);

  if (!safeUrl) {
    return null;
  }

  try {
    const url = new URL(safeUrl);
    const hostname = url.hostname.toLowerCase();
    const pathParts = url.pathname.split("/").filter(Boolean);
    const isSunoHost = hostname === "suno.com" || hostname === "www.suno.com";
    const isSupportedPath = (pathParts[0] === "s" || pathParts[0] === "song") && Boolean(pathParts[1]);

    return isSunoHost && isSupportedPath ? url.href : null;
  } catch {
    return null;
  }
}

function findFirstSunoUrl(text) {
  for (const match of String(text ?? "").matchAll(URL_PATTERN)) {
    const sunoUrl = getSunoUrl(getCleanMatchedUrl(match[0]));

    if (sunoUrl) {
      return sunoUrl;
    }
  }

  return null;
}

export { STAR_LETTER_MAX_LENGTH, POST_MAX_LENGTH, METEOR_TAG_MAX_COUNT, METEOR_TAG_MAX_LENGTH, URL_PATTERN, METEOR_TAG_CHARACTER_PATTERN, getTrimmedCharacterLength, getSafeLinkUrl, getCleanMatchedUrl, getUrlRanges, isIndexInRanges, isMeteorTagCharacter, normalizeMeteorTagName, getMeteorTagSearchKey, getMeteorTagLabel, extractMeteorTags, validateMeteorTagsFromText, getYouTubeVideoIdFromUrl, findFirstYouTubeVideoId, getSunoUrl, findFirstSunoUrl };

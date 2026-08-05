import { sanitizeAuthorCallName } from "./aiPrompt.mjs";

const WELCOME_CANDIDATE_RPC = "get_chia_first_post_welcome_candidate";
const FALLBACK_CONTEXT_MAX_LENGTH = 18;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const MARKDOWN_META_PATTERN = /[`*_#]/g;
const CHIA_FRIEND_PATTERN = /(?:(?:星空)?ちあ(?:ちゃん|さん|くん|様|さま)?(?:の)?(?:友達|友だち|ともだち)|(?:友達|友だち|ともだち)(?:の)?(?:星空)?ちあ)/i;
const MUSIC_HINT_PATTERN = /(?:新曲|楽曲|曲名|聴いて|聞いて|music|song)/i;
const GREETING_PREFIX_PATTERN = /^(?:こんにちは|こんばんは|おはようございます|おはよう|おはちあ|こんちあ|こんばんちあ)[！!。、,.\s]*/i;

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function isMissingRpc(error) {
  return error?.code === "42883" || error?.code === "PGRST202";
}

function truncateGraphemes(value, maxLength) {
  const chars = Array.from(value ?? "");
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join("")}…` : chars.join("");
}

function sanitizeFallbackContext(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .replace(CONTROL_CHAR_PATTERN, " ")
    .replace(URL_PATTERN, " ")
    .replace(MARKDOWN_META_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSongTitle(text) {
  const cleaned = sanitizeFallbackContext(text);

  if (!cleaned || !MUSIC_HINT_PATTERN.test(cleaned)) {
    return "";
  }

  const quotedMatch = cleaned.match(/(?:新曲|楽曲|曲名)[^「『"]{0,8}[「『"]([^」』"]{1,24})[」』"]/i);
  if (quotedMatch?.[1]) {
    return truncateGraphemes(quotedMatch[1].trim(), FALLBACK_CONTEXT_MAX_LENGTH);
  }

  const inlineMatch = cleaned.match(/(?:新曲|楽曲|曲名)\s*[:：-]?\s*([A-Za-z0-9][A-Za-z0-9 ._'\-&]{1,28}?)(?=\s*(?:聴いて|聞いて|よろしく|$))/i);
  if (inlineMatch?.[1]) {
    return truncateGraphemes(inlineMatch[1].trim(), FALLBACK_CONTEXT_MAX_LENGTH);
  }

  const segments = cleaned
    .split(/[。！!？?]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const hintIndex = segments.findIndex((segment) => MUSIC_HINT_PATTERN.test(segment));

  if (hintIndex >= 0) {
    const candidate = segments
      .slice(hintIndex + 1)
      .find((segment) => !MUSIC_HINT_PATTERN.test(segment) && !GREETING_PREFIX_PATTERN.test(segment));

    if (candidate) {
      return truncateGraphemes(candidate, FALLBACK_CONTEXT_MAX_LENGTH);
    }
  }

  return "";
}

function buildTextContextFallback(authorCallName, text) {
  const cleaned = sanitizeFallbackContext(text);

  if (!cleaned) {
    return "";
  }

  if (CHIA_FRIEND_PATTERN.test(cleaned)) {
    return `${authorCallName}、来てくれたんだ！ちあの友達って言ってくれてありがちあ。星空Villageでもよろしくね。`;
  }

  if (MUSIC_HINT_PATTERN.test(cleaned)) {
    const songTitle = extractSongTitle(cleaned);
    if (songTitle) {
      return `${authorCallName}、新曲「${songTitle}」を最初の流星便で届けてくれたんだね。持ってきてくれてありがちあ。`;
    }

    return `${authorCallName}、最初の流星便で新曲のお知らせを届けてくれたんだね。持ってきてくれてありがちあ。`;
  }

  const withoutGreeting = cleaned.replace(GREETING_PREFIX_PATTERN, "").trim();
  const source = withoutGreeting || cleaned;
  const excerpt = truncateGraphemes(source, FALLBACK_CONTEXT_MAX_LENGTH);

  return `${authorCallName}、最初の流星便の「${excerpt}」、ちゃんと受け取ったよ。ここへ届けてくれてありがちあ。`;
}

function buildMediaContextFallback(authorCallName, post) {
  if (post?.youtube_video_id || post?.type === "youtube") {
    return `${authorCallName}、最初の流星便で映像を届けてくれてありがちあ。ちあもここからちゃんと観測していくね。`;
  }

  if (post?.type === "image") {
    return `${authorCallName}、最初の流星便で一枚の光を届けてくれてありがちあ。ちあもここからちゃんと観測していくね。`;
  }

  if (post?.type === "video") {
    return `${authorCallName}、最初の流星便で動画を届けてくれてありがちあ。ちあもここからちゃんと観測していくね。`;
  }

  return `${authorCallName}、最初の流星便を届けてくれてありがちあ。ここからちあも、あなたの光をちゃんと観測していくね。`;
}

export function buildFirstPostWelcomeFallback(authorProfile, post = {}) {
  const authorCallName = sanitizeAuthorCallName(authorProfile);
  const textFallback = buildTextContextFallback(authorCallName, post?.body);

  return textFallback || buildMediaContextFallback(authorCallName, post);
}

export function buildFirstPostFallbackObservation() {
  return {
    observedPoints: [
      { kind: "confidence", value: 0 },
    ],
    analysisSummary: "初投稿歓迎を投稿内容に応じた安全なフォールバックで確定しました。",
    shouldPost: false,
    starLetter: null,
    confidence: 0,
  };
}

export async function getFirstPostWelcomeCandidate({ supabase, postId }) {
  const { data, error } = await supabase.rpc(WELCOME_CANDIDATE_RPC, {
    p_post_id: postId,
  });

  // A deploy preview can run new Function code before its migration exists.
  // Keep ordinary automatic observation available; the completion RPC remains
  // the authoritative first-post decision once the migration is applied.
  if (isMissingRpc(error)) {
    return { isFirstPostWelcome: false, migrationAvailable: false };
  }

  if (error) {
    throw new Error("first_post_welcome_lookup_failed");
  }

  const row = firstRpcRow(data);

  if (typeof row?.is_first_post_welcome !== "boolean") {
    throw new Error("first_post_welcome_lookup_invalid");
  }

  return {
    isFirstPostWelcome: row.is_first_post_welcome,
    migrationAvailable: true,
  };
}

export { WELCOME_CANDIDATE_RPC };

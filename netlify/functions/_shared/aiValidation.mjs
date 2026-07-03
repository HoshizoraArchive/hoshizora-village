import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import { UUID_PATTERN } from "./aiConfig.mjs";

const REQUEST_BODY_MAX_BYTES = 2048;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{32,128}$/;
const METEOR_MEDIA_BUCKET = "meteor-media";
const METEOR_VIDEO_BUCKET = "meteor-video";
const SUPPORTED_POST_TYPES = new Set(["text", "image", "audio", "video", "youtube"]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm"]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function assertJsonRequest(request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().split(";").map((part) => part.trim()).includes("application/json")) {
    throw aiHttpError(415, AI_ERROR.UNSUPPORTED_TYPE);
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > REQUEST_BODY_MAX_BYTES) {
    throw aiHttpError(413, AI_ERROR.CONTENT_TOO_LARGE);
  }
}

export async function readStrictJsonBody(request) {
  const text = await request.text();

  if (new TextEncoder().encode(text).length > REQUEST_BODY_MAX_BYTES) {
    throw aiHttpError(413, AI_ERROR.CONTENT_TOO_LARGE);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw aiHttpError(400, AI_ERROR.BAD_JSON);
  }
}

export function validateObservationRequestPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  const keys = Object.keys(payload);
  const allowedKeys = new Set(["postId", "idempotencyKey"]);

  if (keys.length !== 2 || keys.some((key) => !allowedKeys.has(key))) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  if (typeof payload.postId !== "string" || !UUID_PATTERN.test(payload.postId)) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  if (typeof payload.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(payload.idempotencyKey)) {
    throw aiHttpError(400, AI_ERROR.BAD_REQUEST);
  }

  return {
    postId: payload.postId.toLowerCase(),
    idempotencyKey: payload.idempotencyKey,
  };
}

export function extractYoutubeVideoId(urlValue) {
  if (typeof urlValue !== "string" || urlValue.length > 2048) {
    return null;
  }

  let url;

  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }

  const hostname = url.hostname.toLowerCase();

  if (!YOUTUBE_HOSTS.has(hostname)) {
    return null;
  }

  if (hostname === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const videoId = pathParts[0] === "shorts" ? pathParts[1] : url.searchParams.get("v");

  return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

export function validatePublicPost(post) {
  if (!post || post.visibility !== "public" || post.deleted_at !== null) {
    throw aiHttpError(404, AI_ERROR.NOT_FOUND);
  }

  if (!SUPPORTED_POST_TYPES.has(post.type)) {
    throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
  }

  if (post.type === "youtube") {
    const videoId = extractYoutubeVideoId(post.youtube_url);

    if (!videoId || post.youtube_video_id !== videoId) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }
  }
}

function assertMediaOwnership(row, post) {
  if (row.post_id !== post.id || row.uploader_id !== post.author_id) {
    throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
  }
}

export function validatePostMedia(post, mediaRows) {
  const rows = mediaRows ?? [];

  if (post.type === "image") {
    if (rows.length < 1 || rows.length > 4) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }

    rows.forEach((row, index) => {
      assertMediaOwnership(row, post);
      const sizeBytes = Number(row.size_bytes);

      if (
        row.media_type !== "image" ||
        row.sort_order !== index ||
        !IMAGE_MIME_TYPES.has(row.mime_type) ||
        !Number.isInteger(sizeBytes) ||
        sizeBytes < 1 ||
        sizeBytes > 8 * 1024 * 1024 ||
        !row.storage_path
      ) {
        throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
      }
    });

    return {
      inputKind: "image",
      inputSizeBytes: rows.reduce((total, row) => total + Number(row.size_bytes), 0),
      inputDurationSeconds: null,
    };
  }

  if (post.type === "video") {
    if (rows.length !== 1) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }

    const [row] = rows;
    assertMediaOwnership(row, post);
    const sizeBytes = Number(row.size_bytes);
    const durationSeconds = Number(row.duration_seconds);

    if (
      row.media_type !== "video" ||
      row.sort_order !== 0 ||
      !VIDEO_MIME_TYPES.has(row.mime_type) ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > 100 * 1024 * 1024 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > 35 ||
      !row.storage_path
    ) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }

    return {
      inputKind: "video",
      inputSizeBytes: sizeBytes,
      inputDurationSeconds: durationSeconds,
    };
  }

  if (post.type === "audio") {
    const durationSeconds = Number(post.duration_seconds);

    if (
      !post.media_url ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > 30
    ) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }

    // Current schema does not store server-verifiable audio MIME metadata, so audio is fail-closed for this foundation.
    throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
  }

  return {
    inputKind: post.type === "youtube" ? "youtube" : "text",
    inputSizeBytes: 0,
    inputDurationSeconds: null,
  };
}

export function getStorageRequirements(post, mediaRows) {
  const rows = mediaRows ?? [];

  if (post.type === "image") {
    return rows.map((row) => ({
      bucket: METEOR_MEDIA_BUCKET,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
    }));
  }

  if (post.type === "video") {
    return rows.map((row) => ({
      bucket: METEOR_VIDEO_BUCKET,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
    }));
  }

  return [];
}

function getStorageMetadataMime(metadata) {
  const mimeType = metadata?.mimetype ?? metadata?.mimeType ?? metadata?.contentType ?? metadata?.ContentType;
  return typeof mimeType === "string" ? mimeType.toLowerCase() : "";
}

function getStorageMetadataSize(metadata) {
  const size = Number(metadata?.size ?? metadata?.contentLength ?? metadata?.ContentLength);
  return Number.isInteger(size) ? size : null;
}

export function validateStorageMetadata(requirements, storageObjects) {
  const objectMap = new Map(
    storageObjects.map((object) => [`${object.bucket}:${object.storagePath}`, object]),
  );

  for (const requirement of requirements) {
    if (!requirement.storagePath || !Number.isInteger(requirement.sizeBytes)) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }

    const object = objectMap.get(`${requirement.bucket}:${requirement.storagePath}`);

    if (!object) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }

    const mimeType = getStorageMetadataMime(object.metadata);
    const sizeBytes = getStorageMetadataSize(object.metadata);

    if (mimeType !== requirement.mimeType || sizeBytes !== requirement.sizeBytes) {
      throw aiHttpError(422, AI_ERROR.UNSUPPORTED_MEDIA);
    }
  }
}

export function getAllowedMediaSummary() {
  return {
    mediaBucket: METEOR_MEDIA_BUCKET,
    videoBucket: METEOR_VIDEO_BUCKET,
    imageMimeTypes: [...IMAGE_MIME_TYPES],
    videoMimeTypes: [...VIDEO_MIME_TYPES],
    audioMimeTypes: [...AUDIO_MIME_TYPES],
    youtubeHosts: [...YOUTUBE_HOSTS],
  };
}

import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import {
  extractYoutubeVideoId,
  getStorageRequirements,
  validatePostMedia,
  validatePublicPost,
  validateStorageMetadata,
} from "./aiValidation.mjs";

const POST_SELECT_COLUMNS =
  "id, author_id, type, body, media_url, youtube_url, youtube_video_id, duration_seconds, visibility, deleted_at, updated_at";
const POST_MEDIA_SELECT_COLUMNS =
  "id, post_id, uploader_id, media_type, storage_path, thumbnail_storage_path, duration_seconds, sort_order, mime_type, size_bytes";
const EMBEDDED_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const TRAILING_URL_PUNCTUATION_PATTERN = /[)\]}>.,!?;:、。！？）」』】》〉]+$/u;

export function findEmbeddedYoutubeVideo(body) {
  if (typeof body !== "string") {
    return null;
  }

  for (const match of body.matchAll(EMBEDDED_URL_PATTERN)) {
    const url = match[0].replace(TRAILING_URL_PUNCTUATION_PATTERN, "");
    const videoId = extractYoutubeVideoId(url);

    if (videoId) {
      return { url, videoId };
    }
  }

  return null;
}

export function promoteEmbeddedYoutubePost(post) {
  if (!post || post.type !== "text") {
    return post;
  }

  const embeddedYoutube = findEmbeddedYoutubeVideo(post.body);

  if (!embeddedYoutube) {
    return post;
  }

  return {
    ...post,
    type: "youtube",
    youtube_url: embeddedYoutube.url,
    youtube_video_id: embeddedYoutube.videoId,
  };
}

function splitStoragePath(storagePath) {
  const parts = storagePath.split("/").filter(Boolean);
  const name = parts.pop() ?? "";

  return {
    folder: parts.join("/"),
    name,
  };
}

export async function loadPostAndMedia(supabase, postId) {
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(POST_SELECT_COLUMNS)
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  validatePublicPost(post);
  const observationPost = promoteEmbeddedYoutubePost(post);

  const { data: mediaRows, error: mediaError } = await supabase
    .from("post_media")
    .select(POST_MEDIA_SELECT_COLUMNS)
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });

  if (mediaError) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  return {
    post: observationPost,
    mediaRows: mediaRows ?? [],
  };
}

export async function loadStorageObjectMetadata(supabase, requirements) {
  const storageObjects = [];

  for (const requirement of requirements) {
    const { folder, name } = splitStoragePath(requirement.storagePath);
    const { data, error } = await supabase.storage
      .from(requirement.bucket)
      .list(folder, { limit: 10, search: name });

    if (error) {
      throw aiHttpError(503, AI_ERROR.INTERNAL);
    }

    const matchedObject = (data ?? []).find((object) => object.name === name);

    if (matchedObject) {
      storageObjects.push({
        bucket: requirement.bucket,
        storagePath: requirement.storagePath,
        metadata: matchedObject.metadata ?? {},
      });
    }
  }

  return storageObjects;
}

export async function validateCurrentPostInput({ supabase, postId }) {
  const current = await validateCurrentPostDatabaseInput({ supabase, postId });
  await validateCurrentPostStorageInput({
    supabase,
    storageRequirements: current.storageRequirements,
  });

  return current;
}

export async function validateCurrentPostDatabaseInput({ supabase, postId }) {
  const { post, mediaRows } = await loadPostAndMedia(supabase, postId);
  const mediaSummary = validatePostMedia(post, mediaRows);
  const storageRequirements = getStorageRequirements(post, mediaRows);

  return {
    post,
    mediaRows,
    mediaSummary,
    storageRequirements,
  };
}

export async function validateCurrentPostStorageInput({ supabase, storageRequirements }) {
  const storageObjects = await loadStorageObjectMetadata(supabase, storageRequirements);
  validateStorageMetadata(storageRequirements, storageObjects);
}

export async function loadChiaProfile({ supabase, chiaProfileId }) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", chiaProfileId)
    .maybeSingle();

  if (error) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  if (!data || data.username !== "chia_hoshizora") {
    throw aiHttpError(422, AI_ERROR.CHIA_PROFILE_MISMATCH);
  }

  return data;
}

export async function loadAuthorProfile({ supabase, profileId }) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  return data;
}

export { POST_MEDIA_SELECT_COLUMNS, POST_SELECT_COLUMNS };

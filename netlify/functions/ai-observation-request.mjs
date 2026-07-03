import { readAiObservationConfig } from "./_shared/aiConfig.mjs";
import { requireAiOperator } from "./_shared/aiAuth.mjs";
import {
  AI_ERROR,
  AiHttpError,
  aiHttpError,
  errorResponse,
  jsonResponse,
  logAiEvent,
} from "./_shared/aiErrors.mjs";
import { reserveAiObservationJob } from "./_shared/aiJobReservation.mjs";
import { createSupabaseAdminClient } from "./_shared/supabaseAdmin.mjs";
import {
  assertJsonRequest,
  getStorageRequirements,
  readStrictJsonBody,
  validateStorageMetadata,
  validateObservationRequestPayload,
  validatePostMedia,
  validatePublicPost,
} from "./_shared/aiValidation.mjs";

const POST_SELECT_COLUMNS =
  "id, author_id, type, body, media_url, youtube_url, youtube_video_id, duration_seconds, visibility, deleted_at, updated_at";
const POST_MEDIA_SELECT_COLUMNS =
  "id, post_id, uploader_id, media_type, storage_path, thumbnail_storage_path, duration_seconds, sort_order, mime_type, size_bytes";

function getRequestId(context) {
  return context?.requestId ?? crypto.randomUUID();
}

async function loadPostAndMedia(supabase, postId) {
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(POST_SELECT_COLUMNS)
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  validatePublicPost(post);

  const { data: mediaRows, error: mediaError } = await supabase
    .from("post_media")
    .select(POST_MEDIA_SELECT_COLUMNS)
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });

  if (mediaError) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  return {
    post,
    mediaRows: mediaRows ?? [],
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

async function loadStorageObjectMetadata(supabase, requirements) {
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

export default async function handler(request, context) {
  const requestId = getRequestId(context);
  const startedAt = Date.now();

  try {
    if (request.method !== "POST") {
      throw aiHttpError(405, AI_ERROR.METHOD_NOT_ALLOWED);
    }

    assertJsonRequest(request);
    const payload = validateObservationRequestPayload(await readStrictJsonBody(request));
    let config;

    try {
      config = readAiObservationConfig();
    } catch {
      throw aiHttpError(503, AI_ERROR.CONFIGURATION_ERROR);
    }

    if (!config.enabled) {
      throw aiHttpError(503, AI_ERROR.DISABLED);
    }

    const supabase = createSupabaseAdminClient(config);
    const operator = await requireAiOperator({ request, supabase, config });
    const { post, mediaRows } = await loadPostAndMedia(supabase, payload.postId);
    const mediaSummary = validatePostMedia(post, mediaRows);
    const storageRequirements = getStorageRequirements(post, mediaRows);
    const storageObjects = await loadStorageObjectMetadata(supabase, storageRequirements);
    validateStorageMetadata(storageRequirements, storageObjects);
    const job = await reserveAiObservationJob({
      supabase,
      operatorUserId: operator.id,
      payload,
      post,
      mediaSummary,
      config,
    });

    logAiEvent("info", "ai_observation_job_reserved", {
      requestId,
      jobId: job.jobId,
      operation: "reserve_ai_observation_job",
      status: 202,
      code: "queued",
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(202, {
      jobId: job.jobId,
      status: job.status,
      requestId,
    });
  } catch (error) {
    const safeError = error instanceof AiHttpError ? error : aiHttpError(503, AI_ERROR.INTERNAL);

    logAiEvent(safeError.status >= 500 ? "error" : "warn", "ai_observation_request_failed", {
      requestId,
      operation: "ai_observation_request",
      status: safeError.status,
      code: safeError.code,
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(safeError, requestId);
  }
}

export const config = {
  path: "/api/ai-observation-request",
  method: ["POST"],
};

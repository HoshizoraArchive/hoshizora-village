import { createHash } from "node:crypto";
import { AI_ERROR, aiHttpError } from "./aiErrors.mjs";
import { AI_OBSERVATION_CONTEXT } from "./aiObservationContext.mjs";
import { buildReservationParams } from "./aiLimits.mjs";

const AI_RESIDENT_KEY = "hoshizora_chia";
const AI_PROVIDER = "gemini";

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function normalizeMediaRowsForFingerprint(mediaRows = []) {
  return [...mediaRows]
    .sort((left, right) => {
      const sortDelta = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);

      if (sortDelta !== 0) {
        return sortDelta;
      }

      return String(left.id ?? "").localeCompare(String(right.id ?? ""));
    })
    .map((row) => ({
      durationSeconds: nullableNumber(row.duration_seconds),
      id: row.id ?? null,
      mediaType: row.media_type ?? null,
      mimeType: row.mime_type ?? null,
      sizeBytes: nullableNumber(row.size_bytes),
      sortOrder: nullableNumber(row.sort_order),
      storagePath: row.storage_path ?? null,
      thumbnailStoragePath: row.thumbnail_storage_path ?? null,
      uploaderId: row.uploader_id ?? null,
    }));
}

export function buildRequestFingerprintPayload({ post, mediaRows = [], mediaSummary }) {
  return {
    aiResidentKey: AI_RESIDENT_KEY,
    body: post.body ?? "",
    media: mediaSummary,
    mediaRows: normalizeMediaRowsForFingerprint(mediaRows),
    postId: post.id,
    postType: post.type,
    updatedAt: post.updated_at ?? null,
    youtubeUrl: post.youtube_url ?? null,
    youtubeVideoId: post.youtube_video_id ?? null,
  };
}

export function createRequestFingerprint({ post, mediaRows = [], mediaSummary }) {
  const hash = createHash("sha256");
  hash.update(stableJson(buildRequestFingerprintPayload({ post, mediaRows, mediaSummary })));

  return hash.digest("hex");
}

function mapOutcomeToError(outcome) {
  if (outcome === "post_not_found") {
    return aiHttpError(404, AI_ERROR.NOT_FOUND);
  }

  if (outcome === "rate_limited") {
    return aiHttpError(429, AI_ERROR.RATE_LIMITED);
  }

  if (
    outcome === "duplicate_idempotency" ||
    outcome === "already_queued" ||
    outcome === "already_succeeded" ||
    outcome === "already_failed" ||
    outcome === "retry_too_soon" ||
    outcome === "max_attempts_exceeded"
  ) {
    return aiHttpError(409, AI_ERROR.CONFLICT);
  }

  return aiHttpError(503, AI_ERROR.INTERNAL);
}

export async function reserveAiObservationJob({
  supabase,
  operatorUserId,
  payload,
  post,
  mediaRows,
  mediaSummary,
  config,
  observationContext = AI_OBSERVATION_CONTEXT.MANUAL,
  notBeforeAt = new Date(),
}) {
  const reservation = buildReservationParams({ config, mediaSummary });
  const requestFingerprint = createRequestFingerprint({ post, mediaRows, mediaSummary });

  const { data, error } = await supabase.rpc("reserve_ai_observation_job", {
    p_post_id: payload.postId,
    p_requested_by: operatorUserId,
    p_ai_resident_key: AI_RESIDENT_KEY,
    p_provider: AI_PROVIDER,
    p_model: config.model,
    p_idempotency_key: payload.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_observation_context: observationContext,
    p_not_before_at: notBeforeAt.toISOString(),
    p_input_kind: reservation.inputKind,
    p_input_size_bytes: reservation.inputSizeBytes,
    p_input_duration_seconds: reservation.inputDurationSeconds,
    p_reserved_cost_micro_usd: reservation.reservedCostMicroUsd,
    p_max_attempts: reservation.maxAttempts,
    p_daily_request_limit: config.dailyRequestLimit,
    p_monthly_request_limit: config.monthlyRequestLimit,
    p_daily_cost_limit_micro_usd: config.dailyCostLimitMicroUsd,
    p_monthly_cost_limit_micro_usd: config.monthlyCostLimitMicroUsd,
    p_min_seconds_between_requests: config.minSecondsBetweenRequests,
  });

  if (error) {
    throw aiHttpError(503, AI_ERROR.INTERNAL);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const outcome = row?.outcome;

  if (outcome !== "reserved") {
    throw mapOutcomeToError(outcome);
  }

  return {
    jobId: row.job_id,
    status: row.job_status ?? "queued",
    notBeforeAt: row.not_before_at ?? null,
    observationContext: row.observation_context ?? observationContext,
  };
}

export { AI_RESIDENT_KEY, AI_PROVIDER };

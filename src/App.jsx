import { useEffect, useRef, useState } from "react";
import {
  ERROR_OPERATION,
  createUserFacingError,
  getUserFacingError,
  isSafeUserFacingError,
  logSafeError,
} from "./safeErrors";
import { supabase } from "./lib/supabaseClient";
import privacyPolicyMarkdown from "./legal/privacy-policy.md?raw";
import termsOfServiceMarkdown from "./legal/terms-of-service.md?raw";
import VillageGuideAdminScreen from "./VillageGuideAdmin";
import StarMovieObservationMode from "./StarMovieObservationMode";
import InteractiveOnboarding from "./InteractiveOnboarding";
import {
  getPushNotificationPermission,
  getPushNotificationPermissionLabel,
  getPushSubscriptionRegistrationStatus,
  isPushNotificationSupported,
  isPushSubscriptionSupported,
  reRegisterPushNotifications,
  requestPushNotificationPermission,
  sendPushNotificationTest,
  subscribeToPushNotifications,
  transferPushSubscriptionToCurrentAccount,
} from "./pushNotificationSetup";
import {
  GUIDE_ENTRY_SELECT_COLUMNS,
  GUIDE_SECTION_SELECT_COLUMNS,
  buildVillageGuideTree,
  createVillageGuideStableKey,
  getFallbackVillageGuideRows,
  isMissingVillageGuideSchemaError,
  validateVillageGuideEntryInput,
  validateVillageGuideSectionInput,
} from "./villageGuide";
import {
  POST_INLINE_VIDEO_PLAY_EVENT,
  STAR_MOVIE_OBSERVATION_MEDIA_QUERY,
  createStarMovieObservationHistoryState,
  createUploadMovieObservationMedia,
  createYouTubeMovieObservationMedia,
  isStarMovieObservationHistoryState,
  isStarMovieObservationViewport,
} from "./starMovieObservation";
import {
  ONBOARDING_PROGRESS_SELECT_COLUMNS,
  canApplyOnboardingProgressResponse,
  getOnboardingResumeTab,
  getOnboardingTarget,
  isMissingOnboardingSchemaError,
  isOnboardingActive,
  isOnboardingProgressForUser,
} from "./onboarding";
import {
  addStarLetterResonance,
  createStarLetterReply,
  deleteStarLetter,
  getStarLetterThread,
  setStarLetterArchived,
  updateStarLetter,
} from "./starLetterConversations";
import {
  buildStarLetterThreadRows,
  createOperationRequestIdStore,
  isStarLetterThreadNotification,
} from "./starLetterThread";

const bottomNavItems = [
  { id: "observe", label: "観測", icon: "telescope" },
  { id: "rconnect", label: "R.Connect", icon: "bell" },
  { id: "post", label: "流星便", icon: "plus", primary: true },
  { id: "archive", label: "Archive", icon: "bookmark" },
  { id: "profile", label: "My Const.", ariaLabel: "My Constellation", icon: "constellation" },
];

const STAR_LETTER_MAX_LENGTH = 500;
const FEEDBACK_MAX_LENGTH = 1000;
const POST_MAX_LENGTH = 500;
const METEOR_TAG_MAX_COUNT = 3;
const METEOR_TAG_MAX_LENGTH = 30;
const FEEDBACK_TYPES = ["不具合", "分かりにくい", "改善案", "ほしい機能", "感想", "その他"];
const POST_SELECT_COLUMNS = "id, author_id, type, body, visibility, created_at";
const POST_SELECT_COLUMNS_WITH_DELETED_AT = `${POST_SELECT_COLUMNS}, deleted_at`;
const METEOR_TAG_SELECT_COLUMNS = "id, name, normalized_name, created_by, created_at";
const POST_METEOR_TAG_SELECT_COLUMNS = "post_id, tag_id, sort_order, meteor_tags(id, name, normalized_name)";
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const METEOR_TAG_CHARACTER_PATTERN = /[\p{L}\p{N}\p{M}_]/u;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_CROP_SIZE = 512;
const AVATAR_CROP_MIN_ZOOM = 1;
const AVATAR_CROP_MAX_ZOOM = 6;
const AVATAR_CROP_PREVIEW_FALLBACK_SIZE = 260;
const AVATAR_CROP_OUTPUT_TYPE = "image/jpeg";
const AVATAR_CROP_OUTPUT_EXTENSION = "jpg";
const AVATAR_CROP_OUTPUT_QUALITY = 0.92;
const AVATAR_ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const AVATAR_ACCEPT = Object.keys(AVATAR_ALLOWED_TYPES).join(",");
const METEOR_MEDIA_BUCKET = "meteor-media";
const METEOR_VIDEO_BUCKET = "meteor-video";
const METEOR_MEDIA_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;
const METEOR_IMAGE_MAX_COUNT = 4;
const METEOR_IMAGE_MAX_SIZE_BYTES = 8 * 1024 * 1024;
const METEOR_IMAGE_ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const METEOR_IMAGE_ACCEPT = Object.keys(METEOR_IMAGE_ALLOWED_TYPES).join(",");
const METEOR_VIDEO_MAX_DURATION_SECONDS = 35;
const METEOR_VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024;
const METEOR_VIDEO_SOURCE_MAX_SIZE_BYTES = 500 * 1024 * 1024;
const METEOR_VIDEO_THUMBNAIL_TYPE = "image/jpeg";
const METEOR_VIDEO_THUMBNAIL_EXTENSION = "jpg";
const METEOR_VIDEO_THUMBNAIL_QUALITY = 0.82;
const METEOR_VIDEO_COVER_OUTPUT_WIDTH = 960;
const METEOR_VIDEO_COVER_OUTPUT_HEIGHT = 540;
const METEOR_VIDEO_COVER_PREVIEW_FALLBACK_WIDTH = 320;
const METEOR_VIDEO_COVER_PREVIEW_FALLBACK_HEIGHT = 180;
const METEOR_VIDEO_TRIM_ERROR_MESSAGE =
  "この星映は端末内で切り取れませんでした。別の動画を選ぶか、端末の写真アプリで35秒以内に編集してください。";
const METEOR_VIDEO_ALLOWED_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
const METEOR_VIDEO_ACCEPT = Object.keys(METEOR_VIDEO_ALLOWED_TYPES).join(",");
const METEOR_THUMBNAIL_ALLOWED_TYPES = METEOR_IMAGE_ALLOWED_TYPES;
const METEOR_THUMBNAIL_ACCEPT = METEOR_IMAGE_ACCEPT;
const METEOR_THUMBNAIL_MAX_SIZE_BYTES = METEOR_IMAGE_MAX_SIZE_BYTES;
const POST_MEDIA_SELECT_COLUMNS =
  "id, post_id, uploader_id, media_type, storage_path, thumbnail_storage_path, duration_seconds, sort_order, mime_type, size_bytes, created_at";
const POST_MEDIA_LEGACY_SELECT_COLUMNS =
  "id, post_id, uploader_id, media_type, storage_path, sort_order, mime_type, size_bytes, created_at";
const PROFILE_BASIC_SELECT_COLUMNS = "id, display_name, username, avatar_url";
const PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME = `${PROFILE_BASIC_SELECT_COLUMNS}, active_frame_id`;
const PROFILE_DETAIL_SELECT_COLUMNS = "id, display_name, username, avatar_url, bio, constellation_note";
const PROFILE_DETAIL_SELECT_COLUMNS_WITH_FRAME = `${PROFILE_DETAIL_SELECT_COLUMNS}, active_frame_id`;
const PROFILE_FRAME_SELECT_COLUMNS =
  "id, frame_key, name, description, asset_path, acquisition_type, rarity, frame_scale, frame_offset_x, frame_offset_y, is_active, created_at, updated_at";
const PROFILE_FRAME_OWNERSHIP_SELECT_COLUMNS = "profile_id, frame_id, acquisition_source, granted_at";
const VISIBLE_POST_TYPES = ["text", "image", "video", "youtube"];
const LEGAL_TERMS_VERSION = "2026-07-10";
const LEGAL_PRIVACY_VERSION = "2026-07-10";
const LEGAL_CONSENT_REQUIRED_AFTER_MS = Date.parse("2026-07-10T00:00:00.000Z");
const OFFICIAL_X_URL = "https://x.com/hoshizorarchive";

const emptyProfileForm = {
  display_name: "",
  username: "",
  avatar_url: "",
  bio: "",
  constellation_note: "",
  active_frame_id: "",
  notify_authors_when_i_archive: true,
  notify_authors_when_i_resonate: true,
};

const defaultProfileView = {
  display_name: "名無しの観測者",
  username: "@silent_creator",
  bio: "まだ名前のない作品を、夜空に置いていく人。未完成の光を観測しています。",
  avatar: "創",
};

function profileFormFromRecord(profile) {
  return {
    display_name: profile?.display_name ?? "",
    username: profile?.username ?? "",
    avatar_url: profile?.avatar_url ?? "",
    bio: profile?.bio ?? "",
    constellation_note: profile?.constellation_note ?? "",
    active_frame_id: profile?.active_frame_id ?? "",
    notify_authors_when_i_archive: profile?.notify_authors_when_i_archive ?? true,
    notify_authors_when_i_resonate: profile?.notify_authors_when_i_resonate ?? true,
  };
}

function optionalText(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalUsername(value) {
  const trimmed = value.trim().replace(/^@/, "");
  return trimmed ? trimmed : null;
}

function getTrimmedCharacterLength(value) {
  return Array.from(value.trim()).length;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getAvatarCoverScale(imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize) {
    return 1;
  }

  return Math.max(frameSize / imageSize.width, frameSize / imageSize.height);
}

function constrainAvatarCropOffset(offset, zoom, imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize) {
    return offset;
  }

  const coverScale = getAvatarCoverScale(imageSize, frameSize);
  const displayedWidth = imageSize.width * coverScale * zoom;
  const displayedHeight = imageSize.height * coverScale * zoom;
  const maxX = Math.max(0, (displayedWidth - frameSize) / 2);
  const maxY = Math.max(0, (displayedHeight - frameSize) / 2);

  return {
    x: clampNumber(offset.x, -maxX, maxX),
    y: clampNumber(offset.y, -maxY, maxY),
  };
}

function isSameAvatarCropOffset(currentOffset, nextOffset) {
  return Math.abs(currentOffset.x - nextOffset.x) < 0.5 && Math.abs(currentOffset.y - nextOffset.y) < 0.5;
}

function getPostCoverCropScale(imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize?.width || !frameSize?.height) {
    return 1;
  }

  return Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height);
}

function constrainPostCoverCropOffset(offset, zoom, imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize?.width || !frameSize?.height) {
    return offset;
  }

  const coverScale = getPostCoverCropScale(imageSize, frameSize);
  const displayedWidth = imageSize.width * coverScale * zoom;
  const displayedHeight = imageSize.height * coverScale * zoom;
  const maxX = Math.max(0, (displayedWidth - frameSize.width) / 2);
  const maxY = Math.max(0, (displayedHeight - frameSize.height) / 2);

  return {
    x: clampNumber(offset.x, -maxX, maxX),
    y: clampNumber(offset.y, -maxY, maxY),
  };
}

function isSamePostCoverCropOffset(currentOffset, nextOffset) {
  return Math.abs(currentOffset.x - nextOffset.x) < 0.5 && Math.abs(currentOffset.y - nextOffset.y) < 0.5;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(createUserFacingError("画像の読み込みに失敗しました。"));
    };

    image.src = imageUrl;
  });
}

async function createCroppedPostCoverBlob({ file, frameSize, offset, zoom }) {
  const image = await loadImageFromFile(file);
  const sourceSize = {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
  const safeFrameSize = frameSize?.width && frameSize?.height
    ? frameSize
    : {
        width: METEOR_VIDEO_COVER_PREVIEW_FALLBACK_WIDTH,
        height: METEOR_VIDEO_COVER_PREVIEW_FALLBACK_HEIGHT,
      };
  const outputSize = {
    width: METEOR_VIDEO_COVER_OUTPUT_WIDTH,
    height: METEOR_VIDEO_COVER_OUTPUT_HEIGHT,
  };
  const coverScale = getPostCoverCropScale(sourceSize, outputSize);
  const outputOffsetScaleX = outputSize.width / safeFrameSize.width;
  const outputOffsetScaleY = outputSize.height / safeFrameSize.height;
  const drawWidth = sourceSize.width * coverScale * zoom;
  const drawHeight = sourceSize.height * coverScale * zoom;
  const drawX = (outputSize.width - drawWidth) / 2 + offset.x * outputOffsetScaleX;
  const drawY = (outputSize.height - drawHeight) / 2 + offset.y * outputOffsetScaleY;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw createUserFacingError("星映の表紙の準備に失敗しました。");
  }

  context.fillStyle = "#050816";
  context.fillRect(0, 0, outputSize.width, outputSize.height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(createUserFacingError("星映の表紙の切り取りに失敗しました。"));
      },
      METEOR_VIDEO_THUMBNAIL_TYPE,
      METEOR_VIDEO_THUMBNAIL_QUALITY,
    );
  });
}

async function createCroppedAvatarBlob({ file, frameSize, offset, zoom }) {
  const image = await loadImageFromFile(file);
  const sourceSize = {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
  const safeFrameSize = frameSize || AVATAR_CROP_PREVIEW_FALLBACK_SIZE;
  const coverScale = getAvatarCoverScale(sourceSize, AVATAR_CROP_SIZE);
  const outputOffsetScale = AVATAR_CROP_SIZE / safeFrameSize;
  const drawWidth = sourceSize.width * coverScale * zoom;
  const drawHeight = sourceSize.height * coverScale * zoom;
  const drawX = (AVATAR_CROP_SIZE - drawWidth) / 2 + offset.x * outputOffsetScale;
  const drawY = (AVATAR_CROP_SIZE - drawHeight) / 2 + offset.y * outputOffsetScale;
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_CROP_SIZE;
  canvas.height = AVATAR_CROP_SIZE;

  const context = canvas.getContext("2d");

  if (!context) {
    throw createUserFacingError("星影の切り抜き準備に失敗しました。");
  }

  context.fillStyle = "#050816";
  context.fillRect(0, 0, AVATAR_CROP_SIZE, AVATAR_CROP_SIZE);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(createUserFacingError("星影の切り抜きに失敗しました。"));
      },
      AVATAR_CROP_OUTPUT_TYPE,
      AVATAR_CROP_OUTPUT_QUALITY,
    );
  });
}

function isMissingDeletedAtError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return error?.code === "42703" || error?.code === "PGRST204" || message.includes("deleted_at");
}

function isMissingStarLetterConversationColumnError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  const mentionsConversationColumn =
    message.includes("parent_star_letter_id") ||
    message.includes("edited_at") ||
    message.includes("deleted_at");
  const reportsMissingSchema =
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache");

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (mentionsConversationColumn && reportsMissingSchema)
  );
}

function isMissingPostMediaError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("post_media");
}

function isMissingMeteorTagsError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("meteor_tags") ||
    message.includes("post_meteor_tags")
  );
}

function isMissingProfileFrameSchemaError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("profile_frames") ||
    message.includes("profile_frame_ownerships") ||
    message.includes("active_frame_id")
  );
}

function isUnownedProfileFrameError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return error?.code === "23514" || message.includes("active profile frame must be owned");
}

function isMissingVideoPostMediaColumnError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("thumbnail_storage_path") ||
    message.includes("duration_seconds")
  );
}

function createClientId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapProfileFrame(frame) {
  if (!frame?.id || !frame?.asset_path) {
    return null;
  }

  return {
    id: frame.id,
    key: frame.frame_key,
    name: frame.name,
    description: frame.description ?? "",
    assetPath: frame.asset_path,
    acquisitionType: frame.acquisition_type ?? "",
    rarity: frame.rarity ?? "",
    scale: Number(frame.frame_scale) || 1.22,
    offsetX: Number(frame.frame_offset_x) || 0,
    offsetY: Number(frame.frame_offset_y) || 0,
    isActive: frame.is_active !== false,
    createdAt: frame.created_at ?? null,
    updatedAt: frame.updated_at ?? null,
  };
}

function getProfileFrameById(profileFrames, frameId) {
  if (!frameId) {
    return null;
  }

  return (profileFrames ?? []).find((frame) => frame.id === frameId) ?? null;
}

function getMeteorImageExtension(file) {
  return METEOR_IMAGE_ALLOWED_TYPES[file?.type] ?? null;
}

function getMeteorVideoExtension(file) {
  return METEOR_VIDEO_ALLOWED_TYPES[file?.type] ?? null;
}

function createMeteorMediaPath(userId, uploadBatchId, sortOrder, file) {
  const extension = getMeteorImageExtension(file) || "jpg";
  return `${userId}/${uploadBatchId}/${sortOrder}-${createClientId()}.${extension}`;
}

function createMeteorVideoPath(userId, uploadBatchId, file) {
  const extension = getMeteorVideoExtension(file) || "mp4";
  return `${userId}/${uploadBatchId}/video-${createClientId()}.${extension}`;
}

function createMeteorVideoThumbnailPath(userId, uploadBatchId, extension = METEOR_VIDEO_THUMBNAIL_EXTENSION) {
  return `${userId}/${uploadBatchId}/thumbnail-${createClientId()}.${extension}`;
}

function getSafeDisplayFileName(name, fallback) {
  const fileName = String(name ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  const compactName = fileName.replace(/\s+/g, " ");

  if (!compactName || /^[0-9a-f]{8}-[0-9a-f-]{18,}$/i.test(compactName)) {
    return fallback;
  }

  return compactName.length > 44 ? `${compactName.slice(0, 18)}...${compactName.slice(-18)}` : compactName;
}

function getFileNameBase(name, fallback = "hoshiutsushi") {
  const fileName = String(name ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const safeBase = withoutExtension
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return safeBase || fallback;
}

function createVideoCoverFileName(sourceName) {
  return `${getFileNameBase(sourceName, "hoshiutsushi-cover")}-cover.${METEOR_VIDEO_THUMBNAIL_EXTENSION}`;
}

function createTrimmedVideoFileName(sourceName, mimeType) {
  const extension = METEOR_VIDEO_ALLOWED_TYPES[mimeType] === "webm" ? "webm" : "mp4";
  return `${getFileNameBase(sourceName, "hoshiutsushi")}-trimmed.${extension}`;
}

function createFileFromBlob(blob, fileName, type = blob.type) {
  return new File([blob], fileName, {
    lastModified: Date.now(),
    type: type || blob.type || "application/octet-stream",
  });
}

function createPostImageDraft(file) {
  return {
    id: createClientId(),
    file,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    size: file.size,
    type: file.type,
  };
}

function createPostVideoDraft(file, metadata) {
  const displayName = getSafeDisplayFileName(metadata?.displayName ?? metadata?.originalName ?? file.name, "選択した星映");

  return {
    id: createClientId(),
    durationSeconds: metadata.durationSeconds,
    displayName,
    file,
    name: displayName,
    originalName: metadata?.originalName ?? file.name,
    previewUrl: URL.createObjectURL(file),
    size: file.size,
    type: file.type,
    wasTrimmed: Boolean(metadata?.wasTrimmed),
  };
}

function createPostThumbnailDraft(file, options = {}) {
  const displayName = getSafeDisplayFileName(options.displayName ?? file.name, "星映の表紙");

  return {
    id: createClientId(),
    displayName,
    file,
    name: displayName,
    previewUrl: URL.createObjectURL(file),
    size: file.size,
    type: file.type,
  };
}

function revokePostImageDraft(draft) {
  if (draft?.previewUrl) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

function revokePostVideoDraft(draft) {
  if (draft?.previewUrl) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

function revokePostThumbnailDraft(draft) {
  if (draft?.previewUrl) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

function formatMediaDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatFileSize(bytes) {
  const safeBytes = Number(bytes) || 0;

  if (safeBytes >= 1024 * 1024) {
    return `${(safeBytes / 1024 / 1024).toFixed(1)}MB`;
  }

  return `${Math.max(1, Math.round(safeBytes / 1024))}KB`;
}

function loadVideoMetadataFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    function cleanup() {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    }

    function settle(callback, value) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback(value);
    }

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const durationSeconds = video.duration;

      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        settle(reject, createUserFacingError("星映の再生時間を確認できませんでした。"));
        return;
      }

      settle(resolve, {
        durationSeconds,
        height: video.videoHeight || null,
        width: video.videoWidth || null,
      });
    };
    video.onerror = () => settle(reject, createUserFacingError("この星映はブラウザで再生確認できませんでした。"));
    video.src = objectUrl;
  });
}

function createVideoCoverBlob(file, durationSeconds) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    function cleanup() {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    }

    function settle(callback, value) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback(value);
    }

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const safeDuration = Math.max(0.05, Number(durationSeconds || video.duration) || 0.05);
      const targetTime = Math.min(Math.max(0.05, safeDuration * 0.06), Math.max(0.05, safeDuration - 0.05), 1.2);
      video.currentTime = Number.isFinite(targetTime) ? targetTime : 0.2;
    };
    video.onseeked = () => {
      const sourceWidth = video.videoWidth || 640;
      const sourceHeight = video.videoHeight || 360;
      const scale = Math.max(METEOR_VIDEO_COVER_OUTPUT_WIDTH / sourceWidth, METEOR_VIDEO_COVER_OUTPUT_HEIGHT / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const drawX = (METEOR_VIDEO_COVER_OUTPUT_WIDTH - drawWidth) / 2;
      const drawY = (METEOR_VIDEO_COVER_OUTPUT_HEIGHT - drawHeight) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = METEOR_VIDEO_COVER_OUTPUT_WIDTH;
      canvas.height = METEOR_VIDEO_COVER_OUTPUT_HEIGHT;

      const context = canvas.getContext("2d");

      if (!context) {
        settle(reject, createUserFacingError("星映の表紙を生成できませんでした。"));
        return;
      }

      context.fillStyle = "#050816";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, drawX, drawY, drawWidth, drawHeight);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            settle(resolve, blob);
            return;
          }

          settle(reject, createUserFacingError("星映の表紙を生成できませんでした。"));
        },
        METEOR_VIDEO_THUMBNAIL_TYPE,
        METEOR_VIDEO_THUMBNAIL_QUALITY,
      );
    };
    video.onerror = () => settle(reject, createUserFacingError("星映の表紙を生成できませんでした。"));
    video.src = objectUrl;
  });
}

async function createVideoCoverFile(file, durationSeconds, displayName = "自動生成した星映の表紙") {
  const coverBlob = await createVideoCoverBlob(file, durationSeconds);
  const coverFile = createFileFromBlob(coverBlob, createVideoCoverFileName(file.name), METEOR_VIDEO_THUMBNAIL_TYPE);

  return createPostThumbnailDraft(coverFile, { displayName });
}

async function createTrimmedVideoFile({ endSeconds, file, onConversionReady, onProgress, startSeconds }) {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    WebMOutputFormat,
  } = await import("mediabunny");
  const outputMimeType = file.type === "video/webm" ? "video/webm" : "video/mp4";
  const outputFormat = outputMimeType === "video/webm" ? new WebMOutputFormat() : new Mp4OutputFormat();
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  const outputTarget = new BufferTarget();
  const output = new Output({
    format: outputFormat,
    target: outputTarget,
  });
  const conversion = await Conversion.init({
    input,
    output,
    showWarnings: false,
    tracks: "all",
    trim: {
      end: endSeconds,
      start: startSeconds,
    },
  });

  onConversionReady?.(conversion);

  if (!conversion.isValid) {
    throw createUserFacingError("星映を切り取れませんでした。");
  }

  conversion.onProgress = (progress) => {
    onProgress?.(clampNumber(Number(progress) || 0, 0, 1));
  };

  await conversion.execute();

  if (!outputTarget.buffer) {
    throw createUserFacingError("星映を切り取れませんでした。");
  }

  return createFileFromBlob(
    new Blob([outputTarget.buffer], { type: outputMimeType }),
    createTrimmedVideoFileName(file.name, outputMimeType),
    outputMimeType,
  );
}

function applyVisiblePostTypeFilter(query) {
  return query.in("type", VISIBLE_POST_TYPES);
}

async function runPostQuery(buildQuery) {
  const result = await buildQuery(POST_SELECT_COLUMNS_WITH_DELETED_AT, true);

  if (result.error && isMissingDeletedAtError(result.error)) {
    return {
      ...(await buildQuery(POST_SELECT_COLUMNS, false)),
      supportsSoftDelete: false,
    };
  }

  return {
    ...result,
    supportsSoftDelete: true,
  };
}

async function runProfileQuery(buildQuery, columnsWithFrame, fallbackColumns) {
  const result = await buildQuery(columnsWithFrame, true);

  if (result.error && isMissingProfileFrameSchemaError(result.error)) {
    return {
      ...(await buildQuery(fallbackColumns, false)),
      supportsProfileFrames: false,
    };
  }

  return {
    ...result,
    supportsProfileFrames: true,
  };
}

const STAR_LETTER_SELECT_COLUMNS =
  "id, post_id, author_id, parent_star_letter_id, body, created_at, updated_at, edited_at, deleted_at";
const STAR_LETTER_LEGACY_SELECT_COLUMNS = "id, post_id, author_id, body, created_at, updated_at";

async function runStarLetterQuery(buildQuery) {
  const result = await buildQuery(STAR_LETTER_SELECT_COLUMNS);

  if (result.error && isMissingStarLetterConversationColumnError(result.error)) {
    return buildQuery(STAR_LETTER_LEGACY_SELECT_COLUMNS);
  }

  return result;
}

async function createMeteorMediaSignedUrl(bucket, storagePath) {
  if (!bucket || !storagePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, METEOR_MEDIA_SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) {
    logSafeError(ERROR_OPERATION.MEDIA_SIGNED_URL, error);
    return null;
  }

  return data?.signedUrl ?? null;
}

async function mapPostMediaRows(mediaRows) {
  const mappedRows = await Promise.all(
    (mediaRows ?? [])
    .filter((row) => (row?.media_type === "image" || row?.media_type === "video") && row.storage_path)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(async (row) => {
      const mediaType = row.media_type === "video" ? "video" : "image";
      const bucket = mediaType === "video" ? METEOR_VIDEO_BUCKET : METEOR_MEDIA_BUCKET;
      const url = await createMeteorMediaSignedUrl(bucket, row.storage_path);
      const thumbnailUrl = row.thumbnail_storage_path
        ? await createMeteorMediaSignedUrl(METEOR_MEDIA_BUCKET, row.thumbnail_storage_path)
        : null;

      if (!url) {
        return null;
      }

      return {
        id: row.id,
        postId: row.post_id,
        storagePath: row.storage_path,
        thumbnailStoragePath: row.thumbnail_storage_path ?? null,
        sortOrder: row.sort_order ?? 0,
        mediaType,
        mimeType: row.mime_type ?? "",
        sizeBytes: row.size_bytes ?? null,
        durationSeconds: row.duration_seconds ?? null,
        createdAt: row.created_at ?? null,
        url,
        thumbnailUrl,
      };
    }),
  );

  return mappedRows.filter(Boolean);
}

async function readPostMediaForPostIds(postIds) {
  const uniquePostIds = [...new Set((postIds ?? []).filter(Boolean))];

  if (uniquePostIds.length === 0) {
    return { mediaByPostId: new Map(), error: null };
  }

  const result = await supabase
    .from("post_media")
    .select(POST_MEDIA_SELECT_COLUMNS)
    .in("post_id", uniquePostIds)
    .order("sort_order", { ascending: true });

  let data = result.data;
  let error = result.error;

  if (error && isMissingVideoPostMediaColumnError(error)) {
    const fallbackResult = await supabase
      .from("post_media")
      .select(POST_MEDIA_LEGACY_SELECT_COLUMNS)
      .in("post_id", uniquePostIds)
      .eq("media_type", "image")
      .order("sort_order", { ascending: true });

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    return { mediaByPostId: new Map(), error };
  }

  const mediaByPostId = new Map();

  for (const media of await mapPostMediaRows(data)) {
    mediaByPostId.set(media.postId, [...(mediaByPostId.get(media.postId) ?? []), media]);
  }

  return { mediaByPostId, error: null };
}

async function insertPostMediaRows(mediaRows) {
  const result = await supabase.from("post_media").insert(mediaRows).select(POST_MEDIA_SELECT_COLUMNS);

  if (
    result.error &&
    isMissingVideoPostMediaColumnError(result.error) &&
    mediaRows.every((row) => row.media_type === "image")
  ) {
    const legacyRows = mediaRows.map(({ duration_seconds, thumbnail_storage_path, ...row }) => row);
    return supabase.from("post_media").insert(legacyRows).select(POST_MEDIA_LEGACY_SELECT_COLUMNS);
  }

  return result;
}

function attachMediaToPosts(posts, mediaByPostId) {
  return (posts ?? []).map((post) => ({
    ...post,
    media: mediaByPostId.get(post.id) ?? [],
  }));
}

function mapMeteorTagRow(tagRow, sortOrder = 0) {
  const name = String(tagRow?.name ?? "").replace(/^#/, "").trim();
  const normalizedName = tagRow?.normalized_name || getMeteorTagSearchKey(name);

  return {
    id: tagRow?.id ?? normalizedName,
    label: name ? `#${name}` : "",
    name,
    normalizedName,
    sortOrder,
  };
}

async function readMeteorTagsForPostIds(postIds) {
  const uniquePostIds = [...new Set((postIds ?? []).filter(Boolean))];

  if (uniquePostIds.length === 0) {
    return { error: null, tagsByPostId: new Map() };
  }

  const { data, error } = await supabase
    .from("post_meteor_tags")
    .select(POST_METEOR_TAG_SELECT_COLUMNS)
    .in("post_id", uniquePostIds)
    .order("sort_order", { ascending: true });

  if (error) {
    return { error, tagsByPostId: new Map() };
  }

  const tagsByPostId = new Map();

  for (const row of data ?? []) {
    const tag = mapMeteorTagRow(row.meteor_tags, row.sort_order ?? 0);

    if (!tag.name) {
      continue;
    }

    tagsByPostId.set(row.post_id, [...(tagsByPostId.get(row.post_id) ?? []), tag]);
  }

  return { error: null, tagsByPostId };
}

function attachMeteorTagsToPosts(posts, tagsByPostId) {
  return (posts ?? []).map((post) => ({
    ...post,
    tags: tagsByPostId.get(post.id) ?? [],
  }));
}

async function hydratePostsWithMeteorTags(posts) {
  const safePosts = posts ?? [];
  const { tagsByPostId, error } = await readMeteorTagsForPostIds(safePosts.map((post) => post.id));

  if (error) {
    return { error, posts: safePosts };
  }

  return { error: null, posts: attachMeteorTagsToPosts(safePosts, tagsByPostId) };
}

async function hydratePostsWithMedia(posts) {
  const safePosts = posts ?? [];
  const { mediaByPostId, error } = await readPostMediaForPostIds(safePosts.map((post) => post.id));

  if (error) {
    return { posts: safePosts, error };
  }

  return { posts: attachMediaToPosts(safePosts, mediaByPostId), error: null };
}

async function hydratePostsWithAssets(posts) {
  const mediaResult = await hydratePostsWithMedia(posts);
  const tagResult = await hydratePostsWithMeteorTags(mediaResult.posts);

  return {
    error: mediaResult.error || tagResult.error,
    posts: tagResult.posts,
  };
}

async function readMeteorTagsByNormalizedNames(normalizedNames) {
  const uniqueNames = [...new Set((normalizedNames ?? []).filter(Boolean))];

  if (uniqueNames.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from("meteor_tags")
    .select(METEOR_TAG_SELECT_COLUMNS)
    .in("normalized_name", uniqueNames);
}

async function ensureMeteorTags(tagDrafts, creatorId) {
  const safeDrafts = (tagDrafts ?? []).filter((tag) => tag?.normalizedName);

  if (safeDrafts.length === 0) {
    return { error: null, tags: [] };
  }

  const normalizedNames = safeDrafts.map((tag) => tag.normalizedName);
  const existingResult = await readMeteorTagsByNormalizedNames(normalizedNames);

  if (existingResult.error) {
    return { error: existingResult.error, tags: [] };
  }

  const tagsByNormalizedName = new Map(
    (existingResult.data ?? []).map((tagRow) => [tagRow.normalized_name, mapMeteorTagRow(tagRow)]),
  );

  for (const tagDraft of safeDrafts) {
    if (tagsByNormalizedName.has(tagDraft.normalizedName)) {
      continue;
    }

    const { data, error } = await supabase
      .from("meteor_tags")
      .insert({
        created_by: creatorId,
        name: tagDraft.name,
        normalized_name: tagDraft.normalizedName,
      })
      .select(METEOR_TAG_SELECT_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        const retryResult = await readMeteorTagsByNormalizedNames([tagDraft.normalizedName]);

        if (retryResult.error) {
          return { error: retryResult.error, tags: [] };
        }

        const existingTag = retryResult.data?.[0];

        if (existingTag) {
          tagsByNormalizedName.set(tagDraft.normalizedName, mapMeteorTagRow(existingTag));
          continue;
        }
      }

      return { error, tags: [] };
    }

    tagsByNormalizedName.set(tagDraft.normalizedName, mapMeteorTagRow(data));
  }

  return {
    error: null,
    tags: safeDrafts
      .map((tagDraft, index) => {
        const tag = tagsByNormalizedName.get(tagDraft.normalizedName);
        return tag ? { ...tag, sortOrder: index } : null;
      })
      .filter(Boolean),
  };
}

async function replacePostMeteorTags(postId, tagDrafts, creatorId) {
  const safeDrafts = tagDrafts ?? [];
  let tags = [];

  if (safeDrafts.length > 0) {
    const { error: ensureError, tags: ensuredTags } = await ensureMeteorTags(safeDrafts, creatorId);

    if (ensureError) {
      return { error: ensureError, tags: [] };
    }

    tags = ensuredTags;
  }

  const { error: deleteError } = await supabase
    .from("post_meteor_tags")
    .delete()
    .eq("post_id", postId);

  if (deleteError) {
    return { error: deleteError, tags: [] };
  }

  if (tags.length === 0) {
    return { error: null, tags: [] };
  }

  const rows = tags.map((tag, index) => ({
    post_id: postId,
    sort_order: index,
    tag_id: tag.id,
  }));
  const { error: insertError } = await supabase.from("post_meteor_tags").insert(rows);

  if (insertError) {
    return { error: insertError, tags: [] };
  }

  return { error: null, tags };
}

function getRouteFromLocation() {
  const searchParams = new URLSearchParams(window.location.search);
  const starLetterId = searchParams.get("star_letter");
  const legalMatch = window.location.pathname.match(/^\/(privacy|terms)\/?$/);

  if (legalMatch?.[1]) {
    return {
      name: "legal",
      legalPage: legalMatch[1],
      postId: null,
      tagName: null,
      username: null,
    };
  }

  const meteorMatch = window.location.pathname.match(/^\/meteor\/([^/?#]+)\/?$/);

  if (meteorMatch?.[1]) {
    return {
      name: "meteor",
      legalPage: null,
      postId: decodeURIComponent(meteorMatch[1]),
      starLetterId,
      tagName: null,
      username: null,
    };
  }

  const starMatch = window.location.pathname.match(/^\/stars\/([^/?#]+)\/?$/);

  if (starMatch?.[1]) {
    return {
      name: "starProfile",
      legalPage: null,
      postId: null,
      tagName: null,
      username: decodeURIComponent(starMatch[1]).replace(/^@/, ""),
    };
  }

  const tagMatch = window.location.pathname.match(/^\/tags\/([^/?#]+)\/?$/);

  if (tagMatch?.[1]) {
    return {
      name: "meteorTag",
      legalPage: null,
      postId: null,
      tagName: decodeURIComponent(tagMatch[1]).replace(/^#/, ""),
      username: null,
    };
  }

  return {
    name: "home",
    legalPage: null,
    postId: null,
    tagName: null,
    username: null,
  };
}

function buildMeteorPath(postId) {
  return `/meteor/${encodeURIComponent(postId)}`;
}

function buildStarLetterThreadPath(postId, starLetterId) {
  const path = buildMeteorPath(postId);

  return starLetterId ? `${path}?star_letter=${encodeURIComponent(starLetterId)}` : path;
}

function buildStarProfilePath(username) {
  return `/stars/${encodeURIComponent(String(username ?? "").replace(/^@/, ""))}`;
}

function buildMeteorTagPath(tagName) {
  return `/tags/${encodeURIComponent(String(tagName ?? "").replace(/^#/, ""))}`;
}

function getAvatarText(value) {
  return value.trim().charAt(0) || defaultProfileView.avatar;
}

function formatPostTime(createdAt) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "今";
  }

  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

function formatNotificationTime(createdAt) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }

  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNotificationActorName(notification) {
  const actorProfile = notification.actorProfile;

  if (actorProfile?.display_name) {
    return actorProfile.display_name;
  }

  if (actorProfile?.username) {
    return actorProfile.username;
  }

  return "誰か";
}

function formatNotificationMessage(notification) {
  const actorName = getNotificationActorName(notification);

  if (notification.type === "resonance") {
    return `${actorName}さんがあなたの流星便に共鳴しました。`;
  }

  if (notification.type === "archive") {
    return `${actorName}さんがあなたの流星便をArchiveしました。`;
  }

  if (notification.type === "star_letter") {
    return `${actorName}さんがあなたの流星便に星文を送りました。`;
  }

  if (notification.type === "star_letter_reply") {
    return `${actorName}さんがあなたの星文に返信しました。`;
  }

  if (notification.type === "star_letter_resonance") {
    return `${actorName}さんがあなたの星文に共鳴しました。`;
  }

  return notification.message;
}

function mapSavedPost(post, authorProfile, profileFrames = []) {
  const displayName = authorProfile?.display_name || defaultProfileView.display_name;
  const username = authorProfile?.username ? `@${authorProfile.username}` : "@starry_creator";
  const avatarFrame = getProfileFrameById(profileFrames, authorProfile?.active_frame_id);

  return {
    id: post.id,
    authorId: post.author_id,
    authorUsername: authorProfile?.username ?? null,
    name: displayName,
    handle: username,
    badge: "流星便",
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile?.avatar_url ?? null,
    avatarFrame,
    avatarFrameId: authorProfile?.active_frame_id ?? null,
    createdAt: post.created_at,
    deletedAt: post.deleted_at ?? null,
    time: formatPostTime(post.created_at),
    type: post.type,
    text: post.body,
    visibility: post.visibility,
    media: [],
    tags: [],
    resonanceCount: 0,
    comments: "未集計",
    glow: "from-comet/25 to-sakura/20",
  };
}

function applyAuthorProfileToPost(post, authorProfile, profileFrames = []) {
  if (!post || post.authorId !== authorProfile?.id) {
    return post;
  }

  const displayName = authorProfile.display_name || defaultProfileView.display_name;
  const avatarFrame = getProfileFrameById(profileFrames, authorProfile.active_frame_id);

  return {
    ...post,
    authorUsername: authorProfile.username ?? null,
    name: displayName,
    handle: authorProfile.username ? `@${authorProfile.username}` : post.handle,
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile.avatar_url ?? null,
    avatarFrame,
    avatarFrameId: authorProfile.active_frame_id ?? null,
  };
}

function mapArchivedPost(archive, post, authorProfile, profileFrames = []) {
  return {
    ...mapSavedPost(post, authorProfile, profileFrames),
    archiveId: archive.id,
    archivedAt: archive.created_at,
    archivedTime: formatNotificationTime(archive.created_at),
  };
}

function applyAuthorProfileToStarLetter(letter, authorProfile, profileFrames = []) {
  if (!letter || letter.authorId !== authorProfile?.id) {
    return letter;
  }

  const displayName = authorProfile.display_name || "誰か";
  const avatarFrame = getProfileFrameById(profileFrames, authorProfile.active_frame_id);

  return {
    ...letter,
    name: displayName,
    handle: authorProfile.username ? `@${authorProfile.username}` : letter.handle,
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile.avatar_url ?? null,
    avatarFrame,
    avatarFrameId: authorProfile.active_frame_id ?? null,
  };
}

function mapStarLetter(letter, authorProfile, profileFrames = []) {
  const displayName = authorProfile?.display_name || "誰か";
  const avatarFrame = getProfileFrameById(profileFrames, authorProfile?.active_frame_id);

  return {
    id: letter.id,
    postId: letter.post_id,
    authorId: letter.author_id,
    parentStarLetterId: letter.parent_star_letter_id ?? null,
    body: letter.body,
    isDeleted: Boolean(letter.is_deleted ?? letter.deleted_at),
    isArchived: Boolean(letter.is_archived),
    totalResonanceCount: Number(letter.total_resonance_count ?? 0),
    viewerResonanceCount: Number(letter.viewer_resonance_count ?? 0),
    conversationAvailable: Boolean(letter.conversationAvailable),
    name: displayName,
    handle: authorProfile?.username ? `@${authorProfile.username}` : "@star_letter",
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile?.avatar_url ?? null,
    avatarFrame,
    avatarFrameId: authorProfile?.active_frame_id ?? null,
    time: formatNotificationTime(letter.created_at),
    createdAt: letter.created_at,
    updatedAt: letter.updated_at ?? null,
    editedAt: letter.edited_at ?? null,
  };
}

function App() {
  const [activeTab, setActiveTab] = useState("observe");
  const [route, setRoute] = useState(() => getRouteFromLocation());
  const [detailPost, setDetailPost] = useState(null);
  const [detailPostLoading, setDetailPostLoading] = useState(false);
  const [detailPostError, setDetailPostError] = useState("");
  const [publicProfile, setPublicProfile] = useState(null);
  const [publicProfileTags, setPublicProfileTags] = useState([]);
  const [publicProfilePosts, setPublicProfilePosts] = useState([]);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState("");
  const [meteorTagView, setMeteorTagView] = useState(null);
  const [meteorTagPosts, setMeteorTagPosts] = useState([]);
  const [meteorTagLoading, setMeteorTagLoading] = useState(false);
  const [meteorTagError, setMeteorTagError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [profileShareMessage, setProfileShareMessage] = useState("");
  const [profileShareError, setProfileShareError] = useState("");
  const [session, setSession] = useState(null);
  const activeSessionUserIdRef = useRef(null);
  const [onboardingProgress, setOnboardingProgress] = useState(null);
  const onboardingProgressRef = useRef(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const onboardingAdvanceInFlightRef = useRef(false);
  const onboardingPostCompletionRef = useRef(false);
  const [authStatus, setAuthStatus] = useState("確認中");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileScreenMode, setProfileScreenMode] = useState("view");
  const [guideIsAdmin, setGuideIsAdmin] = useState(false);
  const [guideAdminLoading, setGuideAdminLoading] = useState(false);
  const [profileFrames, setProfileFrames] = useState([]);
  const [ownedProfileFrameIds, setOwnedProfileFrameIds] = useState([]);
  const [profileFramesAvailable, setProfileFramesAvailable] = useState(true);
  const [profileFramesLoading, setProfileFramesLoading] = useState(false);
  const [profileFramesError, setProfileFramesError] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarCroppedBlob, setAvatarCroppedBlob] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarCropFile, setAvatarCropFile] = useState(null);
  const [avatarCropPreviewUrl, setAvatarCropPreviewUrl] = useState("");
  const [avatarCropModalOpen, setAvatarCropModalOpen] = useState(false);
  const [avatarCropZoom, setAvatarCropZoom] = useState(AVATAR_CROP_MIN_ZOOM);
  const [avatarCropOffset, setAvatarCropOffset] = useState({ x: 0, y: 0 });
  const [avatarImageSize, setAvatarImageSize] = useState(null);
  const [avatarCropFrameSize, setAvatarCropFrameSize] = useState(AVATAR_CROP_PREVIEW_FALLBACK_SIZE);
  const [avatarCropPreparing, setAvatarCropPreparing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarModal, setAvatarModal] = useState(null);
  const [savedPosts, setSavedPosts] = useState([]);
  const [ownPosts, setOwnPosts] = useState([]);
  const [ownPostsLoading, setOwnPostsLoading] = useState(false);
  const [ownPostsError, setOwnPostsError] = useState("");
  const [myConstellationView, setMyConstellationView] = useState("posts");
  const [resonatedPosts, setResonatedPosts] = useState([]);
  const [resonatedPostsLoading, setResonatedPostsLoading] = useState(false);
  const [resonatedPostsError, setResonatedPostsError] = useState("");
  const [sentStarLetters, setSentStarLetters] = useState([]);
  const [sentStarLettersLoading, setSentStarLettersLoading] = useState(false);
  const [sentStarLettersError, setSentStarLettersError] = useState("");
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [postImageDrafts, setPostImageDrafts] = useState([]);
  const postImageDraftsRef = useRef([]);
  const [postVideoDraft, setPostVideoDraft] = useState(null);
  const postVideoDraftRef = useRef(null);
  const [postThumbnailDraft, setPostThumbnailDraft] = useState(null);
  const postThumbnailDraftRef = useRef(null);
  const [postVideoPreparing, setPostVideoPreparing] = useState(false);
  const [postVideoTrimDraft, setPostVideoTrimDraft] = useState(null);
  const [postVideoTrimStart, setPostVideoTrimStart] = useState(0);
  const [postVideoTrimLength, setPostVideoTrimLength] = useState(METEOR_VIDEO_MAX_DURATION_SECONDS);
  const [postVideoTrimProgress, setPostVideoTrimProgress] = useState(0);
  const [postVideoTrimProcessing, setPostVideoTrimProcessing] = useState(false);
  const [postVideoTrimError, setPostVideoTrimError] = useState("");
  const postVideoTrimConversionRef = useRef(null);
  const postVideoTrimCancelRequestedRef = useRef(false);
  const [postCoverCropFile, setPostCoverCropFile] = useState(null);
  const [postCoverCropPreviewUrl, setPostCoverCropPreviewUrl] = useState("");
  const [postCoverCropModalOpen, setPostCoverCropModalOpen] = useState(false);
  const [postCoverCropZoom, setPostCoverCropZoom] = useState(AVATAR_CROP_MIN_ZOOM);
  const [postCoverCropOffset, setPostCoverCropOffset] = useState({ x: 0, y: 0 });
  const [postCoverImageSize, setPostCoverImageSize] = useState(null);
  const [postCoverCropFrameSize, setPostCoverCropFrameSize] = useState({
    height: METEOR_VIDEO_COVER_PREVIEW_FALLBACK_HEIGHT,
    width: METEOR_VIDEO_COVER_PREVIEW_FALLBACK_WIDTH,
  });
  const [postCoverCropPreparing, setPostCoverCropPreparing] = useState(false);
  const [postSaving, setPostSaving] = useState(false);
  const [postMessage, setPostMessage] = useState("");
  const [postError, setPostError] = useState("");
  const [postUploadProgress, setPostUploadProgress] = useState("");
  const [mediaViewer, setMediaViewer] = useState(null);
  const [starMovieObservation, setStarMovieObservation] = useState(null);
  const starMovieObservationTriggerRef = useRef(null);
  const starMovieObservationHistoryIdRef = useRef(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [postEditDrafts, setPostEditDrafts] = useState({});
  const [postUpdatingId, setPostUpdatingId] = useState(null);
  const [postDeletingId, setPostDeletingId] = useState(null);
  const [postActionMessage, setPostActionMessage] = useState("");
  const [postActionError, setPostActionError] = useState("");
  const [resonanceSavingPostId, setResonanceSavingPostId] = useState(null);
  const [resonanceMessage, setResonanceMessage] = useState("");
  const [resonanceError, setResonanceError] = useState("");
  const [archivedPosts, setArchivedPosts] = useState([]);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [archivesError, setArchivesError] = useState("");
  const [archivesMessage, setArchivesMessage] = useState("");
  const [archiveSavingPostId, setArchiveSavingPostId] = useState(null);
  const [archiveView, setArchiveView] = useState("posts");
  const [archivedStarLetters, setArchivedStarLetters] = useState([]);
  const [archivedStarLettersLoading, setArchivedStarLettersLoading] = useState(false);
  const [archivedStarLettersError, setArchivedStarLettersError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsMessage, setNotificationsMessage] = useState("");
  const [notificationUpdatingId, setNotificationUpdatingId] = useState(null);
  const [starLettersByPostId, setStarLettersByPostId] = useState({});
  const [starLettersLoading, setStarLettersLoading] = useState(false);
  const [starLettersError, setStarLettersError] = useState("");
  const [starLettersMessage, setStarLettersMessage] = useState("");
  const [starLetterSavingPostId, setStarLetterSavingPostId] = useState(null);
  const [openStarLetterPostId, setOpenStarLetterPostId] = useState(null);
  const [starLetterDrafts, setStarLetterDrafts] = useState({});
  const [editingStarLetterId, setEditingStarLetterId] = useState(null);
  const [starLetterEditDrafts, setStarLetterEditDrafts] = useState({});
  const [starLetterUpdatingId, setStarLetterUpdatingId] = useState(null);
  const [starLetterDeletingId, setStarLetterDeletingId] = useState(null);
  const [starLetterReplyComposer, setStarLetterReplyComposer] = useState(null);
  const [starLetterReplySavingId, setStarLetterReplySavingId] = useState(null);
  const [starLetterResonatingIds, setStarLetterResonatingIds] = useState(() => new Set());
  const [starLetterArchivingIds, setStarLetterArchivingIds] = useState(() => new Set());
  const [highlightedStarLetterId, setHighlightedStarLetterId] = useState(null);
  const starLetterRequestIdsRef = useRef(createOperationRequestIdStore());
  const [feedbackType, setFeedbackType] = useState(FEEDBACK_TYPES[0]);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const detailPostId = route.name === "meteor" ? route.postId : null;
  const detailStarLetterId = route.name === "meteor" ? route.starLetterId ?? null : null;
  const publicProfileUsername = route.name === "starProfile" ? route.username : null;
  const meteorTagRouteName = route.name === "meteorTag" ? route.tagName : null;
  const postIdsKey = savedPosts.map((post) => post.id).filter(Boolean).join("|");
  const ownPostIdsKey = ownPosts.map((post) => post.id).filter(Boolean).join("|");
  const resonatedPostIdsKey = resonatedPosts.map((post) => post.id).filter(Boolean).join("|");
  const archivedPostIdsKey = archivedPosts.map((post) => post.id).filter(Boolean).join("|");
  const publicProfilePostIdsKey = publicProfilePosts.map((post) => post.id).filter(Boolean).join("|");
  const meteorTagPostIdsKey = meteorTagPosts.map((post) => post.id).filter(Boolean).join("|");
  const allPostIdsKey = [
    ...new Set(
      [...savedPosts, ...ownPosts, ...resonatedPosts, ...archivedPosts, ...publicProfilePosts, ...meteorTagPosts, detailPost]
        .filter(Boolean)
        .map((post) => post.id)
        .filter(Boolean),
    ),
  ].join("|");
  const sessionUserId = session?.user?.id ?? null;
  const sessionOnboardingProgress = isOnboardingProgressForUser(onboardingProgress, sessionUserId)
    ? onboardingProgress
    : null;
  const sessionOnboardingProfile = profile?.id === sessionUserId ? profile : null;

  useEffect(() => {
    function handlePopState() {
      setStarMovieObservation((currentObservation) => {
        if (!currentObservation) {
          return currentObservation;
        }

        const trigger = starMovieObservationTriggerRef.current;
        starMovieObservationTriggerRef.current = null;
        starMovieObservationHistoryIdRef.current = null;
        window.requestAnimationFrame(() => trigger?.focus?.());
        return null;
      });
      setRoute(getRouteFromLocation());
      setShareMessage("");
      setShareError("");
      setProfileShareMessage("");
      setProfileShareError("");
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    return () => {
      if (avatarCropPreviewUrl) {
        URL.revokeObjectURL(avatarCropPreviewUrl);
      }
    };
  }, [avatarCropPreviewUrl]);

  useEffect(() => {
    return () => {
      if (postVideoTrimDraft?.previewUrl) {
        URL.revokeObjectURL(postVideoTrimDraft.previewUrl);
      }
    };
  }, [postVideoTrimDraft]);

  useEffect(() => {
    return () => {
      if (postCoverCropPreviewUrl) {
        URL.revokeObjectURL(postCoverCropPreviewUrl);
      }
    };
  }, [postCoverCropPreviewUrl]);

  useEffect(() => {
    if (!detailPostId || !detailStarLetterId) {
      return undefined;
    }

    setOpenStarLetterPostId(detailPostId);
    void refreshStarLettersForPost(detailPostId);

    return undefined;
  }, [detailPostId, detailStarLetterId]);

  useEffect(() => {
    if (!detailPostId || !detailStarLetterId || !starLettersByPostId[detailPostId]) {
      return undefined;
    }

    if (!starLettersByPostId[detailPostId].some((letter) => letter.id === detailStarLetterId)) {
      setHighlightedStarLetterId(null);
      setStarLettersMessage("対象の星文は見つかりませんでした。流星便の星文を表示しています。");
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(`star-letter-${detailStarLetterId}`);

      if (!target) {
        return;
      }

      setHighlightedStarLetterId(detailStarLetterId);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    });
    const timeoutId = window.setTimeout(() => setHighlightedStarLetterId(null), 2600);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [detailPostId, detailStarLetterId, starLettersByPostId]);

  useEffect(() => {
    starLetterRequestIdsRef.current = createOperationRequestIdStore();
    setStarLetterReplyComposer(null);
    setStarLetterResonatingIds(new Set());
    setStarLetterArchivingIds(new Set());
  }, [session?.user?.id]);

  useEffect(() => {
    postImageDraftsRef.current = postImageDrafts;
  }, [postImageDrafts]);

  useEffect(() => {
    postVideoDraftRef.current = postVideoDraft;
  }, [postVideoDraft]);

  useEffect(() => {
    postThumbnailDraftRef.current = postThumbnailDraft;
  }, [postThumbnailDraft]);

  useEffect(
    () => () => {
      for (const draft of postImageDraftsRef.current) {
        revokePostImageDraft(draft);
      }

      revokePostVideoDraft(postVideoDraftRef.current);
      revokePostThumbnailDraft(postThumbnailDraftRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!avatarModal) {
      return undefined;
    }

    function handleAvatarModalKeyDown(event) {
      if (event.key === "Escape") {
        setAvatarModal(null);
      }
    }

    window.addEventListener("keydown", handleAvatarModalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleAvatarModalKeyDown);
    };
  }, [avatarModal]);

  useEffect(() => {
    let isMounted = true;

    async function readSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        setAuthStatus("確認エラー");
        setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SESSION));
        return;
      }

      activeSessionUserIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setAuthStatus(data.session ? "ログイン中" : "未ログイン");
    }

    readSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      activeSessionUserIdRef.current = session?.user?.id ?? null;
      setSession(session);
      setAuthStatus(session ? "ログイン中" : "未ログイン");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    activeSessionUserIdRef.current = session?.user?.id ?? null;
  }, [session?.user?.id]);

  useEffect(() => {
    onboardingProgressRef.current = isOnboardingProgressForUser(onboardingProgress, sessionUserId)
      ? onboardingProgress
      : null;
  }, [onboardingProgress, sessionUserId]);

  useEffect(() => {
    let isMounted = true;
    const userId = sessionUserId;

    activeSessionUserIdRef.current = userId;
    onboardingProgressRef.current = null;
    onboardingAdvanceInFlightRef.current = false;
    onboardingPostCompletionRef.current = false;
    setOnboardingProgress(null);
    setOnboardingBusy(false);
    setOnboardingError("");

    if (!userId) {
      setOnboardingLoading(false);
      return () => {
        isMounted = false;
      };
    }

    async function readOnboardingProgress() {
      setOnboardingLoading(true);
      setOnboardingError("");

      const { data, error } = await supabase
        .from("user_onboarding_progress")
        .select(ONBOARDING_PROGRESS_SELECT_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();

      if (!isMounted || activeSessionUserIdRef.current !== userId) {
        return;
      }

      setOnboardingLoading(false);

      if (error) {
        if (!isMissingOnboardingSchemaError(error)) {
          logSafeError(ERROR_OPERATION.ONBOARDING_LOAD, error);
        }
        return;
      }

      if (
        !canApplyOnboardingProgressResponse({
          activeUserId: activeSessionUserIdRef.current,
          progress: data,
          requestedUserId: userId,
        })
      ) {
        setOnboardingError("入村案内の進捗を確認できませんでした。画面を開き直してください。");
        return;
      }

      onboardingProgressRef.current = data;
      setOnboardingProgress(data);

      if (isOnboardingActive(data) && !["welcome_video", "mini_chia_intro"].includes(data.current_step)) {
        handleTabChange(getOnboardingResumeTab(data.current_step));
      }
    }

    readOnboardingProgress();

    return () => {
      isMounted = false;
    };
  }, [sessionUserId]);

  useEffect(() => {
    let isMounted = true;
    const postIds = postIdsKey ? postIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readResonances() {
      setResonanceError("");

      const { data, error } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id")
        .in("post_id", postIds);

      if (!isMounted) {
        return;
      }

      if (error) {
        setResonanceError(getUserFacingError(error, ERROR_OPERATION.RESONANCE_LOAD));
        return;
      }

      const countsByPost = new Map();

      for (const resonance of data ?? []) {
        countsByPost.set(resonance.post_id, (countsByPost.get(resonance.post_id) ?? 0) + 1);
      }

      setSavedPosts((currentPosts) =>
        currentPosts.map((post) => ({
          ...post,
          resonanceCount: countsByPost.get(post.id) ?? 0,
        })),
      );
    }

    readResonances();

    return () => {
      isMounted = false;
    };
  }, [postIdsKey]);

  useEffect(() => {
    let isMounted = true;
    const postIds = ownPostIdsKey ? ownPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readOwnPostResonances() {
      const { data, error } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id")
        .in("post_id", postIds);

      if (!isMounted || error) {
        return;
      }

      const countsByPost = new Map();

      for (const resonance of data ?? []) {
        countsByPost.set(resonance.post_id, (countsByPost.get(resonance.post_id) ?? 0) + 1);
      }

      setOwnPosts((currentPosts) =>
        currentPosts.map((post) => ({
          ...post,
          resonanceCount: countsByPost.get(post.id) ?? 0,
        })),
      );
    }

    readOwnPostResonances();

    return () => {
      isMounted = false;
    };
  }, [ownPostIdsKey]);

  useEffect(() => {
    let isMounted = true;
    const postIds = resonatedPostIdsKey ? resonatedPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readResonatedPostResonances() {
      const { data, error } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id")
        .in("post_id", postIds);

      if (!isMounted || error) {
        return;
      }

      const countsByPost = new Map();

      for (const resonance of data ?? []) {
        countsByPost.set(resonance.post_id, (countsByPost.get(resonance.post_id) ?? 0) + 1);
      }

      setResonatedPosts((currentPosts) =>
        currentPosts.map((post) => ({
          ...post,
          resonanceCount: countsByPost.get(post.id) ?? 0,
        })),
      );
    }

    readResonatedPostResonances();

    return () => {
      isMounted = false;
    };
  }, [resonatedPostIdsKey]);

  useEffect(() => {
    let isMounted = true;
    const postIds = archivedPostIdsKey ? archivedPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readArchivedPostResonances() {
      const { data, error } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id")
        .in("post_id", postIds);

      if (!isMounted || error) {
        return;
      }

      const countsByPost = new Map();

      for (const resonance of data ?? []) {
        countsByPost.set(resonance.post_id, (countsByPost.get(resonance.post_id) ?? 0) + 1);
      }

      setArchivedPosts((currentPosts) =>
        currentPosts.map((post) => ({
          ...post,
          resonanceCount: countsByPost.get(post.id) ?? 0,
        })),
      );
    }

    readArchivedPostResonances();

    return () => {
      isMounted = false;
    };
  }, [archivedPostIdsKey]);

  useEffect(() => {
    let isMounted = true;
    const postIds = publicProfilePostIdsKey ? publicProfilePostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readPublicProfilePostResonances() {
      const { data, error } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id")
        .in("post_id", postIds);

      if (!isMounted || error) {
        return;
      }

      const countsByPost = new Map();

      for (const resonance of data ?? []) {
        countsByPost.set(resonance.post_id, (countsByPost.get(resonance.post_id) ?? 0) + 1);
      }

      setPublicProfilePosts((currentPosts) =>
        currentPosts.map((post) => ({
          ...post,
          resonanceCount: countsByPost.get(post.id) ?? 0,
        })),
      );
    }

    readPublicProfilePostResonances();

    return () => {
      isMounted = false;
    };
  }, [publicProfilePostIdsKey]);

  useEffect(() => {
    let isMounted = true;
    const postIds = meteorTagPostIdsKey ? meteorTagPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readMeteorTagPostResonances() {
      const { data, error } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id")
        .in("post_id", postIds);

      if (!isMounted || error) {
        return;
      }

      const countsByPost = new Map();

      for (const resonance of data ?? []) {
        countsByPost.set(resonance.post_id, (countsByPost.get(resonance.post_id) ?? 0) + 1);
      }

      setMeteorTagPosts((currentPosts) =>
        currentPosts.map((post) => ({
          ...post,
          resonanceCount: countsByPost.get(post.id) ?? 0,
        })),
      );
    }

    readMeteorTagPostResonances();

    return () => {
      isMounted = false;
    };
  }, [meteorTagPostIdsKey]);

  useEffect(() => {
    let isMounted = true;

    if (!detailPost?.id) {
      return () => {
        isMounted = false;
      };
    }

    async function readDetailPostResonances() {
      const { count, error } = await supabase
        .from("resonances")
        .select("id", { count: "exact", head: true })
        .eq("post_id", detailPost.id);

      if (!isMounted || error) {
        return;
      }

      setDetailPost((currentPost) =>
        currentPost?.id === detailPost.id
          ? {
              ...currentPost,
              resonanceCount: count ?? 0,
            }
          : currentPost,
      );
    }

    readDetailPostResonances();

    return () => {
      isMounted = false;
    };
  }, [detailPost?.id]);

  useEffect(() => {
    let isMounted = true;
    const postIds = allPostIdsKey ? allPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readPostMedia() {
      const { mediaByPostId, error } = await readPostMediaForPostIds(postIds);

      if (!isMounted) {
        return;
      }

      if (error) {
        if (!isMissingPostMediaError(error)) {
          logSafeError(ERROR_OPERATION.MEDIA_LOAD, error);
        }
        return;
      }

      setSavedPosts((currentPosts) => attachMediaToPosts(currentPosts, mediaByPostId));
      setOwnPosts((currentPosts) => attachMediaToPosts(currentPosts, mediaByPostId));
      setResonatedPosts((currentPosts) => attachMediaToPosts(currentPosts, mediaByPostId));
      setArchivedPosts((currentPosts) => attachMediaToPosts(currentPosts, mediaByPostId));
      setPublicProfilePosts((currentPosts) => attachMediaToPosts(currentPosts, mediaByPostId));
      setDetailPost((currentPost) =>
        currentPost
          ? {
              ...currentPost,
              media: mediaByPostId.get(currentPost.id) ?? [],
            }
          : currentPost,
      );
    }

    readPostMedia();

    return () => {
      isMounted = false;
    };
  }, [allPostIdsKey]);

  useEffect(() => {
    let isMounted = true;
    const postIds = allPostIdsKey ? allPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    async function readMeteorTags() {
      const { tagsByPostId, error } = await readMeteorTagsForPostIds(postIds);

      if (!isMounted) {
        return;
      }

      if (error) {
        if (!isMissingMeteorTagsError(error)) {
          logSafeError(ERROR_OPERATION.METEOR_TAG_LOAD, error);
        }
        return;
      }

      setSavedPosts((currentPosts) => attachMeteorTagsToPosts(currentPosts, tagsByPostId));
      setOwnPosts((currentPosts) => attachMeteorTagsToPosts(currentPosts, tagsByPostId));
      setResonatedPosts((currentPosts) => attachMeteorTagsToPosts(currentPosts, tagsByPostId));
      setArchivedPosts((currentPosts) => attachMeteorTagsToPosts(currentPosts, tagsByPostId));
      setPublicProfilePosts((currentPosts) => attachMeteorTagsToPosts(currentPosts, tagsByPostId));
      setMeteorTagPosts((currentPosts) => attachMeteorTagsToPosts(currentPosts, tagsByPostId));
      setDetailPost((currentPost) =>
        currentPost
          ? {
              ...currentPost,
              tags: tagsByPostId.get(currentPost.id) ?? [],
            }
          : currentPost,
      );
    }

    readMeteorTags();

    return () => {
      isMounted = false;
    };
  }, [allPostIdsKey]);

  useEffect(() => {
    let isMounted = true;

    async function readProfileFrames() {
      setProfileFramesLoading(true);
      setProfileFramesError("");

      const { data: frameRows, error: frameError } = await supabase
        .from("profile_frames")
        .select(PROFILE_FRAME_SELECT_COLUMNS)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (frameError) {
        setProfileFrames([]);
        setOwnedProfileFrameIds([]);
        setProfileFramesLoading(false);

        if (isMissingProfileFrameSchemaError(frameError)) {
          setProfileFramesAvailable(false);
          return;
        }

        setProfileFramesAvailable(true);
        setProfileFramesError(getUserFacingError(frameError, ERROR_OPERATION.PROFILE_FRAME_LOAD));
        return;
      }

      const nextFrames = (frameRows ?? []).map(mapProfileFrame).filter(Boolean);
      setProfileFrames(nextFrames);
      setProfileFramesAvailable(true);

      const userId = session?.user?.id;

      if (!userId) {
        setOwnedProfileFrameIds([]);
        setProfileFramesLoading(false);
        return;
      }

      const { data: ownershipRows, error: ownershipError } = await supabase
        .from("profile_frame_ownerships")
        .select(PROFILE_FRAME_OWNERSHIP_SELECT_COLUMNS)
        .eq("profile_id", userId);

      if (!isMounted) {
        return;
      }

      setProfileFramesLoading(false);

      if (ownershipError) {
        if (isMissingProfileFrameSchemaError(ownershipError)) {
          setProfileFramesAvailable(false);
          setOwnedProfileFrameIds([]);
          return;
        }

        setProfileFramesError(getUserFacingError(ownershipError, ERROR_OPERATION.PROFILE_FRAME_LOAD));
        setOwnedProfileFrameIds([]);
        return;
      }

      setOwnedProfileFrameIds((ownershipRows ?? []).map((row) => row.frame_id).filter(Boolean));
    }

    readProfileFrames();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;

    if (!userId) {
      setProfile(null);
      setProfileForm(emptyProfileForm);
      setProfileLoading(false);
      setProfileSaving(false);
      setProfileMessage("");
      setProfileError("");
      setProfileScreenMode("view");
      return;
    }

    async function readProfile() {
      setProfileLoading(true);
      setProfileMessage("");
      setProfileError("");

      const { data, error, supportsProfileFrames } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).eq("id", userId).maybeSingle(),
        PROFILE_DETAIL_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_DETAIL_SELECT_COLUMNS,
      );

      if (!isMounted) {
        return;
      }

      setProfileLoading(false);

      if (error) {
        setProfileError(getUserFacingError(error, ERROR_OPERATION.PROFILE_LOAD));
        return;
      }

      if (supportsProfileFrames === false) {
        setProfileFramesAvailable(false);
      }

      let nextProfile = data
        ? {
            ...data,
            notify_authors_when_i_archive: true,
            notify_authors_when_i_resonate: true,
          }
        : data;

      if (data?.id) {
        const { data: archiveSettingsData, error: archiveSettingsError } = await supabase
          .from("profiles")
          .select("notify_authors_when_i_archive")
          .eq("id", userId)
          .maybeSingle();

        if (!isMounted) {
          return;
        }

        if (!archiveSettingsError && typeof archiveSettingsData?.notify_authors_when_i_archive === "boolean") {
          nextProfile = {
            ...nextProfile,
            notify_authors_when_i_archive: archiveSettingsData.notify_authors_when_i_archive,
          };
        }

        const { data: resonanceSettingsData, error: resonanceSettingsError } = await supabase
          .from("profiles")
          .select("notify_authors_when_i_resonate")
          .eq("id", userId)
          .maybeSingle();

        if (!isMounted) {
          return;
        }

        if (!resonanceSettingsError && typeof resonanceSettingsData?.notify_authors_when_i_resonate === "boolean") {
          nextProfile = {
            ...nextProfile,
            notify_authors_when_i_resonate: resonanceSettingsData.notify_authors_when_i_resonate,
          };
        }
      }

      setProfile(nextProfile);
      setProfileForm(
        nextProfile
          ? profileFormFromRecord(nextProfile)
          : { ...emptyProfileForm, display_name: defaultProfileView.display_name },
      );
    }

    readProfile();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let isMounted = true;

    async function readGuideAdminStatus() {
      const userId = session?.user?.id;

      if (!userId) {
        setGuideIsAdmin(false);
        setGuideAdminLoading(false);
        return;
      }

      setGuideAdminLoading(true);
      const { data, error } = await supabase.rpc("is_app_admin");

      if (!isMounted) {
        return;
      }

      setGuideAdminLoading(false);

      if (error) {
        setGuideIsAdmin(false);

        if (!isMissingVillageGuideSchemaError(error)) {
          logSafeError(ERROR_OPERATION.GUIDE_LOAD, error);
        }
        return;
      }

      setGuideIsAdmin(data === true);
    }

    readGuideAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let isMounted = true;

    if (!detailPostId) {
      setDetailPost(null);
      setDetailPostLoading(false);
      setDetailPostError("");
      return () => {
        isMounted = false;
      };
    }

    async function readDetailPost() {
      setDetailPostLoading(true);
      setDetailPostError("");

      const { data: post, error } = await runPostQuery((columns) =>
        applyVisiblePostTypeFilter(supabase.from("posts").select(columns).eq("id", detailPostId)).maybeSingle(),
      );

      if (!isMounted) {
        return;
      }

      if (error) {
        setDetailPostLoading(false);
        setDetailPostError("流星便の読み込みに失敗しました。");
        return;
      }

      if (!post) {
        setDetailPost(null);
        setDetailPostLoading(false);
        setDetailPostError("この流星便は見つかりませんでした。");
        return;
      }

      const { data: authorProfile, error: profileRowsError } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).eq("id", post.author_id).maybeSingle(),
        PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_BASIC_SELECT_COLUMNS,
      );

      if (!isMounted) {
        return;
      }

      const knownPost =
        detailPost?.id === post.id
          ? detailPost
          : [savedPosts, ownPosts, resonatedPosts, archivedPosts, publicProfilePosts, meteorTagPosts]
              .flat()
              .find((currentPost) => currentPost?.id === post.id);
      const basePost = {
        ...mapSavedPost(post, profileRowsError ? null : authorProfile, profileFrames),
        media: knownPost?.media ?? [],
        tags: knownPost?.tags ?? [],
      };
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets([basePost]);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setDetailPost(hydratedPosts[0] ?? basePost);
      setDetailPostLoading(false);
    }

    readDetailPost();

    return () => {
      isMounted = false;
    };
  }, [detailPostId, profileFrames]);

  useEffect(() => {
    let isMounted = true;

    if (!publicProfileUsername) {
      setPublicProfile(null);
      setPublicProfileTags([]);
      setPublicProfilePosts([]);
      setPublicProfileLoading(false);
      setPublicProfileError("");
      return () => {
        isMounted = false;
      };
    }

    async function readPublicProfile() {
      setPublicProfileLoading(true);
      setPublicProfileError("");
      setProfileShareMessage("");
      setProfileShareError("");

      const { data: profileRow, error: profileError } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).eq("username", publicProfileUsername).maybeSingle(),
        PROFILE_DETAIL_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_DETAIL_SELECT_COLUMNS,
      );

      if (!isMounted) {
        return;
      }

      if (profileError) {
        setPublicProfile(null);
        setPublicProfileTags([]);
        setPublicProfilePosts([]);
        setPublicProfileLoading(false);
        setPublicProfileError(getUserFacingError(profileError, ERROR_OPERATION.PROFILE_LOAD));
        return;
      }

      if (!profileRow) {
        setPublicProfile(null);
        setPublicProfileTags([]);
        setPublicProfilePosts([]);
        setPublicProfileLoading(false);
        setPublicProfileError("not-found");
        return;
      }

      const nextPublicProfile = {
        ...profileRow,
        activeFrame: getProfileFrameById(profileFrames, profileRow.active_frame_id),
      };

      const { data: tagRows } = await supabase
        .from("profile_tags")
        .select("id, label, kind, created_at")
        .eq("profile_id", profileRow.id)
        .order("created_at", { ascending: true });

      if (!isMounted) {
        return;
      }

      const { data: postRows, error: postsError } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = supabase
          .from("posts")
          .select(columns)
          .eq("author_id", profileRow.id)
          .eq("visibility", "public");

        query = applyVisiblePostTypeFilter(query);

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query.order("created_at", { ascending: false }).limit(30);
      });

      if (!isMounted) {
        return;
      }

      if (postsError) {
        setPublicProfile(nextPublicProfile);
        setPublicProfileTags(tagRows ?? []);
        setPublicProfilePosts([]);
        setPublicProfileLoading(false);
        setPublicProfileError(getUserFacingError(postsError, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const mappedPosts = (postRows ?? []).map((post) => mapSavedPost(post, profileRow, profileFrames));
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setPublicProfile(nextPublicProfile);
      setPublicProfileTags(tagRows ?? []);
      setPublicProfilePosts(hydratedPosts);
      setPublicProfileLoading(false);
    }

    readPublicProfile();

    return () => {
      isMounted = false;
    };
  }, [publicProfileUsername, profileFrames]);

  useEffect(() => {
    let isMounted = true;

    if (!meteorTagRouteName) {
      setMeteorTagView(null);
      setMeteorTagPosts([]);
      setMeteorTagLoading(false);
      setMeteorTagError("");
      return () => {
        isMounted = false;
      };
    }

    async function readMeteorTagPosts() {
      setMeteorTagLoading(true);
      setMeteorTagError("");

      const normalizedName = getMeteorTagSearchKey(meteorTagRouteName);

      if (!normalizedName) {
        setMeteorTagView(null);
        setMeteorTagPosts([]);
        setMeteorTagLoading(false);
        setMeteorTagError("流星タグが見つかりませんでした。");
        return;
      }

      const { data: tagRow, error: tagError } = await supabase
        .from("meteor_tags")
        .select(METEOR_TAG_SELECT_COLUMNS)
        .eq("normalized_name", normalizedName)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (tagError) {
        setMeteorTagView({ label: `#${meteorTagRouteName}`, name: meteorTagRouteName, normalizedName });
        setMeteorTagPosts([]);
        setMeteorTagLoading(false);
        setMeteorTagError(
          isMissingMeteorTagsError(tagError)
            ? "流星タグ機能の準備がまだ完了していません。"
            : getUserFacingError(tagError, ERROR_OPERATION.METEOR_TAG_LOAD),
        );
        return;
      }

      if (!tagRow) {
        setMeteorTagView({ label: `#${meteorTagRouteName}`, name: meteorTagRouteName, normalizedName });
        setMeteorTagPosts([]);
        setMeteorTagLoading(false);
        setMeteorTagError("");
        return;
      }

      const tag = mapMeteorTagRow(tagRow);
      setMeteorTagView(tag);

      const { data: relationRows, error: relationError } = await supabase
        .from("post_meteor_tags")
        .select("post_id, sort_order")
        .eq("tag_id", tagRow.id);

      if (!isMounted) {
        return;
      }

      if (relationError) {
        setMeteorTagPosts([]);
        setMeteorTagLoading(false);
        setMeteorTagError(getUserFacingError(relationError, ERROR_OPERATION.METEOR_TAG_LOAD));
        return;
      }

      const postIds = [...new Set((relationRows ?? []).map((row) => row.post_id).filter(Boolean))];

      if (postIds.length === 0) {
        setMeteorTagPosts([]);
        setMeteorTagLoading(false);
        setMeteorTagError("");
        return;
      }

      const { data: postRows, error: postsError } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = applyVisiblePostTypeFilter(
          supabase.from("posts").select(columns).in("id", postIds).eq("visibility", "public"),
        );

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query.order("created_at", { ascending: false });
      });

      if (!isMounted) {
        return;
      }

      if (postsError) {
        setMeteorTagPosts([]);
        setMeteorTagLoading(false);
        setMeteorTagError(getUserFacingError(postsError, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const authorIds = [...new Set((postRows ?? []).map((post) => post.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!isMounted) {
          return;
        }

        if (profileRowsError) {
          setMeteorTagPosts([]);
          setMeteorTagLoading(false);
          setMeteorTagError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      const mappedPosts = (postRows ?? []).map((post) => mapSavedPost(post, profilesById.get(post.author_id), profileFrames));
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setMeteorTagPosts(hydratedPosts);
      setMeteorTagLoading(false);
      setMeteorTagError("");
    }

    readMeteorTagPosts();

    return () => {
      isMounted = false;
    };
  }, [meteorTagRouteName, profileFrames]);

  useEffect(() => {
    let isMounted = true;
    const postIds = allPostIdsKey ? allPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      setStarLettersByPostId({});
      setStarLettersLoading(false);
      setStarLettersError("");
      return () => {
        isMounted = false;
      };
    }

    async function readStarLetters() {
      setStarLettersLoading(true);
      setStarLettersError("");

      const { data, error } = await runStarLetterQuery((columns) =>
        supabase
          .from("star_letters")
          .select(columns)
          .in("post_id", postIds)
          .order("created_at", { ascending: true }),
      );

      if (!isMounted) {
        return;
      }

      if (error) {
        setStarLettersLoading(false);
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_LOAD));
        return;
      }

      const authorIds = [...new Set((data ?? []).map((letter) => letter.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!isMounted) {
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      const nextLettersByPostId = {};

      for (const letter of data ?? []) {
        const mappedLetter = mapStarLetter(letter, profilesById.get(letter.author_id), profileFrames);
        nextLettersByPostId[letter.post_id] = [...(nextLettersByPostId[letter.post_id] ?? []), mappedLetter];
      }

      setStarLettersByPostId(nextLettersByPostId);
      setStarLettersLoading(false);
    }

    readStarLetters();

    return () => {
      isMounted = false;
    };
  }, [allPostIdsKey, profileFrames]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;

    if (!userId) {
      setOwnPosts([]);
      setOwnPostsLoading(false);
      setOwnPostsError("");
      return () => {
        isMounted = false;
      };
    }

    async function readOwnPosts() {
      setOwnPostsLoading(true);
      setOwnPostsError("");

      const { data, error } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).eq("author_id", userId));

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query.order("created_at", { ascending: false }).limit(30);
      });

      if (!isMounted) {
        return;
      }

      setOwnPostsLoading(false);

      if (error) {
        setOwnPostsError(getUserFacingError(error, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const mappedPosts = (data ?? []).map((post) => mapSavedPost(post, profile, profileFrames));
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setOwnPosts(hydratedPosts);
    }

    readOwnPosts();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, profile?.display_name, profile?.username, profile?.avatar_url, profile?.active_frame_id, profileFrames]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;

    if (!userId || activeTab !== "profile") {
      if (!userId) {
        setResonatedPosts([]);
        setResonatedPostsLoading(false);
        setResonatedPostsError("");
      }

      return () => {
        isMounted = false;
      };
    }

    async function readResonatedPosts() {
      setResonatedPostsLoading(true);
      setResonatedPostsError("");

      const { data: resonanceRows, error: resonanceRowsError } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id, resonance_type, created_at")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!isMounted) {
        return;
      }

      if (resonanceRowsError) {
        setResonatedPostsLoading(false);
        setResonatedPostsError(getUserFacingError(resonanceRowsError, ERROR_OPERATION.RESONANCE_LOAD));
        return;
      }

      const postIds = [...new Set((resonanceRows ?? []).map((row) => row.post_id).filter(Boolean))];

      if (postIds.length === 0) {
        setResonatedPosts([]);
        setResonatedPostsLoading(false);
        return;
      }

      const { data: postRows, error: postRowsError } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).in("id", postIds));

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query;
      });

      if (!isMounted) {
        return;
      }

      if (postRowsError) {
        setResonatedPostsLoading(false);
        setResonatedPostsError(getUserFacingError(postRowsError, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const authorIds = [...new Set((postRows ?? []).map((post) => post.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!isMounted) {
          return;
        }

        if (profileRowsError) {
          setResonatedPostsLoading(false);
          setResonatedPostsError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      const postsById = new Map((postRows ?? []).map((post) => [post.id, post]));
      const seenPostIds = new Set();
      const mappedPosts = (resonanceRows ?? [])
        .map((resonanceRow) => {
          const post = postsById.get(resonanceRow.post_id);

          if (!post || seenPostIds.has(post.id)) {
            return null;
          }

          seenPostIds.add(post.id);

          return {
            ...mapSavedPost(post, profilesById.get(post.author_id), profileFrames),
            resonanceId: resonanceRow.id,
            resonatedAt: resonanceRow.created_at,
          };
        })
        .filter(Boolean);
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setResonatedPosts(hydratedPosts);
      setResonatedPostsLoading(false);
    }

    readResonatedPosts();

    return () => {
      isMounted = false;
    };
  }, [activeTab, session?.user?.id, profileFrames]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;

    if (!userId || activeTab !== "profile") {
      if (!userId) {
        setSentStarLetters([]);
        setSentStarLettersLoading(false);
        setSentStarLettersError("");
      }

      return () => {
        isMounted = false;
      };
    }

    async function readSentStarLetters() {
      setSentStarLettersLoading(true);
      setSentStarLettersError("");

      const { data: letterRows, error: letterRowsError } = await runStarLetterQuery((columns) => {
        let query = supabase
          .from("star_letters")
          .select(columns)
          .eq("author_id", userId);

        if (columns.includes("deleted_at")) {
          query = query.is("deleted_at", null);
        }

        return query.order("created_at", { ascending: false }).limit(50);
      });

      if (!isMounted) {
        return;
      }

      if (letterRowsError) {
        setSentStarLettersLoading(false);
        setSentStarLettersError(getUserFacingError(letterRowsError, ERROR_OPERATION.STAR_LETTER_LOAD));
        return;
      }

      const postIds = [...new Set((letterRows ?? []).map((letter) => letter.post_id).filter(Boolean))];
      const postsById = new Map();
      const profilesById = new Map();

      if (postIds.length > 0) {
        const { data: postRows, error: postRowsError } = await runPostQuery((columns, supportsSoftDelete) => {
          let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).in("id", postIds));

          if (supportsSoftDelete) {
            query = query.is("deleted_at", null);
          }

          return query;
        });

        if (!isMounted) {
          return;
        }

        if (postRowsError) {
          setSentStarLettersLoading(false);
          setSentStarLettersError(getUserFacingError(postRowsError, ERROR_OPERATION.POST_LOAD));
          return;
        }

        for (const postRow of postRows ?? []) {
          postsById.set(postRow.id, postRow);
        }

        const sourceAuthorIds = [...new Set((postRows ?? []).map((post) => post.author_id).filter(Boolean))];

        if (sourceAuthorIds.length > 0) {
          const { data: profileRows, error: profileRowsError } = await runProfileQuery(
            (columns) => supabase.from("profiles").select(columns).in("id", sourceAuthorIds),
            PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
            PROFILE_BASIC_SELECT_COLUMNS,
          );

          if (!isMounted) {
            return;
          }

          if (profileRowsError) {
            setSentStarLettersLoading(false);
            setSentStarLettersError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
            return;
          }

          for (const profileRow of profileRows ?? []) {
            profilesById.set(profileRow.id, profileRow);
          }
        }
      }

      setSentStarLetters(
        (letterRows ?? []).map((letter) => {
          const sourcePostRow = postsById.get(letter.post_id);
          const sourcePost = sourcePostRow
            ? mapSavedPost(sourcePostRow, profilesById.get(sourcePostRow.author_id), profileFrames)
            : null;

          return {
            ...mapStarLetter(letter, profile, profileFrames),
            sourcePost,
          };
        }),
      );
      setSentStarLettersLoading(false);
    }

    readSentStarLetters();

    return () => {
      isMounted = false;
    };
  }, [
    activeTab,
    session?.user?.id,
    profile?.display_name,
    profile?.username,
    profile?.avatar_url,
    profile?.active_frame_id,
    profileFrames,
  ]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;

    if (!userId) {
      setArchivedPosts([]);
      setArchivesLoading(false);
      setArchivesError("");
      setArchivesMessage("");
      setArchiveSavingPostId(null);
      return () => {
        isMounted = false;
      };
    }

    async function readArchivedPosts() {
      setArchivesLoading(true);
      setArchivesError("");

      const { data: archiveRows, error: archiveError } = await supabase
        .from("archives")
        .select("id, profile_id, post_id, created_at")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (archiveError) {
        setArchivesLoading(false);
        setArchivesError(getUserFacingError(archiveError, ERROR_OPERATION.ARCHIVE_LOAD));
        return;
      }

      const postIds = (archiveRows ?? []).map((archive) => archive.post_id).filter(Boolean);

      if (postIds.length === 0) {
        setArchivedPosts([]);
        setArchivesLoading(false);
        return;
      }

      const { data: postRows, error: postsError } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).in("id", postIds));

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query;
      });

      if (!isMounted) {
        return;
      }

      if (postsError) {
        setArchivesLoading(false);
        setArchivesError(getUserFacingError(postsError, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const authorIds = [...new Set((postRows ?? []).map((post) => post.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!isMounted) {
          return;
        }

        if (profileRowsError) {
          setArchivesLoading(false);
          setArchivesError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      if (!isMounted) {
        return;
      }

      const postsById = new Map((postRows ?? []).map((post) => [post.id, post]));
      const mappedArchives = (archiveRows ?? [])
        .map((archive) => {
          const post = postsById.get(archive.post_id);
          return post ? mapArchivedPost(archive, post, profilesById.get(post.author_id), profileFrames) : null;
        })
        .filter(Boolean);
      const { posts: hydratedArchives, error: assetsError } = await hydratePostsWithAssets(mappedArchives);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setArchivedPosts(hydratedArchives);
      setArchivesLoading(false);
    }

    readArchivedPosts();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, profileFrames]);

  useEffect(() => {
    if (activeTab !== "archive") {
      return;
    }

    void refreshArchivedStarLetters();
  }, [activeTab, session?.user?.id, profileFrames]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;

    if (!userId) {
      setNotifications([]);
      setNotificationsLoading(false);
      setNotificationsError("");
      setNotificationsMessage("");
      setNotificationUpdatingId(null);
      return () => {
        isMounted = false;
      };
    }

    async function readNotifications() {
      setNotificationsLoading(true);
      setNotificationsError("");
      setNotificationsMessage("");

      const { data, error } = await supabase
        .from("notifications")
        .select("id, recipient_id, actor_id, post_id, star_letter_id, type, message, is_read, created_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      setNotificationsLoading(false);

      if (error) {
        setNotificationsError(getUserFacingError(error, ERROR_OPERATION.NOTIFICATION_LOAD));
        return;
      }

      const actorIds = [...new Set((data ?? []).map((notification) => notification.actor_id).filter(Boolean))];
      const profilesById = new Map();

      if (actorIds.length > 0) {
        const { data: profileRows } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", actorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!isMounted) {
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      setNotifications(
        (data ?? []).map((notification) => ({
          ...notification,
          actorProfile: profilesById.get(notification.actor_id) ?? null,
          actorFrame: getProfileFrameById(profileFrames, profilesById.get(notification.actor_id)?.active_frame_id),
        })),
      );
    }

    readNotifications();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, profileFrames]);

  useEffect(() => {
    let isMounted = true;

    async function readPublicPosts() {
      setPostsLoading(true);
      setPostsError("");

      const { data, error } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).eq("visibility", "public"));

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query.order("created_at", { ascending: false }).limit(20);
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        setPostsLoading(false);
        setPostsError(getUserFacingError(error, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const authorIds = [...new Set((data ?? []).map((post) => post.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!isMounted) {
          return;
        }

        if (profileRowsError) {
          setPostsLoading(false);
          setPostsError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      if (!isMounted) {
        return;
      }

      const mappedPosts = (data ?? []).map((post) => mapSavedPost(post, profilesById.get(post.author_id), profileFrames));
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setSavedPosts(hydratedPosts);
      setPostsLoading(false);
    }

    readPublicPosts();

    return () => {
      isMounted = false;
    };
  }, [profileFrames]);

  useEffect(() => {
    let isMounted = true;
    const targetPostId = sessionOnboardingProgress?.target_post_id;
    const needsTarget = [
      "observe_intro",
      "archive_prompt",
      "archive_check",
      "archive_success",
    ].includes(sessionOnboardingProgress?.current_step);

    if (!isOnboardingActive(sessionOnboardingProgress) || !needsTarget) {
      return () => {
        isMounted = false;
      };
    }

    if (!targetPostId) {
      void advanceInitialOnboarding("ensure_target");
      return () => {
        isMounted = false;
      };
    }

    if ([...savedPosts, ...archivedPosts].some((post) => post.id === targetPostId)) {
      return () => {
        isMounted = false;
      };
    }

    async function readOnboardingTargetPost() {
      const { data: post, error } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = applyVisiblePostTypeFilter(
          supabase.from("posts").select(columns).eq("id", targetPostId).eq("visibility", "public"),
        );

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query.maybeSingle();
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        logSafeError(ERROR_OPERATION.POST_LOAD, error);
        setOnboardingError("案内に使う流星便を読み込めませんでした。もう一度お試しください。");
        return;
      }

      if (!post) {
        void advanceInitialOnboarding("ensure_target");
        return;
      }

      const { data: authorProfile } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).eq("id", post.author_id).maybeSingle(),
        PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_BASIC_SELECT_COLUMNS,
      );

      if (!isMounted) {
        return;
      }

      const basePost = mapSavedPost(post, authorProfile, profileFrames);
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets([basePost]);

      if (!isMounted) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      const targetPost = hydratedPosts[0] ?? basePost;
      setSavedPosts((currentPosts) => [
        targetPost,
        ...currentPosts.filter((currentPost) => currentPost.id !== targetPost.id),
      ]);
    }

    readOnboardingTargetPost();

    return () => {
      isMounted = false;
    };
  }, [
    sessionOnboardingProgress?.current_step,
    sessionOnboardingProgress?.target_post_id,
    profileFrames,
  ]);

  useEffect(() => {
    if (
      sessionOnboardingProgress?.current_step === "profile_setup" &&
      sessionOnboardingProfile?.display_name?.trim() &&
      sessionOnboardingProfile?.avatar_url?.trim()
    ) {
      void advanceInitialOnboarding("profile_saved");
    }
  }, [
    sessionOnboardingProfile?.avatar_url,
    sessionOnboardingProfile?.display_name,
    sessionOnboardingProgress?.current_step,
  ]);

  useEffect(() => {
    const targetPostId = sessionOnboardingProgress?.target_post_id;

    if (
      sessionOnboardingProgress?.current_step === "archive_prompt" &&
      targetPostId &&
      archivedPosts.some((post) => post.id === targetPostId)
    ) {
      void advanceInitialOnboarding("archive_saved", { targetId: targetPostId });
    }
  }, [
    archivedPostIdsKey,
    sessionOnboardingProgress?.current_step,
    sessionOnboardingProgress?.target_post_id,
  ]);

  useEffect(() => {
    const targetPostId = sessionOnboardingProgress?.target_post_id;

    if (
      sessionOnboardingProgress?.current_step === "archive_check" &&
      activeTab === "archive" &&
      targetPostId &&
      archivedPosts.some((post) => post.id === targetPostId)
    ) {
      void advanceInitialOnboarding("archive_confirmed", { targetId: targetPostId });
    }
  }, [
    activeTab,
    archivedPostIdsKey,
    sessionOnboardingProgress?.current_step,
    sessionOnboardingProgress?.target_post_id,
  ]);

  useEffect(() => {
    const postSteps = [
      "post_intro_1",
      "post_intro_2",
      "post_intro_3",
      "post_intro_4",
      "first_post",
    ];

    if (
      postSteps.includes(sessionOnboardingProgress?.current_step) &&
      !ownPostsLoading &&
      ownPosts.length > 0 &&
      !onboardingPostCompletionRef.current
    ) {
      void advanceInitialOnboarding("existing_post_detected");
    }
  }, [sessionOnboardingProgress?.current_step, ownPostIdsKey, ownPostsLoading]);

  function hasCurrentLegalConsentMetadata(user) {
    const metadata = user?.user_metadata ?? {};

    return (
      metadata.legal_terms_version === LEGAL_TERMS_VERSION &&
      metadata.legal_privacy_version === LEGAL_PRIVACY_VERSION &&
      metadata.legal_age_confirmed === true
    );
  }

  function requiresCurrentLegalConsentMetadata(user) {
    const createdAtMs = Date.parse(user?.created_at ?? "");

    return !Number.isFinite(createdAtMs) || createdAtMs >= LEGAL_CONSENT_REQUIRED_AFTER_MS;
  }

  async function recordLegalConsentForSession(sessionToRecord) {
    if (!sessionToRecord?.user?.id) {
      return null;
    }

    if (!hasCurrentLegalConsentMetadata(sessionToRecord.user)) {
      return requiresCurrentLegalConsentMetadata(sessionToRecord.user)
        ? new Error("legal_consent_metadata_missing")
        : null;
    }

    const { data, error } = await supabase.rpc("record_legal_consent", {
      p_age_confirmed: true,
      p_privacy_version: LEGAL_PRIVACY_VERSION,
      p_terms_version: LEGAL_TERMS_VERSION,
    });

    if (error) {
      return error;
    }

    if (data?.outcome !== "recorded") {
      return new Error("legal_consent_not_recorded");
    }

    return null;
  }

  async function handleSignUp(email, password, legalConsent = {}) {
    if (!legalConsent.acceptedLegal || !legalConsent.confirmedAge) {
      setAuthMessage("");
      setAuthError("会員登録には、利用規約・プライバシーポリシーへの同意と18歳以上であることの確認が必要です。");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          legal_age_confirmed: true,
          legal_privacy_version: LEGAL_PRIVACY_VERSION,
          legal_terms_version: LEGAL_TERMS_VERSION,
        },
      },
    });

    if (error) {
      setAuthLoading(false);
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SIGN_UP));
      return;
    }

    if (data.session?.user?.id) {
      const consentError = await recordLegalConsentForSession(data.session);

      if (consentError) {
        await supabase.auth.signOut();
        setAuthLoading(false);
        setSession(null);
        setAuthStatus("未ログイン");
        setAuthError("会員登録は完了しましたが、同意記録の保存に失敗しました。利用開始前にもう一度ログインして同意を記録してください。");
        return;
      }
    }

    setAuthLoading(false);
    setSession(data.session);
    setAuthStatus(data.session ? "ログイン中" : "未ログイン");
    setAuthMessage(
      data.session
        ? "会員登録してログインしました。"
        : "確認メールを送信しました。メールを確認してからログインしてください。同意記録はサーバー側で保存されます。",
    );
  }

  async function handleLogin(email, password) {
    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setAuthLoading(false);

    if (error) {
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SIGN_IN));
      return;
    }

    const consentError = await recordLegalConsentForSession(data.session);

    if (consentError) {
      await supabase.auth.signOut();
      setAuthLoading(false);
      setSession(null);
      setAuthStatus("未ログイン");
      setAuthError("同意記録の保存に失敗しました。時間をおいてもう一度ログインしてください。");
      return;
    }

    setSession(data.session);
    setAuthStatus("ログイン中");
    setAuthMessage("ログインしました。");
  }

  async function handleLogout() {
    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");

    const { error } = await supabase.auth.signOut();

    setAuthLoading(false);

    if (error) {
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SIGN_OUT));
      return;
    }

    setSession(null);
    setAuthStatus("未ログイン");
    setAuthMessage("ログアウトしました。");
  }

  function handleProfileFieldChange(field, value) {
    setProfileForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetAvatarCrop() {
    setAvatarCropZoom(AVATAR_CROP_MIN_ZOOM);
    setAvatarCropOffset({ x: 0, y: 0 });
    setAvatarImageSize(null);
  }

  function clearAvatarCropDraft() {
    setAvatarCropFile(null);
    setAvatarCropPreviewUrl("");
    setAvatarCropModalOpen(false);
    setAvatarCropPreparing(false);
    resetAvatarCrop();
  }

  function clearSelectedAvatar() {
    setAvatarFile(null);
    setAvatarCroppedBlob(null);
    setAvatarPreviewUrl("");
    clearAvatarCropDraft();
    resetAvatarCrop();
  }

  function handleOpenAvatarModal(avatarUrl, label = "星影") {
    if (!avatarUrl) {
      return;
    }

    setAvatarModal({
      label,
      url: avatarUrl,
    });
  }

  function handleCloseAvatarModal() {
    setAvatarModal(null);
  }

  function handleProfileAvatarFileChange(event) {
    const file = event.target.files?.[0];

    setProfileMessage("");
    setProfileError("");
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!AVATAR_ALLOWED_TYPES[file.type]) {
      clearAvatarCropDraft();
      setProfileError("jpg / jpeg / png / webp の画像を選んでください。");
      return;
    }

    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      clearAvatarCropDraft();
      setProfileError("画像は5MBまで選べます。");
      return;
    }

    setAvatarCropFile(file);
    setAvatarCropPreviewUrl(URL.createObjectURL(file));
    resetAvatarCrop();
    setAvatarCropModalOpen(true);
  }

  function handleAvatarCropImageLoad(imageSize) {
    setAvatarImageSize(imageSize);
    setAvatarCropOffset((currentOffset) => {
      const nextOffset = constrainAvatarCropOffset(currentOffset, avatarCropZoom, imageSize, avatarCropFrameSize);
      return isSameAvatarCropOffset(currentOffset, nextOffset) ? currentOffset : nextOffset;
    });
  }

  function handleAvatarCropFrameSizeChange(nextFrameSize) {
    setAvatarCropFrameSize((currentFrameSize) => (currentFrameSize === nextFrameSize ? currentFrameSize : nextFrameSize));
    setAvatarCropOffset((currentOffset) => {
      const nextOffset = constrainAvatarCropOffset(currentOffset, avatarCropZoom, avatarImageSize, nextFrameSize);
      return isSameAvatarCropOffset(currentOffset, nextOffset) ? currentOffset : nextOffset;
    });
  }

  function handleAvatarCropOffsetChange(nextOffset) {
    setAvatarCropOffset((currentOffset) => {
      const safeOffset = constrainAvatarCropOffset(nextOffset, avatarCropZoom, avatarImageSize, avatarCropFrameSize);
      return isSameAvatarCropOffset(currentOffset, safeOffset) ? currentOffset : safeOffset;
    });
  }

  function handleAvatarCropZoomChange(nextZoom) {
    const safeZoom = clampNumber(Number(nextZoom) || AVATAR_CROP_MIN_ZOOM, AVATAR_CROP_MIN_ZOOM, AVATAR_CROP_MAX_ZOOM);
    setAvatarCropZoom(safeZoom);
    setAvatarCropOffset((currentOffset) => {
      const nextOffset = constrainAvatarCropOffset(currentOffset, safeZoom, avatarImageSize, avatarCropFrameSize);
      return isSameAvatarCropOffset(currentOffset, nextOffset) ? currentOffset : nextOffset;
    });
  }

  function handleAvatarCropReset() {
    setAvatarCropZoom(AVATAR_CROP_MIN_ZOOM);
    setAvatarCropOffset({ x: 0, y: 0 });
  }

  function handleCancelAvatarCrop() {
    clearAvatarCropDraft();
  }

  async function handleUseCroppedAvatar() {
    if (!avatarCropFile) {
      return;
    }

    setAvatarCropPreparing(true);
    setProfileMessage("");
    setProfileError("");

    try {
      const croppedAvatarBlob = await createCroppedAvatarBlob({
        file: avatarCropFile,
        frameSize: avatarCropFrameSize,
        offset: avatarCropOffset,
        zoom: avatarCropZoom,
      });
      const croppedPreviewUrl = URL.createObjectURL(croppedAvatarBlob);

      setAvatarFile(avatarCropFile);
      setAvatarCroppedBlob(croppedAvatarBlob);
      setAvatarPreviewUrl(croppedPreviewUrl);
      setProfileMessage("この星影を選びました。保存するとプロフィールに反映されます。");
      clearAvatarCropDraft();
    } catch (cropError) {
      setProfileError(getUserFacingError(cropError, ERROR_OPERATION.PROFILE_SAVE));
      setAvatarCropPreparing(false);
    }
  }

  function handleStartProfileEdit() {
    clearSelectedAvatar();
    setProfileForm(
      profile ? profileFormFromRecord(profile) : { ...emptyProfileForm, display_name: defaultProfileView.display_name },
    );
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("edit");
  }

  function handleCancelProfileEdit() {
    clearSelectedAvatar();
    setProfileForm(
      profile ? profileFormFromRecord(profile) : { ...emptyProfileForm, display_name: defaultProfileView.display_name },
    );
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("view");
  }

  function handleOpenProfileSettings() {
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("settings");
  }

  function handleOpenFeedback() {
    setFeedbackMessage("");
    setFeedbackError("");
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("feedback");
  }

  function handleOpenGuide() {
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("guide");
  }

  function handleOpenGuideAdmin() {
    if (!guideIsAdmin) {
      return;
    }

    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("guide-admin");
  }

  function handleBackToProfile() {
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("view");
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();

    if (!session?.user?.id) {
      setProfileError("プロフィール保存にはログインが必要です。");
      return;
    }

    const displayName = profileForm.display_name.trim();

    if (!displayName) {
      setProfileError("表示名を入力してください。");
      return;
    }

    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");

    let nextAvatarUrl = optionalText(profileForm.avatar_url);

    if (avatarFile) {
      if (!AVATAR_ALLOWED_TYPES[avatarFile.type]) {
        setProfileSaving(false);
        setProfileError("jpg / jpeg / png / webp の画像を選んでください。");
        return;
      }

      if (avatarFile.size > AVATAR_MAX_SIZE_BYTES) {
        setProfileSaving(false);
        setProfileError("画像は5MBまで選べます。");
        return;
      }

      setAvatarUploading(true);

      let nextCroppedAvatarBlob = avatarCroppedBlob;

      if (!nextCroppedAvatarBlob) {
        try {
          nextCroppedAvatarBlob = await createCroppedAvatarBlob({
            file: avatarFile,
            frameSize: avatarCropFrameSize,
            offset: avatarCropOffset,
            zoom: avatarCropZoom,
          });
        } catch (cropError) {
          setAvatarUploading(false);
          setProfileSaving(false);
          setProfileError(getUserFacingError(cropError, ERROR_OPERATION.PROFILE_SAVE));
          return;
        }
      }

      const filePath = `${session.user.id}/avatar-cropped-${Date.now()}.${AVATAR_CROP_OUTPUT_EXTENSION}`;
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, nextCroppedAvatarBlob, {
        cacheControl: "3600",
        contentType: AVATAR_CROP_OUTPUT_TYPE,
        upsert: false,
      });

      setAvatarUploading(false);

      if (uploadError) {
        setProfileSaving(false);
        setProfileError(getUserFacingError(uploadError, ERROR_OPERATION.STORAGE_UPLOAD));
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      nextAvatarUrl = publicUrlData.publicUrl;
    }

    const profilePayload = {
      id: session.user.id,
      display_name: displayName,
      username: optionalUsername(profileForm.username),
      avatar_url: nextAvatarUrl,
      bio: optionalText(profileForm.bio),
      constellation_note: optionalText(profileForm.constellation_note),
    };

    if (profileFramesAvailable) {
      profilePayload.active_frame_id = profileForm.active_frame_id || null;
    }

    let { data, error } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select(profileFramesAvailable ? PROFILE_DETAIL_SELECT_COLUMNS_WITH_FRAME : PROFILE_DETAIL_SELECT_COLUMNS)
      .single();

    if (error && isMissingProfileFrameSchemaError(error) && profileFramesAvailable) {
      const fallbackProfilePayload = { ...profilePayload };
      delete fallbackProfilePayload.active_frame_id;
      const fallbackResult = await supabase
        .from("profiles")
        .upsert(fallbackProfilePayload, { onConflict: "id" })
        .select(PROFILE_DETAIL_SELECT_COLUMNS)
        .single();

      data = fallbackResult.data;
      error = fallbackResult.error;
      setProfileFramesAvailable(false);
    }

    setProfileSaving(false);

    if (error) {
      setProfileError(
        isUnownedProfileFrameError(error)
          ? "所持していないアイコンフレームは装着できません。"
          : getUserFacingError(error, ERROR_OPERATION.PROFILE_SAVE),
      );
      return;
    }

    const nextProfile = {
      ...data,
      notify_authors_when_i_archive: profileForm.notify_authors_when_i_archive ?? true,
      notify_authors_when_i_resonate: profileForm.notify_authors_when_i_resonate ?? true,
    };

    setProfile(nextProfile);
    setProfileForm(profileFormFromRecord(nextProfile));
    clearSelectedAvatar();
    setSavedPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile, profileFrames)));
    setOwnPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile, profileFrames)));
    setResonatedPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile, profileFrames)));
    setSentStarLetters((currentLetters) =>
      currentLetters.map((letter) => ({
        ...applyAuthorProfileToStarLetter(letter, nextProfile, profileFrames),
        sourcePost: applyAuthorProfileToPost(letter.sourcePost, nextProfile, profileFrames),
      })),
    );
    setArchivedPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile, profileFrames)));
    setPublicProfilePosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile, profileFrames)));
    setMeteorTagPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile, profileFrames)));
    setDetailPost((currentPost) => applyAuthorProfileToPost(currentPost, nextProfile, profileFrames));
    setStarLettersByPostId((currentLettersByPostId) =>
      Object.fromEntries(
        Object.entries(currentLettersByPostId).map(([postId, letters]) => [
          postId,
          letters.map((letter) => applyAuthorProfileToStarLetter(letter, nextProfile, profileFrames)),
        ]),
      ),
    );
    setProfileMessage(avatarFile ? "星影を更新しました。" : "プロフィールを保存しました。");
    setProfileScreenMode("view");
  }

  async function saveProfileNotificationSetting(field, nextSetting, label) {
    if (!session?.user?.id) {
      setProfileError("設定保存にはログインが必要です。");
      return;
    }

    if (!profile?.id) {
      setProfileError("先にプロフィールを保存してください。");
      return;
    }

    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");

    const { data, error } = await supabase
      .from("profiles")
      .update({ [field]: nextSetting })
      .eq("id", session.user.id)
      .select(`id, ${field}`)
      .maybeSingle();

    setProfileSaving(false);

    if (error) {
      setProfileForm((currentForm) => ({
        ...currentForm,
        [field]: profile?.[field] ?? true,
      }));
      setProfileError(`${label}設定の保存に失敗しました。時間をおいてもう一度お試しください。`);
      return;
    }

    const savedSetting = data?.[field] ?? nextSetting;

    setProfile((currentProfile) =>
      currentProfile
        ? {
            ...currentProfile,
            [field]: savedSetting,
          }
        : currentProfile,
    );
    setProfileForm((currentForm) => ({
      ...currentForm,
      [field]: savedSetting,
    }));
    setProfileMessage(`${label}設定を保存しました。`);
  }

  async function handleArchiveNotificationSettingSubmit(event) {
    event.preventDefault();
    await saveProfileNotificationSetting(
      "notify_authors_when_i_archive",
      Boolean(profileForm.notify_authors_when_i_archive),
      "Archive通知",
    );
  }

  async function handleResonanceNotificationSettingSubmit(event) {
    event.preventDefault();
    await saveProfileNotificationSetting(
      "notify_authors_when_i_resonate",
      Boolean(profileForm.notify_authors_when_i_resonate),
      "共鳴通知",
    );
  }

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    setFeedbackMessage("");
    setFeedbackError("");

    if (!session?.user?.id) {
      setFeedbackError("ログインするとフィードバックを送れます。");
      return;
    }

    const body = feedbackBody.trim();

    if (!body) {
      setFeedbackError("内容を入力してください。");
      return;
    }

    if (getTrimmedCharacterLength(body) > FEEDBACK_MAX_LENGTH) {
      setFeedbackError("フィードバックは1000文字以内で送ってください。");
      return;
    }

    setFeedbackSaving(true);

    const { error } = await supabase.from("feedbacks").insert({
      user_id: session.user.id,
      type: feedbackType,
      body,
      status: "new",
    });

    setFeedbackSaving(false);

    if (error) {
      setFeedbackError(getUserFacingError(error, ERROR_OPERATION.FEEDBACK_SAVE));
      return;
    }

    setFeedbackBody("");
    setFeedbackMessage("フィードバックを送信しました。ありがとうございます。");
  }

  function clearPostImageDrafts() {
    setPostImageDrafts((currentDrafts) => {
      for (const draft of currentDrafts) {
        revokePostImageDraft(draft);
      }

      return [];
    });
  }

  function clearPostVideoDraft() {
    setPostVideoDraft((currentDraft) => {
      revokePostVideoDraft(currentDraft);
      return null;
    });
  }

  function clearPostThumbnailDraft() {
    setPostThumbnailDraft((currentDraft) => {
      revokePostThumbnailDraft(currentDraft);
      return null;
    });
  }

  function resetPostCoverCrop() {
    setPostCoverCropZoom(AVATAR_CROP_MIN_ZOOM);
    setPostCoverCropOffset({ x: 0, y: 0 });
    setPostCoverImageSize(null);
  }

  function clearPostCoverCropDraft() {
    setPostCoverCropFile(null);
    setPostCoverCropPreviewUrl("");
    setPostCoverCropModalOpen(false);
    setPostCoverCropPreparing(false);
    resetPostCoverCrop();
  }

  function openPostCoverCrop(file) {
    setPostCoverCropFile(file);
    setPostCoverCropPreviewUrl(URL.createObjectURL(file));
    resetPostCoverCrop();
    setPostCoverCropModalOpen(true);
  }

  function clearPostVideoTrimDraft() {
    setPostVideoTrimDraft(null);
    setPostVideoTrimStart(0);
    setPostVideoTrimLength(METEOR_VIDEO_MAX_DURATION_SECONDS);
    setPostVideoTrimProgress(0);
    setPostVideoTrimProcessing(false);
    setPostVideoTrimError("");
    postVideoTrimConversionRef.current = null;
    postVideoTrimCancelRequestedRef.current = false;
  }

  async function prepareAutomaticVideoCoverDraft(file, durationSeconds) {
    try {
      const generatedCoverDraft = await createVideoCoverFile(file, durationSeconds);

      setPostThumbnailDraft((currentDraft) => {
        revokePostThumbnailDraft(currentDraft);
        return generatedCoverDraft;
      });
    } catch (thumbnailError) {
      logSafeError(ERROR_OPERATION.VIDEO_THUMBNAIL, thumbnailError);
    }
  }

  async function applySelectedPostVideo(file, metadata) {
    setPostVideoDraft((currentDraft) => {
      revokePostVideoDraft(currentDraft);
      return createPostVideoDraft(file, metadata);
    });
    clearPostThumbnailDraft();
    await prepareAutomaticVideoCoverDraft(file, metadata.durationSeconds);
  }

  function openPostVideoTrimDraft(file, metadata) {
    const initialLengthSeconds = Math.min(
      METEOR_VIDEO_MAX_DURATION_SECONDS,
      Math.max(0.5, Number(metadata.durationSeconds) || METEOR_VIDEO_MAX_DURATION_SECONDS),
    );

    setPostVideoTrimDraft((currentDraft) => {
      if (currentDraft?.previewUrl) {
        URL.revokeObjectURL(currentDraft.previewUrl);
      }

      return {
        durationSeconds: metadata.durationSeconds,
        file,
        name: getSafeDisplayFileName(file.name, "選択した星映"),
        previewUrl: URL.createObjectURL(file),
      };
    });
    setPostVideoTrimStart(0);
    setPostVideoTrimLength(initialLengthSeconds);
    setPostVideoTrimProgress(0);
    setPostVideoTrimProcessing(false);
    setPostVideoTrimError("");
    postVideoTrimConversionRef.current = null;
    postVideoTrimCancelRequestedRef.current = false;
  }

  function handlePostCoverCropImageLoad(imageSize) {
    setPostCoverImageSize(imageSize);
    setPostCoverCropOffset((currentOffset) => {
      const nextOffset = constrainPostCoverCropOffset(currentOffset, postCoverCropZoom, imageSize, postCoverCropFrameSize);
      return isSamePostCoverCropOffset(currentOffset, nextOffset) ? currentOffset : nextOffset;
    });
  }

  function handlePostCoverCropFrameSizeChange(nextFrameSize) {
    setPostCoverCropFrameSize((currentFrameSize) =>
      currentFrameSize.width === nextFrameSize.width && currentFrameSize.height === nextFrameSize.height
        ? currentFrameSize
        : nextFrameSize,
    );
    setPostCoverCropOffset((currentOffset) => {
      const nextOffset = constrainPostCoverCropOffset(currentOffset, postCoverCropZoom, postCoverImageSize, nextFrameSize);
      return isSamePostCoverCropOffset(currentOffset, nextOffset) ? currentOffset : nextOffset;
    });
  }

  function handlePostCoverCropOffsetChange(nextOffset) {
    setPostCoverCropOffset((currentOffset) => {
      const safeOffset = constrainPostCoverCropOffset(nextOffset, postCoverCropZoom, postCoverImageSize, postCoverCropFrameSize);
      return isSamePostCoverCropOffset(currentOffset, safeOffset) ? currentOffset : safeOffset;
    });
  }

  function handlePostCoverCropZoomChange(nextZoom) {
    const safeZoom = clampNumber(Number(nextZoom) || AVATAR_CROP_MIN_ZOOM, AVATAR_CROP_MIN_ZOOM, AVATAR_CROP_MAX_ZOOM);
    setPostCoverCropZoom(safeZoom);
    setPostCoverCropOffset((currentOffset) => {
      const nextOffset = constrainPostCoverCropOffset(currentOffset, safeZoom, postCoverImageSize, postCoverCropFrameSize);
      return isSamePostCoverCropOffset(currentOffset, nextOffset) ? currentOffset : nextOffset;
    });
  }

  function handlePostCoverCropReset() {
    setPostCoverCropZoom(AVATAR_CROP_MIN_ZOOM);
    setPostCoverCropOffset({ x: 0, y: 0 });
  }

  function handleCancelPostCoverCrop() {
    if (postCoverCropPreparing) {
      return;
    }

    clearPostCoverCropDraft();
  }

  async function handleUsePostCoverCrop() {
    if (!postCoverCropFile) {
      return;
    }

    setPostCoverCropPreparing(true);
    setPostMessage("");
    setPostError("");

    try {
      const coverBlob = await createCroppedPostCoverBlob({
        file: postCoverCropFile,
        frameSize: postCoverCropFrameSize,
        offset: postCoverCropOffset,
        zoom: postCoverCropZoom,
      });
      const coverFile = createFileFromBlob(
        coverBlob,
        createVideoCoverFileName(postCoverCropFile.name),
        METEOR_VIDEO_THUMBNAIL_TYPE,
      );

      setPostThumbnailDraft((currentDraft) => {
        revokePostThumbnailDraft(currentDraft);
        return createPostThumbnailDraft(coverFile, { displayName: "星映の表紙" });
      });
      setPostMessage("星映の表紙を選びました。");
      clearPostCoverCropDraft();
    } catch (cropError) {
      setPostError(getUserFacingError(cropError, ERROR_OPERATION.VIDEO_THUMBNAIL));
      setPostCoverCropPreparing(false);
    }
  }

  function handleEditPostThumbnailDraft() {
    if (postSaving || !postThumbnailDraft?.file) {
      return;
    }

    openPostCoverCrop(postThumbnailDraft.file);
  }

  async function handleCancelPostVideoTrim() {
    if (postVideoTrimProcessing) {
      postVideoTrimCancelRequestedRef.current = true;
      try {
        await postVideoTrimConversionRef.current?.cancel?.();
      } catch (cancelError) {
        logSafeError(ERROR_OPERATION.VIDEO_TRIM, cancelError);
      }
      return;
    }

    clearPostVideoTrimDraft();
  }

  function handlePostVideoTrimStartChange(value) {
    const safeLength = clampNumber(
      Number(postVideoTrimLength) || METEOR_VIDEO_MAX_DURATION_SECONDS,
      0.5,
      Math.min(METEOR_VIDEO_MAX_DURATION_SECONDS, Math.max(0.5, Number(postVideoTrimDraft?.durationSeconds || 0))),
    );
    const safeStart = clampNumber(
      Number(value) || 0,
      0,
      Math.max(0, Number(postVideoTrimDraft?.durationSeconds || 0) - safeLength),
    );
    setPostVideoTrimStart(safeStart);
  }

  function handlePostVideoTrimLengthChange(value) {
    const durationSeconds = Math.max(0.5, Number(postVideoTrimDraft?.durationSeconds || 0));
    const safeLength = clampNumber(
      Number(value) || 0.5,
      0.5,
      Math.min(METEOR_VIDEO_MAX_DURATION_SECONDS, durationSeconds),
    );

    setPostVideoTrimLength(safeLength);
    setPostVideoTrimStart((currentStart) => clampNumber(currentStart, 0, Math.max(0, durationSeconds - safeLength)));
  }

  function handlePostVideoTrimReset() {
    setPostVideoTrimStart(0);
    setPostVideoTrimLength(
      Math.min(
        METEOR_VIDEO_MAX_DURATION_SECONDS,
        Math.max(0.5, Number(postVideoTrimDraft?.durationSeconds || METEOR_VIDEO_MAX_DURATION_SECONDS)),
      ),
    );
    setPostVideoTrimError("");
  }

  async function handleUseTrimmedPostVideo() {
    if (!postVideoTrimDraft || postVideoTrimProcessing) {
      return;
    }

    const trimLength = clampNumber(
      postVideoTrimLength,
      0.5,
      Math.min(METEOR_VIDEO_MAX_DURATION_SECONDS, postVideoTrimDraft.durationSeconds),
    );
    const trimStart = clampNumber(postVideoTrimStart, 0, Math.max(0, postVideoTrimDraft.durationSeconds - trimLength));
    const trimEnd = Math.min(postVideoTrimDraft.durationSeconds, trimStart + trimLength);

    setPostVideoTrimProcessing(true);
    setPostVideoTrimProgress(0);
    setPostVideoTrimError("");
    postVideoTrimCancelRequestedRef.current = false;
    setPostError("");
    setPostMessage("");

    try {
      const trimmedFile = await createTrimmedVideoFile({
        endSeconds: trimEnd,
        file: postVideoTrimDraft.file,
        onConversionReady: (conversion) => {
          postVideoTrimConversionRef.current = conversion;
          if (postVideoTrimCancelRequestedRef.current) {
            void conversion.cancel();
          }
        },
        onProgress: setPostVideoTrimProgress,
        startSeconds: trimStart,
      });
      const metadata = await loadVideoMetadataFromFile(trimmedFile);

      if (metadata.durationSeconds > METEOR_VIDEO_MAX_DURATION_SECONDS + 0.05) {
        throw createUserFacingError("切り取り後の星映が35秒を超えています。もう一度範囲を選んでください。");
      }

      if (trimmedFile.size > METEOR_VIDEO_MAX_SIZE_BYTES) {
        throw createUserFacingError("切り取った星映が100MBを超えています。もう少し短く切り取ってください。");
      }

      await applySelectedPostVideo(trimmedFile, {
        ...metadata,
        displayName: postVideoTrimDraft.name,
        durationSeconds: Math.min(metadata.durationSeconds, METEOR_VIDEO_MAX_DURATION_SECONDS),
        originalName: postVideoTrimDraft.file.name,
        wasTrimmed: true,
      });
      setPostMessage("星映を切り取りました。投稿前に再生確認できます。");
      clearPostVideoTrimDraft();
    } catch (trimError) {
      if (trimError?.name === "ConversionCanceledError") {
        setPostVideoTrimError("星映の切り取りをキャンセルしました。");
      } else if (isSafeUserFacingError(trimError)) {
        setPostVideoTrimError(getUserFacingError(trimError, ERROR_OPERATION.VIDEO_TRIM));
      } else {
        logSafeError(ERROR_OPERATION.VIDEO_TRIM, trimError);
        setPostVideoTrimError(METEOR_VIDEO_TRIM_ERROR_MESSAGE);
      }
      setPostVideoTrimProcessing(false);
      postVideoTrimConversionRef.current = null;
      postVideoTrimCancelRequestedRef.current = false;
    }
  }

  function handlePostImageFileChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []);

    event.target.value = "";
    setPostMessage("");
    setPostError("");

    if (postSaving || selectedFiles.length === 0) {
      return;
    }

    if (postVideoDraft) {
      setPostError("星映が選択済みです。画像を添える場合は先に星映を削除してください。");
      return;
    }

    setPostImageDrafts((currentDrafts) => {
      const remainingSlots = METEOR_IMAGE_MAX_COUNT - currentDrafts.length;
      const nextDrafts = [...currentDrafts];
      const errors = [];

      if (remainingSlots <= 0) {
        setPostError("星影は4枚まで放流できます。");
        return currentDrafts;
      }

      for (const file of selectedFiles) {
        if (nextDrafts.length >= METEOR_IMAGE_MAX_COUNT) {
          errors.push("星影は4枚まで放流できます。");
          break;
        }

        if (!METEOR_IMAGE_ALLOWED_TYPES[file.type]) {
          errors.push("画像はjpg / jpeg / png / webpから選んでください。HEIC / HEIFは今回は未対応です。");
          continue;
        }

        if (file.size > METEOR_IMAGE_MAX_SIZE_BYTES) {
          errors.push("画像は1枚8MBまで選べます。");
          continue;
        }

        nextDrafts.push(createPostImageDraft(file));
      }

      if (selectedFiles.length > remainingSlots) {
        errors.push("5枚目以降の星影は追加していません。");
      }

      setPostError([...new Set(errors)].join(" "));
      return nextDrafts;
    });
  }

  async function handlePostVideoFileChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []);

    event.target.value = "";
    setPostMessage("");
    setPostError("");

    if (postSaving || postVideoPreparing || selectedFiles.length === 0) {
      return;
    }

    if (postImageDrafts.length > 0) {
      setPostError("画像が選択済みです。星映を添える場合は先に星影を削除してください。");
      return;
    }

    if (selectedFiles.length > 1) {
      setPostError("星映は1投稿につき1本まで選べます。");
      return;
    }

    const file = selectedFiles[0];

    if (!METEOR_VIDEO_ALLOWED_TYPES[file.type]) {
      setPostError("星映はmp4 / mov / webmから選んでください。");
      return;
    }

    if (file.size > METEOR_VIDEO_SOURCE_MAX_SIZE_BYTES) {
      setPostError("切り取りに使える元の星映は500MBまでです。");
      return;
    }

    setPostVideoPreparing(true);

    try {
      const metadata = await loadVideoMetadataFromFile(file);

      if (metadata.durationSeconds > METEOR_VIDEO_MAX_DURATION_SECONDS || file.size > METEOR_VIDEO_MAX_SIZE_BYTES) {
        openPostVideoTrimDraft(file, metadata);
        setPostMessage("使いたい部分だけ切り取ってください。完成した星映だけを投稿に使います。");
        return;
      }

      await applySelectedPostVideo(file, {
        ...metadata,
        displayName: file.name,
        originalName: file.name,
      });
    } catch (metadataError) {
      const safeMetadataError = getUserFacingError(metadataError, ERROR_OPERATION.VIDEO_TRIM);

      if (isSafeUserFacingError(metadataError) && safeMetadataError.includes("再生時間")) {
        setPostError("星映の再生時間を確認できませんでした。別のファイルを選んでください。");
      } else if (isSafeUserFacingError(metadataError) && safeMetadataError.includes("再生確認")) {
        setPostError("この星映は端末で再生できない形式またはコーデックです。mp4 / mov / webmの別ファイルを選んでください。");
      } else {
        logSafeError(ERROR_OPERATION.VIDEO_TRIM, metadataError);
        setPostError("星映の情報を確認できませんでした。別のファイルを選んでください。");
      }
    } finally {
      setPostVideoPreparing(false);
    }
  }

  function handleRemovePostVideoDraft() {
    if (postSaving) {
      return;
    }

    clearPostVideoDraft();
    clearPostThumbnailDraft();
    clearPostVideoTrimDraft();
    clearPostCoverCropDraft();
  }

  function handlePostThumbnailFileChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []);

    event.target.value = "";
    setPostMessage("");
    setPostError("");

    if (postSaving || selectedFiles.length === 0) {
      return;
    }

    if (!postVideoDraft) {
      setPostError("星映の表紙は星映を選んだ後に選べます。");
      return;
    }

    const file = selectedFiles[0];

    if (!METEOR_THUMBNAIL_ALLOWED_TYPES[file.type]) {
      setPostError("星映の表紙はjpg / jpeg / png / webpから選んでください。");
      return;
    }

    if (file.size > METEOR_THUMBNAIL_MAX_SIZE_BYTES) {
      setPostError("星映の表紙は1枚8MBまで選べます。");
      return;
    }

    openPostCoverCrop(file);
  }

  function handleRemovePostThumbnailDraft() {
    if (postSaving) {
      return;
    }

    clearPostThumbnailDraft();
  }

  function handleRemovePostImageDraft(draftId) {
    if (postSaving) {
      return;
    }

    setPostImageDrafts((currentDrafts) => {
      const targetDraft = currentDrafts.find((draft) => draft.id === draftId);
      revokePostImageDraft(targetDraft);
      return currentDrafts.filter((draft) => draft.id !== draftId);
    });
  }

  function handleMovePostImageDraft(draftId, direction) {
    if (postSaving) {
      return;
    }

    setPostImageDrafts((currentDrafts) => {
      const currentIndex = currentDrafts.findIndex((draft) => draft.id === draftId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentDrafts.length) {
        return currentDrafts;
      }

      const nextDrafts = [...currentDrafts];
      [nextDrafts[currentIndex], nextDrafts[nextIndex]] = [nextDrafts[nextIndex], nextDrafts[currentIndex]];
      return nextDrafts;
    });
  }

  async function removeUploadedMeteorMedia(storagePaths) {
    const paths = (storagePaths ?? []).filter(Boolean);

    if (paths.length === 0) {
      return;
    }

    const { error } = await supabase.storage.from(METEOR_MEDIA_BUCKET).remove(paths);

    if (error) {
      logSafeError(ERROR_OPERATION.MEDIA_CLEANUP, error);
    }
  }

  async function removeUploadedMeteorVideos(storagePaths) {
    const paths = (storagePaths ?? []).filter(Boolean);

    if (paths.length === 0) {
      return;
    }

    const { error } = await supabase.storage.from(METEOR_VIDEO_BUCKET).remove(paths);

    if (error) {
      logSafeError(ERROR_OPERATION.MEDIA_CLEANUP, error);
    }
  }

  async function requestAutomaticChiaObservation(postId, postType) {
    if (!["text", "image", "video", "youtube"].includes(postType) || !session?.access_token) {
      return;
    }

    try {
      const response = await fetch("/api/ai-observation-auto-request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (!response.ok) {
        logSafeError(ERROR_OPERATION.AI_OBSERVATION_AUTO, {
          status: response.status,
        });
      }
    } catch (error) {
      logSafeError(ERROR_OPERATION.AI_OBSERVATION_AUTO, error);
    }
  }

  async function handlePostSubmit(event) {
    event.preventDefault();
    setPostMessage("");
    setPostError("");
    setPostUploadProgress("");

    if (!session?.user?.id) {
      setPostError("ログインすると流星便を放流できます。");
      return;
    }

    if (!profile?.id) {
      setPostError("先にプロフィールを保存してください。");
      return;
    }

    const body = postDraft.trim();
    const imageDrafts = postImageDrafts;
    const videoDraft = postVideoDraft;
    const thumbnailDraft = postThumbnailDraft;
    const hasVideo = Boolean(videoDraft);
    const hasImages = imageDrafts.length > 0;

    if (hasImages && hasVideo) {
      setPostError("星影と星映は同時に添付できません。どちらか一方を選んでください。");
      return;
    }

    if (!body && !hasImages && !hasVideo) {
      setPostError("本文を書くか、星影または星映を1つ添えてください。");
      return;
    }

    if (getTrimmedCharacterLength(body) > POST_MAX_LENGTH) {
      setPostError("流星便は500文字以内で放流してください。");
      return;
    }

    const meteorTagValidation = validateMeteorTagsFromText(body);

    if (meteorTagValidation.error) {
      setPostError(meteorTagValidation.error);
      return;
    }

    if (hasVideo && videoDraft.file.size > METEOR_VIDEO_MAX_SIZE_BYTES) {
      setPostError("切り取った星映が100MBを超えています。もう少し短く切り取ってください。");
      return;
    }

    if (hasVideo && videoDraft.durationSeconds > METEOR_VIDEO_MAX_DURATION_SECONDS + 0.05) {
      setPostError("切り取り後の星映が35秒を超えています。もう一度範囲を選んでください。");
      return;
    }

    setPostSaving(true);

    const uploadedImageMedia = [];
    const uploadedVideoPaths = [];
    const uploadedThumbnailPaths = [];
    let createdPostId = null;

    try {
      const uploadBatchId = createClientId();
      let videoMediaRow = null;

      if (hasVideo) {
        setPostUploadProgress("星映を送信中");
        const videoStoragePath = createMeteorVideoPath(session.user.id, uploadBatchId, videoDraft.file);
        const { error: videoUploadError } = await supabase.storage.from(METEOR_VIDEO_BUCKET).upload(videoStoragePath, videoDraft.file, {
          cacheControl: "3600",
          contentType: videoDraft.file.type,
          upsert: false,
        });

        if (videoUploadError) {
          logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, videoUploadError);
          throw createUserFacingError("星映の送信に失敗しました。時間をおいてもう一度試してください。");
        }

        uploadedVideoPaths.push(videoStoragePath);

        let thumbnailStoragePath = null;
        setPostUploadProgress("星映の表紙を送信中");

        if (thumbnailDraft) {
          const thumbnailExtension = getMeteorImageExtension(thumbnailDraft.file) || "jpg";
          thumbnailStoragePath = createMeteorVideoThumbnailPath(session.user.id, uploadBatchId, thumbnailExtension);
          const { error: thumbnailUploadError } = await supabase.storage.from(METEOR_MEDIA_BUCKET).upload(thumbnailStoragePath, thumbnailDraft.file, {
            cacheControl: "3600",
            contentType: thumbnailDraft.file.type,
            upsert: false,
          });

          if (thumbnailUploadError) {
            logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, thumbnailUploadError);
            throw createUserFacingError("星映の表紙の送信に失敗しました。時間をおいてもう一度試してください。");
          }

          uploadedThumbnailPaths.push(thumbnailStoragePath);
        } else {
          try {
            const thumbnailBlob = await createVideoCoverBlob(videoDraft.file, videoDraft.durationSeconds);
            thumbnailStoragePath = createMeteorVideoThumbnailPath(session.user.id, uploadBatchId);
            const { error: generatedThumbnailUploadError } = await supabase.storage.from(METEOR_MEDIA_BUCKET).upload(thumbnailStoragePath, thumbnailBlob, {
              cacheControl: "3600",
              contentType: METEOR_VIDEO_THUMBNAIL_TYPE,
              upsert: false,
            });

            if (generatedThumbnailUploadError) {
              logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, generatedThumbnailUploadError);
              thumbnailStoragePath = null;
            } else {
              uploadedThumbnailPaths.push(thumbnailStoragePath);
            }
          } catch (thumbnailError) {
            logSafeError(ERROR_OPERATION.VIDEO_THUMBNAIL, thumbnailError);
            thumbnailStoragePath = null;
          }
        }

        videoMediaRow = {
          duration_seconds: Math.min(METEOR_VIDEO_MAX_DURATION_SECONDS, Math.round(videoDraft.durationSeconds * 1000) / 1000),
          media_type: "video",
          mime_type: videoDraft.file.type,
          size_bytes: videoDraft.file.size,
          sort_order: 0,
          storage_path: videoStoragePath,
          thumbnail_storage_path: thumbnailStoragePath,
        };
      } else {
        for (const [index, draft] of imageDrafts.entries()) {
          setPostUploadProgress(`${index + 1} / ${imageDrafts.length}枚を送信中`);

          const storagePath = createMeteorMediaPath(session.user.id, uploadBatchId, index, draft.file);
          const { error: uploadError } = await supabase.storage.from(METEOR_MEDIA_BUCKET).upload(storagePath, draft.file, {
            cacheControl: "3600",
            contentType: draft.file.type,
            upsert: false,
          });

          if (uploadError) {
            logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, uploadError);
            throw createUserFacingError("星影の送信に失敗しました。時間をおいてもう一度試してください。");
          }

          uploadedImageMedia.push({
            storage_path: storagePath,
            sort_order: index,
            mime_type: draft.file.type,
            size_bytes: draft.file.size,
          });
        }
      }

      setPostUploadProgress("流星便を保存中");

      const postType = hasVideo ? "video" : uploadedImageMedia.length > 0 ? "image" : "text";
      const { data, error } = await supabase
        .from("posts")
        .insert({
          author_id: session.user.id,
          type: postType,
          body,
          visibility: "public",
        })
        .select(POST_SELECT_COLUMNS_WITH_DELETED_AT)
        .single();

      if (error) {
        logSafeError(ERROR_OPERATION.POST_CREATE, error);
        throw createUserFacingError("流星便の保存に失敗しました。時間をおいてもう一度試してください。");
      }

      createdPostId = data.id;

      let media = [];
      let meteorTags = [];

      if (videoMediaRow) {
        const { data: insertedMedia, error: mediaError } = await insertPostMediaRows([
          {
            post_id: data.id,
            uploader_id: session.user.id,
            ...videoMediaRow,
          },
        ]);

        if (mediaError) {
          logSafeError(ERROR_OPERATION.POST_MEDIA_SAVE, mediaError);
          throw createUserFacingError("星映メタデータの保存に失敗しました。時間をおいてもう一度試してください。");
        }

        media = await mapPostMediaRows(insertedMedia);
      } else if (uploadedImageMedia.length > 0) {
        const mediaRows = uploadedImageMedia.map((item) => ({
          post_id: data.id,
          uploader_id: session.user.id,
          media_type: "image",
          storage_path: item.storage_path,
          sort_order: item.sort_order,
          mime_type: item.mime_type,
          size_bytes: item.size_bytes,
        }));
        const { data: insertedMedia, error: mediaError } = await insertPostMediaRows(mediaRows);

        if (mediaError) {
          logSafeError(ERROR_OPERATION.POST_MEDIA_SAVE, mediaError);
          throw createUserFacingError("星影メタデータの保存に失敗しました。時間をおいてもう一度試してください。");
        }

        media = await mapPostMediaRows(insertedMedia);
      }

      if (meteorTagValidation.tags.length > 0) {
        const { error: meteorTagsError, tags } = await replacePostMeteorTags(
          data.id,
          meteorTagValidation.tags,
          session.user.id,
        );

        if (meteorTagsError) {
          logSafeError(ERROR_OPERATION.METEOR_TAG_SAVE, meteorTagsError);
          throw createUserFacingError(
            isMissingMeteorTagsError(meteorTagsError)
              ? "流星タグ機能の準備がまだ完了していません。"
              : "流星タグの保存に失敗しました。時間をおいてもう一度試してください。",
          );
        }

        meteorTags = tags;
      }

      const newPost = {
        ...mapSavedPost(data, profile, profileFrames),
        media,
        tags: meteorTags,
      };
      const completesOnboardingFirstPost =
        onboardingProgressRef.current?.current_step === "first_post";

      if (completesOnboardingFirstPost) {
        onboardingPostCompletionRef.current = true;
        await advanceInitialOnboarding("first_post_saved", {
          targetId: data.id,
        });
        onboardingPostCompletionRef.current = false;
      }

      setSavedPosts((currentPosts) => [newPost, ...currentPosts.filter((post) => post.id !== newPost.id)]);
      setOwnPosts((currentPosts) => [newPost, ...currentPosts.filter((post) => post.id !== newPost.id)]);
      setPostDraft("");
      clearPostImageDrafts();
      clearPostVideoDraft();
      clearPostThumbnailDraft();
      setPostUploadProgress("完了");
      setPostMessage("流星便を放流しました。");
      setActiveTab("observe");
      void requestAutomaticChiaObservation(data.id, postType);
    } catch (error) {
      setPostUploadProgress("失敗");
      await removeUploadedMeteorMedia([
        ...uploadedImageMedia.map((item) => item.storage_path),
        ...uploadedThumbnailPaths,
      ]);
      await removeUploadedMeteorVideos(uploadedVideoPaths);

      if (createdPostId) {
        const { error: postMediaCleanupError } = await supabase
          .from("post_media")
          .delete()
          .eq("post_id", createdPostId)
          .eq("uploader_id", session.user.id);

        if (postMediaCleanupError) {
          logSafeError(ERROR_OPERATION.MEDIA_CLEANUP, postMediaCleanupError);
        }

        const { error: softDeleteError } = await supabase
          .from("posts")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", createdPostId)
          .eq("author_id", session.user.id);

        if (softDeleteError) {
          logSafeError(ERROR_OPERATION.MEDIA_CLEANUP, softDeleteError);
        }
      }

      setPostError(getUserFacingError(error, ERROR_OPERATION.POST_CREATE));
    }

    setPostSaving(false);
    setPostUploadProgress("");
  }

  function updatePostEverywhere(postId, updater) {
    setSavedPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setOwnPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setResonatedPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setSentStarLetters((currentLetters) =>
      currentLetters.map((letter) =>
        letter.sourcePost?.id === postId ? { ...letter, sourcePost: updater(letter.sourcePost) } : letter,
      ),
    );
    setArchivedPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setPublicProfilePosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setMeteorTagPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setDetailPost((currentPost) => (currentPost?.id === postId ? updater(currentPost) : currentPost));
  }

  function removePostFromVisibleLists(postId) {
    setSavedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setOwnPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setResonatedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setSentStarLetters((currentLetters) => currentLetters.filter((letter) => letter.postId !== postId));
    setArchivedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setPublicProfilePosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setMeteorTagPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
  }

  function handleStartPostEdit(post) {
    setPostActionMessage("");
    setPostActionError("");

    if (!session?.user?.id) {
      setPostActionError("ログインすると流星便を編集できます。");
      return;
    }

    if (post.authorId !== session.user.id) {
      setPostActionError("自分の流星便だけ編集できます。");
      return;
    }

    if (!VISIBLE_POST_TYPES.includes(post.type)) {
      setPostActionError("MVPでは流星便本文だけ編集できます。");
      return;
    }

    if (post.deletedAt) {
      setPostActionError("削除済みの流星便は編集できません。");
      return;
    }

    setEditingPostId(post.id);
    setPostEditDrafts((currentDrafts) => ({
      ...currentDrafts,
      [post.id]: post.text,
    }));
  }

  function handleCancelPostEdit(postId) {
    setPostActionMessage("");
    setPostActionError("");
    setEditingPostId(null);
    setPostEditDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[postId];
      return nextDrafts;
    });
  }

  function handlePostEditDraftChange(postId, value) {
    setPostEditDrafts((currentDrafts) => ({
      ...currentDrafts,
      [postId]: value,
    }));
  }

  async function handlePostUpdate(event, post) {
    event.preventDefault();
    setPostActionMessage("");
    setPostActionError("");

    if (!session?.user?.id) {
      setPostActionError("ログインすると流星便を編集できます。");
      return;
    }

    if (post.authorId !== session.user.id) {
      setPostActionError("自分の流星便だけ編集できます。");
      return;
    }

    if (!VISIBLE_POST_TYPES.includes(post.type)) {
      setPostActionError("MVPでは流星便本文だけ編集できます。");
      return;
    }

    if (post.deletedAt) {
      setPostActionError("削除済みの流星便は編集できません。");
      return;
    }

    const body = (postEditDrafts[post.id] ?? "").trim();

    if (!body && (post.media?.length ?? 0) === 0) {
      setPostActionError("本文を書くか、星影が必要です。");
      return;
    }

    if (getTrimmedCharacterLength(body) > POST_MAX_LENGTH) {
      setPostActionError("流星便は500文字以内で放流してください。");
      return;
    }

    const meteorTagValidation = validateMeteorTagsFromText(body);

    if (meteorTagValidation.error) {
      setPostActionError(meteorTagValidation.error);
      return;
    }

    setPostUpdatingId(post.id);

    const { data, error } = await supabase
      .from("posts")
      .update({ body })
      .eq("id", post.id)
      .eq("author_id", session.user.id)
      .select(POST_SELECT_COLUMNS)
      .single();

    if (error) {
      setPostUpdatingId(null);
      setPostActionError(getUserFacingError(error, ERROR_OPERATION.POST_UPDATE));
      return;
    }

    const { error: meteorTagsError, tags } = await replacePostMeteorTags(
      post.id,
      meteorTagValidation.tags,
      session.user.id,
    );

    if (meteorTagsError) {
      setPostUpdatingId(null);
      setPostActionError(
        isMissingMeteorTagsError(meteorTagsError)
          ? "流星タグ機能の準備がまだ完了していません。"
          : "流星タグの保存に失敗しました。時間をおいてもう一度試してください。",
      );
      return;
    }

    const nextBody = data?.body ?? body;
    updatePostEverywhere(post.id, (currentPost) => ({
      ...currentPost,
      tags,
      text: nextBody,
    }));
    setPostUpdatingId(null);
    handleCancelPostEdit(post.id);
    setPostActionMessage("流星便を保存しました。");
  }

  async function handlePostDelete(post) {
    setPostActionMessage("");
    setPostActionError("");

    if (!session?.user?.id) {
      setPostActionError("ログインすると流星便を削除できます。");
      return;
    }

    if (post.authorId !== session.user.id) {
      setPostActionError("自分の流星便だけ削除できます。");
      return;
    }

    if (post.deletedAt) {
      setPostActionError("この流星便はすでに削除されています。");
      return;
    }

    const confirmed = window.confirm("この流星便を削除しますか？");

    if (!confirmed) {
      return;
    }

    const deletedAt = new Date().toISOString();
    setPostDeletingId(post.id);

    const { data, error } = await supabase
      .from("posts")
      .update({ deleted_at: deletedAt })
      .eq("id", post.id)
      .eq("author_id", session.user.id)
      .select("id, author_id, deleted_at")
      .single();

    setPostDeletingId(null);

    if (error) {
      if (isMissingDeletedAtError(error)) {
        setPostActionError("流星便削除機能の準備がまだ完了していません。");
        return;
      }

      setPostActionError(getUserFacingError(error, ERROR_OPERATION.POST_DELETE));
      return;
    }

    removePostFromVisibleLists(post.id);
    setDetailPost((currentPost) =>
      currentPost?.id === post.id
        ? {
            ...currentPost,
            deletedAt: data?.deleted_at ?? deletedAt,
          }
        : currentPost,
    );
    setOpenStarLetterPostId((currentPostId) => (currentPostId === post.id ? null : currentPostId));
    handleCancelPostEdit(post.id);
    setPostActionMessage("流星便を削除しました。");
  }

  async function handleResonance(postId) {
    setResonanceMessage("");
    setResonanceError("");

    if (!session?.user?.id) {
      setResonanceError("ログインすると共鳴できます。");
      return;
    }

    if (!profile?.id) {
      setResonanceError("先にプロフィールを保存すると共鳴できます。");
      return;
    }

    const targetPost =
      savedPosts.find((post) => post.id === postId) ??
      ownPosts.find((post) => post.id === postId) ??
      resonatedPosts.find((post) => post.id === postId) ??
      archivedPosts.find((post) => post.id === postId) ??
      publicProfilePosts.find((post) => post.id === postId) ??
      meteorTagPosts.find((post) => post.id === postId) ??
      (detailPost?.id === postId ? detailPost : null);

    if (!targetPost) {
      setResonanceError("流星便が見つかりませんでした。");
      return;
    }

    setResonanceSavingPostId(postId);

    const { error } = await supabase.from("resonances").insert({
      post_id: postId,
      profile_id: session.user.id,
      resonance_type: "sparkle",
    });

    setResonanceSavingPostId(null);

    if (error) {
      setResonanceError(getUserFacingError(error, ERROR_OPERATION.RESONANCE_SAVE));
      return;
    }

    setSavedPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              resonanceCount: (Number(post.resonanceCount) || 0) + 1,
            }
          : post,
      ),
    );
    setOwnPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              resonanceCount: (Number(post.resonanceCount) || 0) + 1,
            }
          : post,
      ),
    );
    setResonatedPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              resonanceCount: (Number(post.resonanceCount) || 0) + 1,
            }
          : post,
      ),
    );
    setArchivedPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              resonanceCount: (Number(post.resonanceCount) || 0) + 1,
            }
          : post,
      ),
    );
    setPublicProfilePosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              resonanceCount: (Number(post.resonanceCount) || 0) + 1,
            }
          : post,
      ),
    );
    setMeteorTagPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              resonanceCount: (Number(post.resonanceCount) || 0) + 1,
            }
          : post,
      ),
    );
    setDetailPost((currentPost) =>
      currentPost?.id === postId
        ? {
            ...currentPost,
            resonanceCount: (Number(currentPost.resonanceCount) || 0) + 1,
          }
        : currentPost,
    );
    setResonanceMessage("共鳴を記録しました。");
  }

  async function handleToggleArchive(postId) {
    setArchivesMessage("");
    setArchivesError("");

    if (!session?.user?.id) {
      setArchivesError("ログインすると流星便をArchiveできます。");
      return;
    }

    if (!profile?.id) {
      setArchivesError("先にプロフィールを保存するとArchiveできます。");
      return;
    }

    const archivedPost = archivedPosts.find((post) => post.id === postId);
    const isOnboardingArchiveTarget =
      onboardingProgressRef.current?.current_step === "archive_prompt" &&
      onboardingProgressRef.current?.target_post_id === postId;

    if (archivedPost?.archiveId && isOnboardingArchiveTarget) {
      setArchivesMessage("この流星便はすでにArchive済みです。");
      void advanceInitialOnboarding("archive_saved", { targetId: postId });
      return;
    }

    setArchiveSavingPostId(postId);

    if (archivedPost?.archiveId) {
      const { error } = await supabase
        .from("archives")
        .delete()
        .eq("id", archivedPost.archiveId)
        .eq("profile_id", session.user.id);

      setArchiveSavingPostId(null);

      if (error) {
        setArchivesError(getUserFacingError(error, ERROR_OPERATION.ARCHIVE_SAVE));
        return;
      }

      setArchivedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
      setArchivesMessage("Archiveから外しました。");
      return;
    }

    const targetPost =
      savedPosts.find((post) => post.id === postId) ??
      ownPosts.find((post) => post.id === postId) ??
      resonatedPosts.find((post) => post.id === postId) ??
      archivedPosts.find((post) => post.id === postId) ??
      publicProfilePosts.find((post) => post.id === postId) ??
      meteorTagPosts.find((post) => post.id === postId) ??
      (detailPost?.id === postId ? detailPost : null);

    if (!targetPost) {
      setArchiveSavingPostId(null);
      setArchivesError("Archiveする流星便が見つかりませんでした。");
      return;
    }

    const { data, error } = await supabase
      .from("archives")
      .insert({
        profile_id: session.user.id,
        post_id: postId,
      })
      .select("id, profile_id, post_id, created_at")
      .single();

    setArchiveSavingPostId(null);

    if (error) {
      if (error.code === "23505") {
        setArchivesMessage("この流星便はすでにArchive済みです。");
        if (isOnboardingArchiveTarget) {
          void advanceInitialOnboarding("archive_saved", { targetId: postId });
        }
        return;
      }

      setArchivesError(getUserFacingError(error, ERROR_OPERATION.ARCHIVE_SAVE));
      return;
    }

    const archivedTargetPost = {
      ...targetPost,
      archiveId: data.id,
      archivedAt: data.created_at,
      archivedTime: formatNotificationTime(data.created_at),
    };

    setArchivedPosts((currentPosts) => [archivedTargetPost, ...currentPosts.filter((post) => post.id !== postId)]);
    setArchivesMessage("流星便をArchiveしました。");
    if (isOnboardingArchiveTarget) {
      void advanceInitialOnboarding("archive_saved", { targetId: postId });
    }
  }

  async function handleMarkNotificationRead(notificationId) {
    setNotificationsMessage("");
    setNotificationsError("");

    if (!session?.user?.id) {
      setNotificationsError("ログインするとR.Connectを確認できます。");
      return;
    }

    setNotificationUpdatingId(notificationId);

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("recipient_id", session.user.id)
      .select("id, is_read")
      .single();

    setNotificationUpdatingId(null);

    if (error) {
      setNotificationsError(getUserFacingError(error, ERROR_OPERATION.NOTIFICATION_SAVE));
      return;
    }

    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              is_read: data?.is_read ?? true,
            }
          : notification,
      ),
    );
    setNotificationsMessage("通知を既読にしました。");
  }

  async function refreshStarLettersForPost(postId) {
    setStarLettersLoading(true);
    const finish = (value) => {
      setStarLettersLoading(false);
      return value;
    };
    let data;
    let conversationAvailable = true;

    try {
      data = await getStarLetterThread(supabase, postId);
    } catch (error) {
      const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
      const isMissingConversationRpc =
        error?.code === "42883" ||
        error?.code === "PGRST202" ||
        (message.includes("get_star_letter_thread") && message.includes("does not exist"));

      if (!isMissingConversationRpc) {
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_LOAD));
        return finish(false);
      }

      conversationAvailable = false;
      const legacyResult = await runStarLetterQuery((columns) =>
        supabase
          .from("star_letters")
          .select(columns)
          .eq("post_id", postId)
          .order("created_at", { ascending: true }),
      );

      if (legacyResult.error) {
        setStarLettersError(getUserFacingError(legacyResult.error, ERROR_OPERATION.STAR_LETTER_LOAD));
        return finish(false);
      }

      data = legacyResult.data ?? [];
    }

    const authorIds = [...new Set((data ?? []).map((letter) => letter.author_id).filter(Boolean))];
    const profilesById = new Map();

    if (authorIds.length > 0) {
      const { data: profileRows, error: profileError } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
        PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_BASIC_SELECT_COLUMNS,
      );

      if (profileError) {
        setStarLettersError(getUserFacingError(profileError, ERROR_OPERATION.PROFILE_LOAD));
        return finish(false);
      }

      for (const profileRow of profileRows ?? []) {
        profilesById.set(profileRow.id, profileRow);
      }
    }

    const mappedLetters = (data ?? []).map((letter) =>
      mapStarLetter(
        { ...letter, conversationAvailable },
        profilesById.get(letter.author_id),
        profileFrames,
      ),
    );

    setStarLettersByPostId((currentLetters) => ({
      ...currentLetters,
      [postId]: mappedLetters,
    }));
    setStarLettersError("");
    return finish(true);
  }

  function handleToggleStarLetters(postId) {
    setStarLettersMessage("");
    setStarLettersError("");
    setOpenStarLetterPostId((currentPostId) => {
      const nextPostId = currentPostId === postId ? null : postId;

      if (nextPostId) {
        void refreshStarLettersForPost(postId);
      }

      return nextPostId;
    });
  }

  function handleStarLetterDraftChange(postId, value) {
    setStarLetterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [postId]: value,
    }));
  }

  function handleStartStarLetterEdit(letter) {
    setStarLettersMessage("");
    setStarLettersError("");
    setEditingStarLetterId(letter.id);
    setStarLetterEditDrafts((currentDrafts) => ({
      ...currentDrafts,
      [letter.id]: letter.body,
    }));
  }

  function handleCancelStarLetterEdit(letterId) {
    setStarLettersMessage("");
    setStarLettersError("");
    setEditingStarLetterId(null);
    setStarLetterEditDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[letterId];
      return nextDrafts;
    });
  }

  function handleStarLetterEditDraftChange(letterId, value) {
    setStarLetterEditDrafts((currentDrafts) => ({
      ...currentDrafts,
      [letterId]: value,
    }));
  }

  function handleStartStarLetterReply(letter) {
    setStarLettersMessage("");
    setStarLettersError("");

    if (!session?.user?.id) {
      setStarLettersError("ログインすると星文を返せます。");
      return;
    }

    if (!profile?.id) {
      setStarLettersError("先にプロフィールを保存すると星文を返せます。");
      return;
    }

    setStarLetterReplyComposer((currentComposer) =>
      currentComposer?.parentStarLetterId === letter.id
        ? null
        : {
            postId: letter.postId,
            parentStarLetterId: letter.id,
            body: "",
            clientRequestId: starLetterRequestIdsRef.current.get(`reply:${letter.id}`),
          },
    );
  }

  function handleStarLetterReplyDraftChange(value) {
    setStarLetterReplyComposer((currentComposer) =>
      currentComposer ? { ...currentComposer, body: value } : currentComposer,
    );
  }

  async function handleStarLetterReplySubmit(event) {
    event.preventDefault();
    const composer = starLetterReplyComposer;
    setStarLettersMessage("");
    setStarLettersError("");

    if (!composer || !session?.user?.id || !profile?.id) {
      setStarLettersError("ログインしてプロフィールを保存すると星文を返せます。");
      return;
    }

    const body = composer.body.trim();

    if (!body || getTrimmedCharacterLength(body) > STAR_LETTER_MAX_LENGTH) {
      setStarLettersError("星文は1〜500文字で入力してください。");
      return;
    }

    setStarLetterReplySavingId(composer.parentStarLetterId);

    try {
      await createStarLetterReply(supabase, {
        parentStarLetterId: composer.parentStarLetterId,
        body,
        clientRequestId: composer.clientRequestId,
      });
      starLetterRequestIdsRef.current.clear(`reply:${composer.parentStarLetterId}`);
      setStarLetterReplyComposer(null);
      await refreshStarLettersForPost(composer.postId);
      setStarLettersMessage("星文を返しました。");
    } catch (error) {
      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
      await refreshStarLettersForPost(composer.postId);
    } finally {
      setStarLetterReplySavingId(null);
    }
  }

  async function handleStarLetterResonate(letter) {
    setStarLettersMessage("");
    setStarLettersError("");

    if (!session?.user?.id) {
      setStarLettersError("ログインすると星文へ共鳴できます。");
      return;
    }

    const requestKey = `resonance:${letter.id}`;
    const clientRequestId = starLetterRequestIdsRef.current.get(requestKey);
    setStarLetterResonatingIds((currentIds) => new Set(currentIds).add(letter.id));

    try {
      await addStarLetterResonance(supabase, { starLetterId: letter.id, clientRequestId });
      starLetterRequestIdsRef.current.clear(requestKey);
      await refreshStarLettersForPost(letter.postId);
    } catch (error) {
      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.RESONANCE_SAVE));
      await refreshStarLettersForPost(letter.postId);
    } finally {
      setStarLetterResonatingIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(letter.id);
        return nextIds;
      });
    }
  }

  async function refreshArchivedStarLetters() {
    const userId = session?.user?.id;

    if (!userId) {
      setArchivedStarLetters([]);
      setArchivedStarLettersLoading(false);
      setArchivedStarLettersError("");
      return false;
    }

    setArchivedStarLettersLoading(true);
    setArchivedStarLettersError("");

    const { data: archiveRows, error: archiveError } = await supabase
      .from("star_letter_archives")
      .select("id, profile_id, star_letter_id, post_id, created_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (archiveError) {
      setArchivedStarLetters([]);
      setArchivedStarLettersLoading(false);
      setArchivedStarLettersError(getUserFacingError(archiveError, ERROR_OPERATION.ARCHIVE_LOAD));
      return false;
    }

    const archiveItems = archiveRows ?? [];

    if (archiveItems.length === 0) {
      setArchivedStarLetters([]);
      setArchivedStarLettersLoading(false);
      return true;
    }

    const starLetterIds = [...new Set(archiveItems.map((item) => item.star_letter_id).filter(Boolean))];
    const postIds = [...new Set(archiveItems.map((item) => item.post_id).filter(Boolean))];
    const { data: letterRows, error: letterError } = await supabase
      .from("star_letters")
      .select("id, post_id, author_id, parent_star_letter_id, body, created_at, updated_at, edited_at, deleted_at")
      .in("id", starLetterIds);

    if (letterError) {
      setArchivedStarLetters([]);
      setArchivedStarLettersLoading(false);
      setArchivedStarLettersError(getUserFacingError(letterError, ERROR_OPERATION.STAR_LETTER_LOAD));
      return false;
    }

    const { data: postRows, error: postsError } = await runPostQuery((columns, supportsSoftDelete) => {
      let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).in("id", postIds));

      if (supportsSoftDelete) {
        query = query.is("deleted_at", null);
      }

      return query;
    });

    if (postsError) {
      setArchivedStarLetters([]);
      setArchivedStarLettersLoading(false);
      setArchivedStarLettersError(getUserFacingError(postsError, ERROR_OPERATION.POST_LOAD));
      return false;
    }

    const authorIds = [
      ...new Set(
        [...(letterRows ?? []), ...(postRows ?? [])]
          .map((row) => row.author_id)
          .filter(Boolean),
      ),
    ];
    const profilesById = new Map();

    if (authorIds.length > 0) {
      const { data: profileRows, error: profileRowsError } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
        PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_BASIC_SELECT_COLUMNS,
      );

      if (profileRowsError) {
        setArchivedStarLetters([]);
        setArchivedStarLettersLoading(false);
        setArchivedStarLettersError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
        return false;
      }

      for (const profileRow of profileRows ?? []) {
        profilesById.set(profileRow.id, profileRow);
      }
    }

    const lettersById = new Map((letterRows ?? []).map((letter) => [letter.id, letter]));
    const postsById = new Map((postRows ?? []).map((post) => [post.id, post]));
    const nextItems = archiveItems
      .map((archiveItem) => {
        const letter = lettersById.get(archiveItem.star_letter_id);

        if (!letter) {
          return null;
        }

        const sourcePost = postsById.get(archiveItem.post_id);
        const mappedLetter = mapStarLetter(
          {
            ...letter,
            conversationAvailable: true,
            is_archived: true,
          },
          profilesById.get(letter.author_id),
          profileFrames,
        );

        return {
          ...mappedLetter,
          archiveId: archiveItem.id,
          archivedAt: archiveItem.created_at,
          archiveTime: formatNotificationTime(archiveItem.created_at),
          sourcePost: sourcePost
            ? mapSavedPost(sourcePost, profilesById.get(sourcePost.author_id), profileFrames)
            : null,
        };
      })
      .filter(Boolean);

    setArchivedStarLetters(nextItems);
    setArchivedStarLettersLoading(false);
    return true;
  }

  async function handleToggleStarLetterArchive(letter) {
    setStarLettersMessage("");
    setStarLettersError("");

    if (!session?.user?.id) {
      setStarLettersError("ログインすると星文をArchiveできます。");
      return;
    }

    setStarLetterArchivingIds((currentIds) => new Set(currentIds).add(letter.id));

    try {
      await setStarLetterArchived(supabase, { starLetterId: letter.id, archived: !letter.isArchived });

      if (letter.isArchived) {
        setArchivedStarLetters((currentItems) => currentItems.filter((item) => item.id !== letter.id));
        setStarLettersMessage("星文のArchiveを解除しました。");
      } else {
        if (activeTab === "archive") {
          await refreshArchivedStarLetters();
        }
        setStarLettersMessage("星文をArchiveしました。");
      }

      await refreshStarLettersForPost(letter.postId);
    } catch (error) {
      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.ARCHIVE_SAVE));
      await refreshStarLettersForPost(letter.postId);
    } finally {
      setStarLetterArchivingIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(letter.id);
        return nextIds;
      });
    }
  }

  async function handleStarLetterSubmit(event, postId) {
    event.preventDefault();
    setStarLettersMessage("");
    setStarLettersError("");

    if (!session?.user?.id) {
      setStarLettersError("ログインすると星文を送れます。");
      return;
    }

    if (!profile?.id) {
      setStarLettersError("先にプロフィールを保存すると星文を送れます。");
      return;
    }

    const body = (starLetterDrafts[postId] ?? "").trim();

    if (!body) {
      setStarLettersError("星文の本文を入力してください。");
      return;
    }

    if (getTrimmedCharacterLength(body) > STAR_LETTER_MAX_LENGTH) {
      setStarLettersError("星文は500文字以内で送ってください。");
      return;
    }

    const targetPost =
      savedPosts.find((post) => post.id === postId) ??
      ownPosts.find((post) => post.id === postId) ??
      resonatedPosts.find((post) => post.id === postId) ??
      archivedPosts.find((post) => post.id === postId) ??
      publicProfilePosts.find((post) => post.id === postId) ??
      meteorTagPosts.find((post) => post.id === postId) ??
      (detailPost?.id === postId ? detailPost : null);

    if (!targetPost) {
      setStarLettersError("星文を送る流星便が見つかりませんでした。");
      return;
    }

    setStarLetterSavingPostId(postId);

    const { data, error } = await runStarLetterQuery((columns) =>
      supabase
        .from("star_letters")
        .insert({
          post_id: postId,
          author_id: session.user.id,
          body,
        })
        .select(columns)
        .single(),
    );

    setStarLetterSavingPostId(null);

    if (error) {
      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
      return;
    }

    setStarLetterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [postId]: "",
    }));
    setOpenStarLetterPostId(postId);
    await refreshStarLettersForPost(postId);
    setStarLettersMessage("星文を送りました。");
  }

  async function handleStarLetterUpdate(event, letter) {
    event.preventDefault();
    setStarLettersMessage("");
    setStarLettersError("");

    if (!session?.user?.id) {
      setStarLettersError("ログインすると星文を編集できます。");
      return;
    }

    if (letter.authorId !== session.user.id) {
      setStarLettersError("自分の星文だけ編集できます。");
      return;
    }

    const body = (starLetterEditDrafts[letter.id] ?? "").trim();

    if (!body) {
      setStarLettersError("星文の本文を入力してください。");
      return;
    }

    if (getTrimmedCharacterLength(body) > STAR_LETTER_MAX_LENGTH) {
      setStarLettersError("星文は500文字以内で送ってください。");
      return;
    }

    setStarLetterUpdatingId(letter.id);

    try {
      if (letter.conversationAvailable) {
        await updateStarLetter(supabase, { starLetterId: letter.id, body });
      } else {
        const { error } = await supabase
          .from("star_letters")
          .update({ body })
          .eq("id", letter.id)
          .eq("author_id", session.user.id);

        if (error) {
          throw error;
        }
      }

      await refreshStarLettersForPost(letter.postId);
      handleCancelStarLetterEdit(letter.id);
      setStarLettersMessage("星文を保存しました。");
    } catch (error) {
      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
      await refreshStarLettersForPost(letter.postId);
    } finally {
      setStarLetterUpdatingId(null);
    }
  }

  async function handleStarLetterDelete(letter) {
    setStarLettersMessage("");
    setStarLettersError("");

    if (!session?.user?.id) {
      setStarLettersError("ログインすると星文を削除できます。");
      return;
    }

    if (letter.authorId !== session.user.id) {
      setStarLettersError("自分の星文だけ削除できます。");
      return;
    }

    const confirmed = window.confirm("この星文を削除しますか？");

    if (!confirmed) {
      return;
    }

    setStarLetterDeletingId(letter.id);

    try {
      if (letter.conversationAvailable) {
        await deleteStarLetter(supabase, letter.id);
      } else {
        const { error } = await supabase
          .from("star_letters")
          .delete()
          .eq("id", letter.id)
          .eq("author_id", session.user.id);

        if (error) {
          throw error;
        }
      }

      await refreshStarLettersForPost(letter.postId);
      setStarLetterEditDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[letter.id];
        return nextDrafts;
      });
      setEditingStarLetterId((currentId) => (currentId === letter.id ? null : currentId));
      setStarLettersMessage("星文を削除しました。");
    } catch (error) {
      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
      await refreshStarLettersForPost(letter.postId);
    } finally {
      setStarLetterDeletingId(null);
    }
  }

  function handleOpenMeteorDetail(postId) {
    if (!postId) {
      return;
    }

    const nextPath = buildMeteorPath(postId);

    if (window.location.pathname !== nextPath) {
      window.history.pushState({ hoshizoraRoute: "meteor" }, "", nextPath);
    }

    setRoute({ name: "meteor", postId, starLetterId: null, tagName: null, username: null });
    setShareMessage("");
    setShareError("");
    setOpenStarLetterPostId(postId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenStarLetterThread(postId, starLetterId) {
    if (!postId) {
      return;
    }

    const nextPath = buildStarLetterThreadPath(postId, starLetterId);

    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      window.history.pushState({ hoshizoraRoute: "meteor", starLetterId }, "", nextPath);
    }

    setRoute({ name: "meteor", postId, starLetterId: starLetterId ?? null, tagName: null, username: null });
    setOpenStarLetterPostId(postId);
    setShareMessage("");
    setShareError("");
    void refreshStarLettersForPost(postId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenStarProfile(username) {
    if (!username) {
      return;
    }

    const nextPath = buildStarProfilePath(username);

    if (window.location.pathname !== nextPath) {
      window.history.pushState({ hoshizoraRoute: "starProfile" }, "", nextPath);
    }

    setRoute({ name: "starProfile", postId: null, tagName: null, username: String(username).replace(/^@/, "") });
    setShareMessage("");
    setShareError("");
    setProfileShareMessage("");
    setProfileShareError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenMeteorTag(tagName) {
    const safeTagName = normalizeMeteorTagName(tagName);

    if (!safeTagName) {
      return;
    }

    const normalizedName = getMeteorTagSearchKey(safeTagName);
    const nextPath = buildMeteorTagPath(normalizedName);

    if (window.location.pathname !== nextPath) {
      window.history.pushState({ hoshizoraRoute: "meteorTag" }, "", nextPath);
    }

    setRoute({ name: "meteorTag", postId: null, tagName: normalizedName, username: null });
    setShareMessage("");
    setShareError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackFromMeteorDetail() {
    setShareMessage("");
    setShareError("");

    if (window.history.state?.hoshizoraRoute === "meteor") {
      window.history.back();
      return;
    }

    window.history.replaceState({}, "", "/");
    setRoute({ name: "home", legalPage: null, postId: null, tagName: null, username: null });
    setActiveTab("observe");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackFromStarProfile() {
    setProfileShareMessage("");
    setProfileShareError("");

    if (window.history.state?.hoshizoraRoute === "starProfile") {
      window.history.back();
      return;
    }

    window.history.replaceState({}, "", "/");
    setRoute({ name: "home", legalPage: null, postId: null, tagName: null, username: null });
    setActiveTab("observe");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackFromMeteorTag() {
    if (window.history.state?.hoshizoraRoute === "meteorTag") {
      window.history.back();
      return;
    }

    window.history.replaceState({}, "", "/");
    setRoute({ name: "home", legalPage: null, postId: null, tagName: null, username: null });
    setActiveTab("observe");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleShareMeteor(postId) {
    setShareMessage("");
    setShareError("");

    if (!postId) {
      setShareError("URLのコピーに失敗しました。");
      return;
    }

    const meteorUrl = `${window.location.origin}${buildMeteorPath(postId)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "星空Villageの流星便",
          text: "星空Villageで流星便を観測する",
          url: meteorUrl,
        });
        setShareMessage("流星便のURLをコピーしました。");
        return;
      }

      await navigator.clipboard.writeText(meteorUrl);
      setShareMessage("流星便のURLをコピーしました。");
    } catch (_error) {
      setShareError("URLのコピーに失敗しました。");
    }
  }

  async function handleShareStarProfile(username) {
    setProfileShareMessage("");
    setProfileShareError("");

    if (!username) {
      setProfileShareError("星座URLの共有にはusernameが必要です。");
      return;
    }

    const starProfileUrl = `${window.location.origin}${buildStarProfilePath(username)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "星空VillageのMy Constellation",
          text: "星空VillageのMy Constellationです。",
          url: starProfileUrl,
        });
        setProfileShareMessage("星座URLを共有できます");
        return;
      }

      await navigator.clipboard.writeText(starProfileUrl);
      setProfileShareMessage("星座URLをコピーしました");
    } catch (_error) {
      setProfileShareError("星座URLのコピーに失敗しました。");
    }
  }

  function handleOpenMediaViewer(items, index = 0) {
    const safeItems = (items ?? []).filter((item) => item?.url);

    if (safeItems.length === 0) {
      return;
    }

    setMediaViewer({
      index: clampNumber(index, 0, safeItems.length - 1),
      items: safeItems,
    });
  }

  function handleCloseMediaViewer() {
    setMediaViewer(null);
  }

  function handleOpenStarMovieObservation(post, media, triggerElement) {
    if (!post?.id || !media || !isStarMovieObservationViewport()) {
      return;
    }

    const observationId =
      globalThis.crypto?.randomUUID?.() ??
      `star-movie-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    starMovieObservationTriggerRef.current = triggerElement ?? null;
    starMovieObservationHistoryIdRef.current = observationId;
    window.dispatchEvent(
      new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, {
        detail: { mediaId: `star-movie-observation:${media.id}` },
      }),
    );
    window.history.pushState(
      createStarMovieObservationHistoryState(window.history.state, observationId),
      "",
      window.location.href,
    );
    setMediaViewer(null);
    setStarMovieObservation({
      media,
      postId: post.id,
    });
  }

  function handleCloseStarMovieObservation() {
    const historyId = starMovieObservationHistoryIdRef.current;
    const shouldStepBack = isStarMovieObservationHistoryState(window.history.state, historyId);
    const trigger = starMovieObservationTriggerRef.current;

    setStarMovieObservation(null);
    starMovieObservationTriggerRef.current = null;
    starMovieObservationHistoryIdRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus?.());

    if (shouldStepBack) {
      window.history.back();
    }
  }

  function handleMediaViewerStep(direction) {
    setMediaViewer((currentViewer) => {
      if (!currentViewer) {
        return currentViewer;
      }

      return {
        ...currentViewer,
        index: clampNumber(currentViewer.index + direction, 0, currentViewer.items.length - 1),
      };
    });
  }

  async function advanceInitialOnboarding(
    action,
    { navigateTo = "", status = null, targetId = null } = {},
  ) {
    const requestedUserId = session?.user?.id;

    if (
      !requestedUserId ||
      !onboardingProgressRef.current ||
      onboardingProgressRef.current.user_id !== requestedUserId ||
      onboardingAdvanceInFlightRef.current
    ) {
      return null;
    }

    onboardingAdvanceInFlightRef.current = true;
    setOnboardingBusy(true);
    setOnboardingError("");

    let data;
    let error;

    try {
      const result = await supabase.rpc("advance_initial_onboarding", {
        p_action: action,
        p_status: status,
        p_target_id: targetId,
      });
      data = result.data;
      error = result.error;
    } catch (requestError) {
      if (activeSessionUserIdRef.current === requestedUserId) {
        onboardingAdvanceInFlightRef.current = false;
        setOnboardingBusy(false);
        logSafeError(ERROR_OPERATION.ONBOARDING_SAVE, requestError);
        setOnboardingError(getUserFacingError(requestError, ERROR_OPERATION.ONBOARDING_SAVE));
      }
      return null;
    }

    if (activeSessionUserIdRef.current !== requestedUserId) {
      return null;
    }

    onboardingAdvanceInFlightRef.current = false;
    setOnboardingBusy(false);

    if (error) {
      if (!isMissingOnboardingSchemaError(error)) {
        logSafeError(ERROR_OPERATION.ONBOARDING_SAVE, error);
        setOnboardingError(getUserFacingError(error, ERROR_OPERATION.ONBOARDING_SAVE));
      }
      return null;
    }

    if (!["advanced", "already_completed"].includes(data?.outcome) || !data?.progress) {
      const outcomeMessages = {
        archive_not_found: "Archiveの保存をまだ確認できませんでした。",
        invalid_step: "入村案内の現在地を確認できませんでした。画面を開き直してください。",
        post_not_found: "流星便の保存をまだ確認できませんでした。",
        profile_incomplete: "名前とプロフィール画像を保存してから進んでください。",
        push_not_registered: "端末登録の完了をまだ確認できませんでした。",
        target_unavailable: "案内に使える流星便がまだありません。少し時間をおいてください。",
      };

      if (!["not_eligible", "not_authenticated"].includes(data?.outcome)) {
        setOnboardingError(
          outcomeMessages[data?.outcome] ?? "入村案内の進捗を確認できませんでした。もう一度お試しください。",
        );
      }
      return null;
    }

    if (!isOnboardingProgressForUser(data.progress, requestedUserId)) {
      setOnboardingError("入村案内の進捗を確認できませんでした。画面を開き直してください。");
      return null;
    }

    onboardingProgressRef.current = data.progress;
    setOnboardingProgress(data.progress);

    if (navigateTo) {
      handleTabChange(navigateTo);
    }

    return data.progress;
  }

  async function refreshInitialOnboardingProgress() {
    const userId = session?.user?.id;

    if (
      !userId ||
      !isOnboardingProgressForUser(onboardingProgressRef.current, userId)
    ) {
      return null;
    }

    const { data, error } = await supabase
      .from("user_onboarding_progress")
      .select(ONBOARDING_PROGRESS_SELECT_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (
      !canApplyOnboardingProgressResponse({
        activeUserId: activeSessionUserIdRef.current,
        progress: data,
        requestedUserId: userId,
      })
    ) {
      return null;
    }

    if (error) {
      if (!isMissingOnboardingSchemaError(error)) {
        logSafeError(ERROR_OPERATION.ONBOARDING_LOAD, error);
        setOnboardingError(getUserFacingError(error, ERROR_OPERATION.ONBOARDING_LOAD));
      }
      return null;
    }

    onboardingProgressRef.current = data;
    setOnboardingProgress(data);
    return data;
  }

  function handleOnboardingAdvance(action, options = {}) {
    return advanceInitialOnboarding(action, options);
  }

  function handleOnboardingNotificationSkip(status) {
    return advanceInitialOnboarding("skip_notifications", {
      navigateTo: "post",
      status,
    });
  }

  function handleOnboardingPermissionStatus(status) {
    if (onboardingProgressRef.current?.current_step === "notification_permission") {
      void advanceInitialOnboarding("notification_permission", { status });
    }
  }

  function handleOnboardingPushRegistered() {
    if (onboardingProgressRef.current?.current_step === "device_registration") {
      void advanceInitialOnboarding("push_registered");
    }
  }

  function handleOnboardingPushRegistrationFailed() {
    if (onboardingProgressRef.current?.current_step === "device_registration") {
      void advanceInitialOnboarding("push_registration_failed");
    }
  }

  function handleOnboardingPushTestResult(result) {
    if (onboardingProgressRef.current?.current_step !== "push_test") {
      return;
    }

    if (result === "succeeded") {
      void refreshInitialOnboardingProgress();
      return;
    }

    setOnboardingProgress((currentProgress) =>
      isOnboardingProgressForUser(currentProgress, session?.user?.id)
        ? {
            ...currentProgress,
            push_test_status: "failed",
          }
        : currentProgress,
    );
  }

  function handleTabChange(tabId) {
    if (route.name !== "home") {
      window.history.pushState({}, "", "/");
      setRoute({ name: "home", legalPage: null, postId: null, tagName: null, username: null });
    }

    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const auth = {
    error: authError,
    loading: authLoading,
    message: authMessage,
    onLogin: handleLogin,
    onLogout: handleLogout,
    onSignUp: handleSignUp,
    session,
    status: authStatus,
  };
  const onboardingIsActive = isOnboardingActive(sessionOnboardingProgress);
  const onboardingTarget = getOnboardingTarget(sessionOnboardingProgress, profileScreenMode);
  const onboardingState = {
    active: onboardingIsActive,
    currentStep: sessionOnboardingProgress?.current_step ?? "",
    targetPostId: sessionOnboardingProgress?.target_post_id ?? null,
  };
  const ownedProfileFrames = profileFrames.filter((frame) => ownedProfileFrameIds.includes(frame.id));
  const activeProfileFrame = getProfileFrameById(profileFrames, profile?.active_frame_id);
  const selectedProfileFrame = getProfileFrameById(profileFrames, profileForm.active_frame_id);
  const profileState = {
    canEdit: Boolean(session),
    data: profile,
    error: profileError,
    avatarAccept: AVATAR_ACCEPT,
    avatarFileName: avatarFile?.name ?? "",
    avatarPreviewUrl,
    avatarUploading,
    form: profileForm,
    loading: profileLoading,
    message: profileMessage,
    onArchiveNotificationSettingSubmit: handleArchiveNotificationSettingSubmit,
    onAvatarFileChange: handleProfileAvatarFileChange,
    onChange: handleProfileFieldChange,
    onBackToProfile: handleBackToProfile,
    onCancelEdit: handleCancelProfileEdit,
    onOpenFeedback: handleOpenFeedback,
    onOpenAvatar: handleOpenAvatarModal,
    onOpenGuide: handleOpenGuide,
    onOpenGuideAdmin: handleOpenGuideAdmin,
    onOpenSettings: handleOpenProfileSettings,
    onResonanceNotificationSettingSubmit: handleResonanceNotificationSettingSubmit,
    onShareProfile: handleShareStarProfile,
    onStartEdit: handleStartProfileEdit,
    onSubmit: handleProfileSubmit,
    activeFrame: activeProfileFrame,
    ownedProfileFrames,
    profileFramesAvailable,
    profileFramesError,
    profileFramesLoading,
    guideAdminLoading,
    guideIsAdmin,
    selectedFrame: selectedProfileFrame,
    saving: profileSaving,
    shareError: profileShareError,
    shareMessage: profileShareMessage,
    profileScreenMode,
    onboardingTarget,
  };
  const feedback = {
    body: feedbackBody,
    error: feedbackError,
    maxLength: FEEDBACK_MAX_LENGTH,
    message: feedbackMessage,
    onBack: handleBackToProfile,
    onBodyChange: setFeedbackBody,
    onSubmit: handleFeedbackSubmit,
    onTypeChange: setFeedbackType,
    saving: feedbackSaving,
    session,
    type: feedbackType,
    types: FEEDBACK_TYPES,
  };
  const postDraftTagValidation = validateMeteorTagsFromText(postDraft);
  const composer = {
    canSubmit:
      Boolean(session) &&
      Boolean(profile?.id) &&
      (Boolean(postDraft.trim()) || postImageDrafts.length > 0 || Boolean(postVideoDraft)) &&
      !postDraftTagValidation.error &&
      getTrimmedCharacterLength(postDraft) <= POST_MAX_LENGTH &&
      !postSaving &&
      !postVideoPreparing &&
      !postVideoTrimProcessing &&
      !postCoverCropPreparing,
    canPost: Boolean(session),
    draft: postDraft,
    error: postError,
    hasProfile: Boolean(profile?.id),
    imageAccept: METEOR_IMAGE_ACCEPT,
    imageDrafts: postImageDrafts,
    maxImages: METEOR_IMAGE_MAX_COUNT,
    message: postMessage,
    onChange: setPostDraft,
    onImageFileChange: handlePostImageFileChange,
    onMoveImage: handleMovePostImageDraft,
    onEditThumbnail: handleEditPostThumbnailDraft,
    onRemoveImage: handleRemovePostImageDraft,
    onRemoveThumbnail: handleRemovePostThumbnailDraft,
    onRemoveVideo: handleRemovePostVideoDraft,
    onSubmit: handlePostSubmit,
    onThumbnailFileChange: handlePostThumbnailFileChange,
    onVideoFileChange: handlePostVideoFileChange,
    saving: postSaving,
    tagError: postDraftTagValidation.error,
    tagMaxCount: METEOR_TAG_MAX_COUNT,
    thumbnailAccept: METEOR_THUMBNAIL_ACCEPT,
    thumbnailDraft: postThumbnailDraft,
    uploadProgress: postUploadProgress,
    videoAccept: METEOR_VIDEO_ACCEPT,
    videoDraft: postVideoDraft,
    videoPreparing: postVideoPreparing || postVideoTrimProcessing || postCoverCropPreparing,
    onboardingTarget,
  };
  const resonance = {
    error: resonanceError,
    message: resonanceMessage,
    onResonate: handleResonance,
    savingPostId: resonanceSavingPostId,
  };
  const archiveState = {
    activeView: archiveView,
    archivedPostIds: archivedPosts.map((post) => post.id),
    error: archivesError,
    items: archivedPosts,
    loading: archivesLoading,
    message: archivesMessage,
    onOpenStarLetterThread: handleOpenStarLetterThread,
    onToggleArchive: handleToggleArchive,
    onToggleStarLetterArchive: handleToggleStarLetterArchive,
    onViewChange: setArchiveView,
    savingPostId: archiveSavingPostId,
    session,
    starLetterItems: archivedStarLetters,
    starLetterError: archivedStarLettersError,
    starLetterLoading: archivedStarLettersLoading,
    starLetterSavingIds: starLetterArchivingIds,
    onboarding: onboardingState,
  };
  const postActions = {
    deletingId: postDeletingId,
    editingId: editingPostId,
    editDrafts: postEditDrafts,
    error: postActionError,
    message: postActionMessage,
    onCancelEdit: handleCancelPostEdit,
    onDelete: handlePostDelete,
    onEditChange: handlePostEditDraftChange,
    onOpenMeteorTag: handleOpenMeteorTag,
    onStartEdit: handleStartPostEdit,
    onUpdate: handlePostUpdate,
    session,
    updatingId: postUpdatingId,
  };
  const notificationState = {
    error: notificationsError,
    items: notifications,
    loading: notificationsLoading,
    message: notificationsMessage,
    onMarkRead: handleMarkNotificationRead,
    onOpenMeteorDetail: handleOpenMeteorDetail,
    onOpenStarLetterThread: handleOpenStarLetterThread,
    onOpenStarProfile: handleOpenStarProfile,
    session,
    onboarding: {
      ...onboardingState,
      onPermissionStatus: handleOnboardingPermissionStatus,
      onPushRegistrationFailed: handleOnboardingPushRegistrationFailed,
      onPushRegistered: handleOnboardingPushRegistered,
      onPushTestResult: handleOnboardingPushTestResult,
    },
    updatingId: notificationUpdatingId,
  };
  const starLetters = {
    canWrite: Boolean(session),
    drafts: starLetterDrafts,
    editingId: editingStarLetterId,
    editDrafts: starLetterEditDrafts,
    error: starLettersError,
    hasProfile: Boolean(profile?.id),
    itemsByPostId: starLettersByPostId,
    loading: starLettersLoading,
    message: starLettersMessage,
    onChange: handleStarLetterDraftChange,
    onArchive: handleToggleStarLetterArchive,
    onCancelEdit: handleCancelStarLetterEdit,
    onCancelReply: () => setStarLetterReplyComposer(null),
    onDelete: handleStarLetterDelete,
    onEditChange: handleStarLetterEditDraftChange,
    onStartEdit: handleStartStarLetterEdit,
    onStartReply: handleStartStarLetterReply,
    onResonate: handleStarLetterResonate,
    onRetry: refreshStarLettersForPost,
    onSubmit: handleStarLetterSubmit,
    onReplyChange: handleStarLetterReplyDraftChange,
    onReplySubmit: handleStarLetterReplySubmit,
    onToggle: handleToggleStarLetters,
    onUpdate: handleStarLetterUpdate,
    onOpenThread: handleOpenStarLetterThread,
    openPostId: openStarLetterPostId,
    replyComposer: starLetterReplyComposer,
    replySavingId: starLetterReplySavingId,
    resonatingIds: starLetterResonatingIds,
    archivingIds: starLetterArchivingIds,
    highlightedId: highlightedStarLetterId,
    session,
    deletingId: starLetterDeletingId,
    savingPostId: starLetterSavingPostId,
    updatingId: starLetterUpdatingId,
  };
  const ownPostState = {
    error: ownPostsError,
    items: ownPosts,
    loading: ownPostsLoading,
    session,
  };
  const myConstellationState = {
    activeView: myConstellationView,
    onViewChange: setMyConstellationView,
    resonatedPosts: {
      error: resonatedPostsError,
      items: resonatedPosts,
      loading: resonatedPostsLoading,
    },
    sentStarLetters: {
      error: sentStarLettersError,
      items: sentStarLetters,
      loading: sentStarLettersLoading,
    },
  };
  const posts = savedPosts;
  const starMovieObservationPost = starMovieObservation
    ? [
        detailPost,
        ...savedPosts,
        ...ownPosts,
        ...resonatedPosts,
        ...archivedPosts,
        ...publicProfilePosts,
        ...meteorTagPosts,
      ].find((post) => post?.id === starMovieObservation.postId) ?? null
    : null;
  const detailPostForScreen =
    detailPostId
      ? detailPost ??
        savedPosts.find((post) => post.id === detailPostId) ??
        ownPosts.find((post) => post.id === detailPostId) ??
        resonatedPosts.find((post) => post.id === detailPostId) ??
        archivedPosts.find((post) => post.id === detailPostId) ??
        meteorTagPosts.find((post) => post.id === detailPostId)
      : null;
  const meteorDetail = {
    error: detailPostError,
    loading: detailPostLoading,
    onBack: handleBackFromMeteorDetail,
    onShare: handleShareMeteor,
    post: detailPostForScreen,
    postId: detailPostId,
    shareError,
    shareMessage,
  };
  const meteorTagRoute = {
    error: meteorTagError,
    loading: meteorTagLoading,
    onBack: handleBackFromMeteorTag,
    onOpenMeteorDetail: handleOpenMeteorDetail,
    onOpenPostMedia: handleOpenMediaViewer,
    onOpenStarProfile: handleOpenStarProfile,
    posts: meteorTagPosts,
    tag: meteorTagView ?? {
      label: meteorTagRouteName ? `#${meteorTagRouteName}` : "",
      name: meteorTagRouteName ?? "",
      normalizedName: meteorTagRouteName ?? "",
    },
  };
  const publicStarProfile = {
    error: publicProfileError,
    loading: publicProfileLoading,
    onBack: handleBackFromStarProfile,
    onOpenAvatar: handleOpenAvatarModal,
    onOpenMeteorDetail: handleOpenMeteorDetail,
    onOpenPostMedia: handleOpenMediaViewer,
    onOpenStarProfile: handleOpenStarProfile,
    onShareProfile: handleShareStarProfile,
    posts: publicProfilePosts,
    profile: publicProfile,
    shareError: profileShareError,
    shareMessage: profileShareMessage,
    tags: publicProfileTags,
    username: publicProfileUsername,
  };
  const avatarCropState = {
    disabled: avatarCropPreparing,
    fileName: avatarCropFile?.name ?? "",
    frameSize: avatarCropFrameSize,
    imageSize: avatarImageSize,
    imageUrl: avatarCropPreviewUrl,
    isOpen: avatarCropModalOpen,
    offset: avatarCropOffset,
    onCancel: handleCancelAvatarCrop,
    onFrameSizeChange: handleAvatarCropFrameSizeChange,
    onImageLoad: handleAvatarCropImageLoad,
    onOffsetChange: handleAvatarCropOffsetChange,
    onReset: handleAvatarCropReset,
    onUse: handleUseCroppedAvatar,
    onZoomChange: handleAvatarCropZoomChange,
    preparing: avatarCropPreparing,
    zoom: avatarCropZoom,
  };
  const postCoverCropState = {
    disabled: postCoverCropPreparing,
    fileName: postCoverCropFile?.name ?? "",
    frameSize: postCoverCropFrameSize,
    imageSize: postCoverImageSize,
    imageUrl: postCoverCropPreviewUrl,
    isOpen: postCoverCropModalOpen,
    offset: postCoverCropOffset,
    onCancel: handleCancelPostCoverCrop,
    onFrameSizeChange: handlePostCoverCropFrameSizeChange,
    onImageLoad: handlePostCoverCropImageLoad,
    onOffsetChange: handlePostCoverCropOffsetChange,
    onReset: handlePostCoverCropReset,
    onUse: handleUsePostCoverCrop,
    onZoomChange: handlePostCoverCropZoomChange,
    preparing: postCoverCropPreparing,
    zoom: postCoverCropZoom,
  };
  const postVideoTrimState = {
    draft: postVideoTrimDraft,
    error: postVideoTrimError,
    isOpen: Boolean(postVideoTrimDraft),
    lengthSeconds: postVideoTrimLength,
    onCancel: handleCancelPostVideoTrim,
    onConfirm: handleUseTrimmedPostVideo,
    onLengthChange: handlePostVideoTrimLengthChange,
    onReset: handlePostVideoTrimReset,
    onStartChange: handlePostVideoTrimStartChange,
    processing: postVideoTrimProcessing,
    progress: postVideoTrimProgress,
    startSeconds: postVideoTrimStart,
  };
  const isPostEditor = route.name === "home" && activeTab === "post";

  return (
    <div
      className={`app-shell relative isolate bg-night-950 text-starlight ${
        isPostEditor
          ? "post-editor-shell overflow-hidden pb-0"
          : "app-shell-with-bottom-nav min-h-screen overflow-x-hidden pb-28"
      }`}
    >
      <SkyBackdrop />
      <StardustForeground />

      <div
        className={`app-main-content relative z-10 mx-auto w-full ${
          isPostEditor ? "h-full min-h-0 max-w-none overflow-hidden px-0 py-0" : "min-h-screen max-w-[1180px] px-3 py-3 sm:px-4 lg:py-5"
        }`}
      >
        {!isPostEditor && <AppHeader auth={auth} />}

        <TabContent
          activeTab={activeTab}
          onboarding={onboardingState}
          auth={auth}
          composer={composer}
          feedback={feedback}
          posts={posts}
          postsError={postsError}
          postsLoading={postsLoading}
          ownPosts={ownPostState}
          myConstellation={myConstellationState}
          profile={profileState}
          archive={archiveState}
          postActions={postActions}
          resonance={resonance}
          notifications={notificationState}
          starLetters={starLetters}
          meteorDetail={meteorDetail}
          meteorTagRoute={meteorTagRoute}
          publicStarProfile={publicStarProfile}
          route={route}
          onBackFromPost={() => handleTabChange("observe")}
          onOpenMeteorDetail={handleOpenMeteorDetail}
          onOpenStarMovieObservation={handleOpenStarMovieObservation}
          onOpenPostMedia={handleOpenMediaViewer}
          onOpenStarProfile={handleOpenStarProfile}
        />
      </div>

      {!isPostEditor && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onboardingTarget={onboardingTarget}
        />
      )}
      <AvatarPreviewModal avatar={avatarModal} onClose={handleCloseAvatarModal} />
      <AvatarCropModal crop={avatarCropState} />
      <PostCoverCropModal crop={postCoverCropState} />
      <PostVideoTrimModal trim={postVideoTrimState} />
      <PostMediaViewerModal
        viewer={mediaViewer}
        onClose={handleCloseMediaViewer}
        onStep={handleMediaViewerStep}
      />
      <StarMovieObservationMode
        media={starMovieObservation?.media ?? null}
        onClose={handleCloseStarMovieObservation}
        post={starMovieObservationPost}
      />
      {onboardingIsActive && !onboardingLoading ? (
        <InteractiveOnboarding
          busy={onboardingBusy}
          displayName={sessionOnboardingProfile?.display_name ?? ""}
          error={onboardingError}
          onAdvance={handleOnboardingAdvance}
          onSkipNotifications={handleOnboardingNotificationSkip}
          progress={{
            ...sessionOnboardingProgress,
            target: onboardingTarget,
          }}
        />
      ) : null}
    </div>
  );
}

function SkyBackdrop() {
  return (
    <div className="cosmic-background pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="cosmic-haze" />
      <div className="moon" />
      <div className="stars-layer" />
      <div className="distant-stars" />
      <div className="shooting-star shooting-star-a" />
      <div className="shooting-star shooting-star-b" />
      <div className="distant-village">
        <span className="village-window village-window-a" />
        <span className="village-window village-window-b" />
        <span className="village-window village-window-c" />
        <span className="village-window village-window-d" />
        <span className="village-window village-window-e" />
      </div>
    </div>
  );
}

function StardustForeground() {
  return <div className="foreground-stardust pointer-events-none fixed inset-0 z-30" aria-hidden="true" />;
}

function AppHeader({ auth }) {
  if (auth.session) {
    return null;
  }

  return (
    <header className="glass-panel mb-4 p-4" data-auth-panel="visible">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-comet via-aurora to-sakura text-lg font-black text-night-950 shadow-glow">
            星
          </div>
          <div>
            <p className="text-xs font-bold normal-case text-comet">Re:AiSNS</p>
            <h1 className="text-xl font-black leading-tight">星空Village</h1>
          </div>
        </div>

        <AuthPanel auth={auth} />
      </div>
    </header>
  );
}

function TabContent({
  activeTab,
  archive,
  auth,
  composer,
  feedback,
  onboarding,
  meteorDetail,
  meteorTagRoute,
  myConstellation,
  notifications,
  onBackFromPost,
  onOpenMeteorDetail,
  onOpenPostMedia,
  onOpenStarMovieObservation,
  onOpenStarProfile,
  ownPosts,
  postActions,
  posts,
  postsError,
  postsLoading,
  profile,
  publicStarProfile,
  resonance,
  route,
  starLetters,
}) {
  if (route.name === "legal") {
    return <LegalDocumentScreen page={route.legalPage} />;
  }

  if (route.name === "meteor") {
    return (
      <MeteorDetailScreen
        archive={archive}
        detail={meteorDetail}
        onOpenPostMedia={onOpenPostMedia}
        onOpenStarMovieObservation={onOpenStarMovieObservation}
        onOpenStarProfile={onOpenStarProfile}
        postActions={postActions}
        resonance={resonance}
        starLetters={starLetters}
      />
    );
  }

  if (route.name === "starProfile") {
    return (
      <PublicStarProfileScreen
        archive={archive}
        onOpenStarMovieObservation={onOpenStarMovieObservation}
        onOpenPostMedia={onOpenPostMedia}
        postActions={postActions}
        profileRoute={publicStarProfile}
        resonance={resonance}
        starLetters={starLetters}
      />
    );
  }

  if (route.name === "meteorTag") {
    return (
      <MeteorTagScreen
        archive={archive}
        meteorTagRoute={meteorTagRoute}
        onOpenStarMovieObservation={onOpenStarMovieObservation}
        postActions={postActions}
        resonance={resonance}
        starLetters={starLetters}
      />
    );
  }

  if (activeTab === "rconnect") {
    return <RConnectScreen notifications={notifications} />;
  }

  if (activeTab === "post") {
    return <PostScreen composer={composer} onBack={onBackFromPost} />;
  }

  if (activeTab === "archive") {
    return (
      <ArchiveScreen
        archive={archive}
        onboarding={onboarding}
        onOpenMeteorDetail={onOpenMeteorDetail}
        onOpenPostMedia={onOpenPostMedia}
        onOpenStarMovieObservation={onOpenStarMovieObservation}
        onOpenStarProfile={onOpenStarProfile}
        postActions={postActions}
        resonance={resonance}
        starLetters={starLetters}
      />
    );
  }

  if (activeTab === "profile") {
    return (
      <ProfileScreen
        archive={archive}
        auth={auth}
        feedback={feedback}
        myConstellation={myConstellation}
        ownPosts={ownPosts}
        onOpenMeteorDetail={onOpenMeteorDetail}
        onOpenPostMedia={onOpenPostMedia}
        onOpenStarMovieObservation={onOpenStarMovieObservation}
        onOpenStarProfile={onOpenStarProfile}
        postActions={postActions}
        profile={profile}
        resonance={resonance}
        starLetters={starLetters}
      />
    );
  }

  return (
    <ObserveScreen
      archive={archive}
      onboarding={onboarding}
      postActions={postActions}
      posts={posts}
      postsError={postsError}
      postsLoading={postsLoading}
      onOpenMeteorDetail={onOpenMeteorDetail}
      onOpenPostMedia={onOpenPostMedia}
      onOpenStarMovieObservation={onOpenStarMovieObservation}
      onOpenStarProfile={onOpenStarProfile}
      resonance={resonance}
      starLetters={starLetters}
    />
  );
}

function LegalDocumentScreen({ page }) {
  const document =
    page === "privacy"
      ? {
          eyebrow: "privacy",
          markdown: privacyPolicyMarkdown,
          title: "プライバシーポリシー",
        }
      : {
          eyebrow: "terms",
          markdown: termsOfServiceMarkdown,
          title: "利用規約",
        };

  return (
    <main className="mx-auto min-w-0 max-w-3xl pb-10">
      <Panel eyebrow={document.eyebrow} title={document.title}>
        <div className="mb-4 flex flex-wrap gap-2">
          <a
            className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            href="/"
          >
            星空Villageへ戻る
          </a>
          <a
            className="min-h-9 rounded-full border border-comet/20 bg-comet/10 px-3 py-2 text-xs font-black text-comet transition hover:border-comet/35 hover:bg-comet/15 hover:text-white"
            href={page === "privacy" ? "/terms" : "/privacy"}
          >
            {page === "privacy" ? "利用規約を見る" : "プライバシーポリシーを見る"}
          </a>
        </div>
        <MarkdownDocument markdown={document.markdown} />
      </Panel>
    </main>
  );
}

function MarkdownDocument({ markdown }) {
  const elements = [];
  let paragraphLines = [];
  let listItems = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    const lines = paragraphLines;
    const key = `p-${elements.length}`;

    elements.push(
      <p className="text-sm leading-7 text-slate-300" key={key}>
        {lines.map((line, index) => (
          <span key={`${key}-${index}`}>
            {index > 0 && <br />}
            {line}
          </span>
        ))}
      </p>,
    );
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    const key = `ul-${elements.length}`;

    elements.push(
      <ul className="list-disc space-y-1 pl-5 text-sm leading-7 text-slate-300" key={key}>
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{item}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  for (const rawLine of String(markdown ?? "").split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^-{3,}$/.test(trimmedLine)) {
      flushParagraph();
      flushList();
      elements.push(<hr className="border-white/10" key={`hr-${elements.length}`} />);
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];

      if (level === 1) {
        elements.push(
          <h1 className="text-xl font-black leading-8 text-white" key={`h1-${elements.length}`}>
            {headingText}
          </h1>,
        );
      } else if (level === 2) {
        elements.push(
          <h2 className="pt-2 text-base font-black leading-7 text-white" key={`h2-${elements.length}`}>
            {headingText}
          </h2>,
        );
      } else {
        elements.push(
          <h3 className="text-sm font-black leading-7 text-comet" key={`h3-${elements.length}`}>
            {headingText}
          </h3>,
        );
      }
      continue;
    }

    if (trimmedLine.startsWith("- ")) {
      flushParagraph();
      listItems.push(trimmedLine.slice(2));
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return <div className="space-y-4">{elements}</div>;
}

function ObserveScreen({
  archive,
  onboarding,
  onOpenMeteorDetail,
  onOpenPostMedia,
  onOpenStarMovieObservation,
  onOpenStarProfile,
  postActions,
  posts,
  postsError,
  postsLoading,
  resonance,
  starLetters,
}) {
  return (
    <main className="observe-screen mx-auto min-w-0 max-w-3xl border-x border-white/10">
      <Timeline
        archive={archive}
        onboarding={onboarding}
        onOpenMeteorDetail={onOpenMeteorDetail}
        onOpenPostMedia={onOpenPostMedia}
        onOpenStarMovieObservation={onOpenStarMovieObservation}
        onOpenStarProfile={onOpenStarProfile}
        postActions={postActions}
        posts={posts}
        postsError={postsError}
        postsLoading={postsLoading}
        resonance={resonance}
        starLetters={starLetters}
      />
    </main>
  );
}

const METEOR_COMPOSER_FORM_ID = "meteor-composer-form";

function PostScreen({ composer, onBack }) {
  return (
    <main className="compose-screen fixed inset-0 z-20 overflow-hidden bg-night-950/35">
      <header className="compose-header fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-night-950/90 px-4 backdrop-blur-2xl">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <button
            className="min-h-10 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-200 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={onBack}
            type="button"
          >
            ← 戻る
          </button>
          <h2 className="truncate text-center text-base font-black text-white">流星便を作成</h2>
          <button
            className="min-h-10 rounded-full bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
            disabled={!composer.canSubmit}
            form={METEOR_COMPOSER_FORM_ID}
            type="submit"
          >
            {composer.saving ? "送信中" : "放流"}
          </button>
        </div>
      </header>
      <Composer composer={composer} />
    </main>
  );
}

function PlaceholderScreen({ eyebrow, title, text, note }) {
  return (
    <main className="mx-auto max-w-3xl">
      <section className="glass-panel p-5 sm:p-6">
        <p className="text-xs font-bold uppercase text-comet">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">{text}</p>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-400">
          {note}
        </div>
      </section>
    </main>
  );
}

function MeteorDetailScreen({
  archive,
  detail,
  onOpenPostMedia,
  onOpenStarMovieObservation,
  onOpenStarProfile,
  postActions,
  resonance,
  starLetters,
}) {
  const post = detail.post;
  const isDeleted = Boolean(post?.deletedAt);

  return (
    <main className="mx-auto max-w-3xl">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5">
        <button
          className="min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
          onClick={detail.onBack}
          type="button"
        >
          戻る
        </button>
        <button
          className="min-h-10 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!post}
          onClick={() => detail.onShare(post?.id)}
          type="button"
        >
          共有
        </button>
      </section>

      <section className="space-y-4 px-3 pb-10 sm:px-5">
        {(detail.loading || detail.error || detail.shareMessage || detail.shareError) && (
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              detail.error || detail.shareError
                ? "border-sakura/30 bg-sakura/10 text-sakura"
                : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {detail.error || detail.shareError || detail.shareMessage || "流星便を読み込み中..."}
          </p>
        )}

        {postActions?.message || postActions?.error ? (
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              postActions.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {postActions.error || postActions.message}
          </p>
        ) : null}

        {isDeleted ? (
          <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            この流星便は削除されました。
          </div>
        ) : null}

        {!detail.loading && !detail.error && !post ? (
          <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            この流星便は見つかりませんでした。
          </div>
        ) : null}

        {post && !isDeleted ? (
          <PostCard
            archive={archive}
            detailMode
            onOpenAuthorProfile={onOpenStarProfile}
            onOpenMedia={onOpenPostMedia}
            onOpenStarMovieObservation={onOpenStarMovieObservation}
            postActions={postActions}
            post={post}
            resonance={resonance}
            showStarLetters
            starLetters={starLetters}
          />
        ) : null}
      </section>
    </main>
  );
}

function PublicStarProfileScreen({
  archive,
  onOpenStarMovieObservation,
  postActions,
  profileRoute,
  resonance,
  starLetters,
}) {
  const profile = profileRoute.profile;
  const isNotFound = profileRoute.error === "not-found";
  const displayName = profile?.display_name || defaultProfileView.display_name;

  return (
    <main className="mx-auto max-w-3xl">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5">
        <button
          className="min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
          onClick={profileRoute.onBack}
          type="button"
        >
          観測へ戻る
        </button>
        <button
          className="min-h-10 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!profile?.username}
          onClick={() => profileRoute.onShareProfile(profile?.username)}
          type="button"
        >
          共有
        </button>
      </section>

      <section className="space-y-5 px-3 pb-10 sm:px-5">
        {(profileRoute.loading || profileRoute.error || profileRoute.shareMessage || profileRoute.shareError) && (
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              profileRoute.error || profileRoute.shareError
                ? "border-sakura/30 bg-sakura/10 text-sakura"
                : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {isNotFound
              ? "この星座はまだ見つかりませんでした。"
              : profileRoute.error || profileRoute.shareError || profileRoute.shareMessage || "星座を探しています…"}
          </p>
        )}

        {isNotFound ? (
          <section className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            <h2 className="text-xl font-black text-white">この星座はまだ見つかりませんでした。</h2>
            <p className="mt-3">URLが間違っているか、まだ作成されていない星座かもしれません。</p>
            <button
              className="mt-5 min-h-10 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15"
              onClick={profileRoute.onBack}
              type="button"
            >
              観測へ戻る
            </button>
          </section>
        ) : null}

        {profile && !isNotFound ? (
          <>
            <PublicProfileCard
              displayName={displayName}
              onOpenAvatar={() => profileRoute.onOpenAvatar(profile.avatar_url, `${displayName}の星影`)}
              onShare={() => profileRoute.onShareProfile(profile.username)}
              profile={profile}
              tags={profileRoute.tags}
            />

            <Panel title={`${displayName}の流星便`} eyebrow="public meteor letters">
              {profileRoute.posts.length === 0 ? (
                <p className="text-sm leading-7 text-slate-400">公開されている流星便はまだありません。</p>
              ) : (
                <div className="space-y-5">
                  {profileRoute.posts.map((post) => (
                    <PostCard
                      archive={archive}
                      key={post.id ?? post.handle}
                      onOpenAuthorProfile={profileRoute.onOpenStarProfile}
                      onOpenDetail={profileRoute.onOpenMeteorDetail}
                      onOpenMedia={profileRoute.onOpenPostMedia}
                      onOpenStarMovieObservation={onOpenStarMovieObservation}
                      postActions={postActions}
                      post={post}
                      resonance={resonance}
                      starLetters={starLetters}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </>
        ) : null}
      </section>
    </main>
  );
}

function MeteorTagScreen({
  archive,
  meteorTagRoute,
  onOpenStarMovieObservation,
  postActions,
  resonance,
  starLetters,
}) {
  const tagLabel = meteorTagRoute.tag?.label || getMeteorTagLabel(meteorTagRoute.tag?.name) || "#流星タグ";

  return (
    <main className="mx-auto max-w-3xl">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5">
        <button
          className="min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-amber-300/35 hover:bg-amber-300/10 hover:text-amber-100"
          onClick={meteorTagRoute.onBack}
          type="button"
        >
          戻る
        </button>
      </section>

      <section className="space-y-5 px-3 pb-10 sm:px-5">
        <div className="glass-panel p-5 sm:p-6">
          <p className="text-xs font-bold normal-case text-amber-200">meteor tag</p>
          <h2 className="mt-2 break-words text-2xl font-black text-amber-100 sm:text-3xl">{tagLabel}</h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            同じ流星タグが添えられた公開流星便を、新しい順に観測します。
          </p>
        </div>

        {(meteorTagRoute.loading || meteorTagRoute.error) && (
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              meteorTagRoute.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-amber-300/25 bg-amber-300/10 text-amber-100"
            }`}
          >
            {meteorTagRoute.error || "流星タグを観測中..."}
          </p>
        )}

        {!meteorTagRoute.loading && !meteorTagRoute.error && meteorTagRoute.posts.length === 0 ? (
          <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            この流星タグの公開流星便はまだありません。
          </div>
        ) : (
          meteorTagRoute.posts.map((post) => (
            <PostCard
              archive={archive}
              key={post.id ?? post.handle}
              onOpenAuthorProfile={meteorTagRoute.onOpenStarProfile}
              onOpenDetail={meteorTagRoute.onOpenMeteorDetail}
              onOpenMedia={meteorTagRoute.onOpenPostMedia}
              onOpenStarMovieObservation={onOpenStarMovieObservation}
              postActions={postActions}
              post={post}
              resonance={resonance}
              starLetters={starLetters}
            />
          ))
        )}
      </section>
    </main>
  );
}

function AvatarCropModal({ crop }) {
  const onCancelRef = useRef(crop.onCancel);

  useEffect(() => {
    onCancelRef.current = crop.onCancel;
  }, [crop.onCancel]);

  useEffect(() => {
    if (!crop.isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCancelRef.current();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [crop.isOpen]);

  if (!crop.isOpen || !crop.imageUrl) {
    return null;
  }

  return (
    <div
      aria-label="星影を切り取る"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-night-950/88 px-3 py-4 backdrop-blur-xl"
      role="dialog"
    >
      <div className="mx-auto flex min-h-full max-w-xl items-center">
        <div className="w-full rounded-3xl border border-white/15 bg-night-950/90 p-4 shadow-[0_0_70px_rgba(125,223,255,0.18)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-comet">星影を切り取る</p>
              <h2 className="mt-1 text-xl font-black text-white">星影を切り取る</h2>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                ドラッグして位置を調整し、スライダーで大きさを変えられます。
              </p>
            </div>
            <button
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={crop.preparing}
              onClick={crop.onCancel}
              type="button"
            >
              キャンセル
            </button>
          </div>

          <AvatarCropper
            disabled={crop.disabled}
            frameSize={crop.frameSize}
            imageSize={crop.imageSize}
            imageUrl={crop.imageUrl}
            offset={crop.offset}
            onFrameSizeChange={crop.onFrameSizeChange}
            onImageLoad={crop.onImageLoad}
            onOffsetChange={crop.onOffsetChange}
            onReset={crop.onReset}
            onZoomChange={crop.onZoomChange}
            zoom={crop.zoom}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs font-bold text-slate-500">{crop.fileName}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing}
                onClick={crop.onCancel}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing || !crop.imageSize}
                onClick={crop.onUse}
                type="button"
              >
                {crop.preparing ? "準備中..." : "この星影を使う"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCoverCropModal({ crop }) {
  const onCancelRef = useRef(crop.onCancel);

  useEffect(() => {
    onCancelRef.current = crop.onCancel;
  }, [crop.onCancel]);

  useEffect(() => {
    if (!crop.isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCancelRef.current();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [crop.isOpen]);

  if (!crop.isOpen || !crop.imageUrl) {
    return null;
  }

  return (
    <div
      aria-label="星映の表紙を切り取る"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-night-950/88 px-3 py-4 backdrop-blur-xl"
      role="dialog"
    >
      <div className="mx-auto flex min-h-full max-w-2xl items-center">
        <div className="w-full rounded-3xl border border-white/15 bg-night-950/90 p-4 shadow-[0_0_70px_rgba(125,223,255,0.18)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-comet">星映の表紙</p>
              <h2 className="mt-1 text-xl font-black text-white">星映の表紙を切り取る</h2>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                ドラッグして位置を調整し、スライダーで大きさを変えられます。
              </p>
            </div>
            <button
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={crop.preparing}
              onClick={crop.onCancel}
              type="button"
            >
              キャンセル
            </button>
          </div>

          <PostCoverCropper
            disabled={crop.disabled}
            frameSize={crop.frameSize}
            imageSize={crop.imageSize}
            imageUrl={crop.imageUrl}
            offset={crop.offset}
            onFrameSizeChange={crop.onFrameSizeChange}
            onImageLoad={crop.onImageLoad}
            onOffsetChange={crop.onOffsetChange}
            onReset={crop.onReset}
            onZoomChange={crop.onZoomChange}
            zoom={crop.zoom}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs font-bold text-slate-500">{crop.fileName}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing}
                onClick={crop.onCancel}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={crop.preparing || !crop.imageSize}
                onClick={crop.onUse}
                type="button"
              >
                {crop.preparing ? "準備中..." : "この表紙にする"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostVideoTrimModal({ trim }) {
  const videoRef = useRef(null);
  const onCancelRef = useRef(trim.onCancel);
  const draft = trim.draft;
  const durationSeconds = Number(draft?.durationSeconds || 0);
  const maxLength = Math.min(METEOR_VIDEO_MAX_DURATION_SECONDS, Math.max(0.5, durationSeconds));
  const selectedLength = clampNumber(Number(trim.lengthSeconds) || maxLength, 0.5, maxLength);
  const maxStart = Math.max(0, durationSeconds - selectedLength);
  const startSeconds = clampNumber(trim.startSeconds, 0, maxStart);
  const endSeconds = Math.min(durationSeconds, startSeconds + selectedLength);

  useEffect(() => {
    onCancelRef.current = trim.onCancel;
  }, [trim.onCancel]);

  useEffect(() => {
    if (!trim.isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCancelRef.current();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [trim.isOpen]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !trim.isOpen) {
      return;
    }

    video.pause();
    video.currentTime = startSeconds;
  }, [startSeconds, trim.isOpen]);

  if (!trim.isOpen || !draft?.previewUrl) {
    return null;
  }

  function handlePreviewRange() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = startSeconds;
    video.play?.().catch(() => {
      // Controls remain available if the browser blocks programmatic play.
    });
  }

  function handleTimeUpdate(event) {
    const video = event.currentTarget;

    if (video.currentTime >= endSeconds) {
      video.pause();
      video.currentTime = endSeconds;
    }
  }

  return (
    <div
      aria-label="星映を切り取る"
      aria-modal="true"
      className="fixed inset-0 z-[60] overflow-y-auto bg-night-950/90 px-3 py-4 backdrop-blur-xl"
      role="dialog"
    >
      <div className="mx-auto flex min-h-full max-w-2xl items-center">
        <div className="w-full rounded-3xl border border-white/15 bg-night-950/92 p-4 shadow-[0_0_80px_rgba(125,223,255,0.18)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-aurora">星映（ほしうつし）</p>
              <h2 className="mt-1 text-xl font-black text-white">星映を切り取る</h2>
              <p className="mt-2 text-xs leading-6 text-slate-400">いちばん光る35秒を選んでください。</p>
            </div>
            <button
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={trim.onCancel}
              type="button"
            >
              キャンセル
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              className="aspect-video w-full bg-black object-contain"
              controls
              onTimeUpdate={handleTimeUpdate}
              playsInline
              preload="metadata"
              ref={videoRef}
              src={draft.previewUrl}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-aurora/20 bg-aurora/10 p-3">
            <div className="grid gap-2 text-xs font-bold text-slate-300 sm:grid-cols-2">
              <p>動画全体の時間：{formatMediaDuration(durationSeconds)}</p>
              <p>選択範囲の長さ：{formatMediaDuration(selectedLength)}</p>
              <p>選択開始時間：{formatMediaDuration(startSeconds)}</p>
              <p>選択終了時間：{formatMediaDuration(endSeconds)}</p>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
                <span>選択開始</span>
                <span>{formatMediaDuration(startSeconds)}</span>
              </div>
              <input
                aria-label="星映の開始位置"
                className="w-full accent-cyan-300"
                disabled={trim.processing}
                max={maxStart}
                min={0}
                onChange={(event) => trim.onStartChange(event.target.value)}
                step="0.1"
                type="range"
                value={startSeconds}
              />
              <div className="mt-2 flex justify-between text-[11px] font-black text-slate-500">
                <span>0:00</span>
                <span>{formatMediaDuration(maxStart)}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
                <span>選択範囲の長さ</span>
                <span>{formatMediaDuration(selectedLength)}</span>
              </div>
              <input
                aria-label="星映の選択範囲の長さ"
                className="w-full accent-cyan-300"
                disabled={trim.processing}
                max={maxLength}
                min={0.5}
                onChange={(event) => trim.onLengthChange(event.target.value)}
                step="0.1"
                type="range"
                value={selectedLength}
              />
              <div className="mt-2 flex justify-between text-[11px] font-black text-slate-500">
                <span>0.5秒</span>
                <span>{formatMediaDuration(maxLength)}</span>
              </div>
            </div>

            {trim.processing && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black text-comet">
                  <span>星映を切り取り中...</span>
                  <span>{Math.round(trim.progress * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-comet via-aurora to-sakura transition-[width]"
                    style={{ width: `${Math.round(trim.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {trim.error && (
              <p className="mt-3 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
                {trim.error}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs font-bold text-slate-500">{draft.name}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={trim.processing}
                onClick={trim.onReset}
                type="button"
              >
                位置をリセット
              </button>
              <button
                className="min-h-10 rounded-2xl border border-comet/25 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={trim.processing}
                onClick={handlePreviewRange}
                type="button"
              >
                選択範囲を再生
              </button>
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={trim.onCancel}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={trim.processing || selectedLength <= 0 || selectedLength > METEOR_VIDEO_MAX_DURATION_SECONDS + 0.1}
                onClick={trim.onConfirm}
                type="button"
              >
                決定
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicProfileCard({ displayName, onOpenAvatar, onShare, profile, tags }) {
  const username = profile.username ? `@${profile.username}` : defaultProfileView.username;
  const bio = profile.bio || defaultProfileView.bio;
  const avatar = getAvatarText(displayName);
  const visibleTags = (tags ?? []).filter((tag) => tag?.label);
  const canOpenAvatar = Boolean(profile.avatar_url);

  return (
    <section className="glass-panel overflow-hidden">
      <div className="h-20 bg-[radial-gradient(circle_at_24%_30%,rgba(125,223,255,0.55),transparent_28%),linear-gradient(120deg,rgba(159,140,255,0.36),rgba(255,139,207,0.18))]" />
      <div className="p-4 pt-0">
        <div className="-mt-7 flex items-end justify-between gap-3">
          {canOpenAvatar ? (
            <button
              aria-label={`${displayName}の星影を見る`}
              className="rounded-3xl outline-none transition hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-comet/25"
              onClick={onOpenAvatar}
              type="button"
            >
              <AvatarFrame avatar={avatar} avatarUrl={profile.avatar_url} className="h-16 w-16 rounded-3xl text-xl" frame={profile.activeFrame} />
            </button>
          ) : (
            <AvatarFrame avatar={avatar} avatarUrl={profile.avatar_url} className="h-16 w-16 rounded-3xl text-xl" frame={profile.activeFrame} />
          )}
          <button
            className="mb-2 min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15"
            onClick={onShare}
            type="button"
          >
            共有
          </button>
        </div>
        <div className="mt-3">
          <p className="text-xs font-black text-comet">My Constellation</p>
          <h2 className="mt-1 text-lg font-black text-white">{displayName}</h2>
          <p className="text-sm text-slate-400">{username}</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">{bio}</p>
          {profile.constellation_note && (
            <div className="mt-3 rounded-2xl border border-comet/20 bg-comet/10 px-3 py-2">
              <p className="text-[11px] font-black text-comet">My Star Chart</p>
              <p className="mt-1 text-xs leading-5 text-slate-200">{profile.constellation_note}</p>
            </div>
          )}
          {visibleTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {visibleTags.map((tag) => (
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-300" key={tag.id}>
                  {tag.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AvatarPreviewModal({ avatar, onClose }) {
  if (!avatar?.url) {
    return null;
  }

  return (
    <div
      aria-label="星影を見る"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/85 px-4 py-8 backdrop-blur-xl"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-3xl rounded-3xl border border-white/15 bg-night-950/80 p-3 shadow-[0_0_60px_rgba(125,223,255,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-black text-comet">星影を見る</p>
          <button
            className="min-h-9 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            閉じる
          </button>
        </div>
        <div className="grid max-h-[78vh] place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <img alt={avatar.label ?? "星影"} className="max-h-[78vh] w-full object-contain" src={avatar.url} />
        </div>
      </div>
    </div>
  );
}

const PUSH_SUBSCRIPTION_STATUS_LABELS = {
  checking: "端末登録: 確認中",
  unregistered: "端末登録: 未登録",
  registered: "端末登録: 登録済み",
  account_mismatch: "端末登録: 別のアカウントに登録済み",
  failed: "端末登録: 登録に失敗しました",
  configMissing: "端末登録: VAPID key未設定",
  unsupported: "端末登録: この表示環境では未対応",
};

function PushNotificationTestCard({ onboarding, session }) {
  const [permission, setPermission] = useState(() => getPushNotificationPermission());
  const [subscriptionStatus, setSubscriptionStatus] = useState("checking");
  const [subscriptionCheckVersion, setSubscriptionCheckVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState(() =>
    isPushNotificationSupported()
      ? ""
      : "この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。",
  );
  const [isWorking, setIsWorking] = useState(false);
  const isSupported = permission !== "unsupported";
  const isSubscriptionSupported = isPushSubscriptionSupported();
  const permissionLabel = getPushNotificationPermissionLabel(permission);
  const subscriptionLabel = PUSH_SUBSCRIPTION_STATUS_LABELS[subscriptionStatus] ?? PUSH_SUBSCRIPTION_STATUS_LABELS.unregistered;

  useEffect(() => {
    function refreshPermission() {
      setPermission(getPushNotificationPermission());
    }

    refreshPermission();
    window.addEventListener("focus", refreshPermission);

    return () => {
      window.removeEventListener("focus", refreshPermission);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshSubscriptionStatus() {
      setPermission(getPushNotificationPermission());
      setStatusMessage("");

      if (!isPushSubscriptionSupported()) {
        if (!cancelled) {
          setSubscriptionStatus("unsupported");
        }
        return;
      }

      setSubscriptionStatus("checking");

      try {
        const registrationStatus = await getPushSubscriptionRegistrationStatus({
          accessToken: session?.access_token,
        });

        if (!cancelled) {
          setSubscriptionStatus(registrationStatus.status);
          if (registrationStatus.status === "registered") {
            onboarding?.onPushRegistered?.();
          }
          if (registrationStatus.status === "account_mismatch") {
            setStatusMessage("この端末は別のアカウントに通知登録されています");
          } else if (registrationStatus.status === "unregistered" && registrationStatus.hasSubscription) {
            setStatusMessage("この端末には以前の通知購読があります。通知端末を再登録してください。");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSubscriptionStatus("failed");
          const isAccountMismatch = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_ACCOUNT_MISMATCH");
          setStatusMessage(
            isAccountMismatch
              ? "この端末は別のアカウントに登録されています。"
              : "端末登録状態を確認できませんでした。",
          );
        }
      }
    }

    refreshSubscriptionStatus();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, subscriptionCheckVersion]);

  useEffect(() => {
    if (onboarding?.currentStep === "notification_permission") {
      onboarding.onPermissionStatus?.(getPushNotificationPermission());
    }

    if (onboarding?.currentStep === "device_registration" && subscriptionStatus === "registered") {
      onboarding.onPushRegistered?.();
    }
  }, [onboarding?.currentStep, subscriptionStatus]);

  async function handleRequestPermission() {
    if (!isSupported) {
      setStatusMessage("この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
      setPermission(getPushNotificationPermission());
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      const nextPermission = await requestPushNotificationPermission();
      setPermission(getPushNotificationPermission());
      setStatusMessage(nextPermission === "granted" ? "通知を許可しました。" : "通知許可は完了していません。");
      onboarding?.onPermissionStatus?.(nextPermission);
      setSubscriptionCheckVersion((version) => version + 1);
    } catch {
      setPermission(getPushNotificationPermission());
      setStatusMessage("通知許可の準備に失敗しました。");
      onboarding?.onPermissionStatus?.("error");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSendTestNotification() {
    if (!isSupported) {
      setStatusMessage("この表示環境では通知テストを利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
      setPermission(getPushNotificationPermission());
      return;
    }

    if (getPushNotificationPermission() !== "granted") {
      setPermission(getPushNotificationPermission());
      setStatusMessage("先に通知を許可してください。");
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      const result = await sendPushNotificationTest({ accessToken: session?.access_token });
      setPermission(getPushNotificationPermission());
      setStatusMessage("サーバーからこの端末へテスト通知を送りました。");
      onboarding?.onPushTestResult?.(
        result?.onboardingProgressRecorded === false ? "failed" : "succeeded",
      );
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const isNotRegistered = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_NOT_REGISTERED");
      const isGone = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_GONE");
      const isVapidKeyMismatch = error instanceof Error && error.message.includes("PUSH_VAPID_KEY_MISMATCH");
      const isPushAuthFailed = error instanceof Error && error.message.includes("PUSH_AUTH_FAILED");
      const isPushTemporarilyUnavailable = error instanceof Error && error.message.includes("PUSH_SEND_TEMPORARY_FAILURE");
      setStatusMessage(
        isNotRegistered
          ? "先にこの端末を現在のアカウントへ登録してください。"
          : isGone
            ? "この端末の通知登録が無効になりました。もう一度登録してください。"
            : isVapidKeyMismatch
              ? "通知配信用の公開鍵と秘密鍵が一致していません"
              : isPushAuthFailed
                ? "通知サービスの認証に失敗しました"
                : isPushTemporarilyUnavailable
                  ? "通知サービスが一時的に利用できません"
                  : "サーバーからテスト通知を送信できませんでした。",
      );
      onboarding?.onPushTestResult?.("failed");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRegisterDevice() {
    if (!isSubscriptionSupported) {
      setPermission(getPushNotificationPermission());
      setStatusMessage("この表示環境では端末登録を利用できません。iPhoneではホーム画面に追加した星空Villageから試してください。");
      onboarding?.onPushRegistrationFailed?.();
      return;
    }

    if (!session?.access_token) {
      setSubscriptionStatus("failed");
      setStatusMessage("ログインすると、この端末をR.Connect通知用に登録できます。");
      onboarding?.onPushRegistrationFailed?.();
      return;
    }

    if (getPushNotificationPermission() !== "granted") {
      setPermission(getPushNotificationPermission());
      setStatusMessage("先に通知を許可してください。");
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      await subscribeToPushNotifications({ accessToken: session.access_token });
      setPermission(getPushNotificationPermission());
      setSubscriptionStatus("registered");
      setStatusMessage("この端末を登録しました。");
      onboarding?.onPushRegistered?.();
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const isConfigMissing = error instanceof Error && error.message === "push-vapid-key-missing";
      const isAccountMismatch = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_ACCOUNT_MISMATCH");
      const requiresReRegistration = error instanceof Error && error.message === "push-subscription-reregister-required";
      setSubscriptionStatus(isConfigMissing ? "configMissing" : isAccountMismatch ? "account_mismatch" : requiresReRegistration ? "unregistered" : "failed");
      setStatusMessage(
        isConfigMissing
          ? "スマホ通知登録はまだ設定されていません。"
          : isAccountMismatch
            ? "この端末は別のアカウントに通知登録されています"
            : requiresReRegistration
              ? "この端末には以前の通知購読があります。通知端末を再登録してください。"
              : "端末登録に失敗しました。",
      );
      onboarding?.onPushRegistrationFailed?.();
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReRegisterDevice() {
    if (!isSubscriptionSupported || !session?.access_token || getPushNotificationPermission() !== "granted") {
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      await reRegisterPushNotifications({ accessToken: session.access_token });
      setPermission(getPushNotificationPermission());
      setSubscriptionStatus("registered");
      setStatusMessage("通知端末を再登録しました。");
      onboarding?.onPushRegistered?.();
      setSubscriptionCheckVersion((version) => version + 1);
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const code = error instanceof Error ? error.message : "PUSH_REREGISTER_FAILED";
      const messages = {
        INVALID_TOKEN: "ログイン情報を確認できませんでした。再度ログインしてからお試しください。",
        PUSH_CONFIGURATION_ERROR: "スマホ通知登録は現在利用できません。",
        PUSH_SUBSCRIPTION_NOT_OWNED: "この端末の通知登録を確認できませんでした。別アカウントの登録は変更していません。",
        PUSH_REREGISTER_DISABLE_FAILED: "既存の通知登録を無効化できませんでした。",
        PUSH_REREGISTER_UNSUBSCRIBE_FAILED: "現在の通知購読を解除できませんでした。",
        PUSH_REREGISTER_CONFIG_FAILED: "新しい通知設定を取得できませんでした。",
        PUSH_REREGISTER_SUBSCRIBE_FAILED: "新しい通知購読を作成できませんでした。",
        PUSH_REREGISTER_REGISTER_FAILED: "新しい通知端末を登録できませんでした。",
        PUSH_REREGISTER_STATUS_FAILED: "新しい通知登録を確認できませんでした。",
        PUSH_REREGISTER_SERVICE_WORKER_FAILED: "通知用のService Workerを準備できませんでした。",
      };
      setSubscriptionStatus("failed");
      setStatusMessage(`${messages[code] ?? "通知端末を再登録できませんでした。"}（${code}）`);
      onboarding?.onPushRegistrationFailed?.();
    } finally {
      setIsWorking(false);
    }
  }

  async function handleTransferDevice() {
    if (!session?.access_token || subscriptionStatus !== "account_mismatch") {
      return;
    }

    setIsWorking(true);
    setStatusMessage("");

    try {
      await transferPushSubscriptionToCurrentAccount({ accessToken: session.access_token });
      setPermission(getPushNotificationPermission());
      setSubscriptionStatus("registered");
      setStatusMessage("この端末の通知先を現在のアカウントへ切り替えました。");
      onboarding?.onPushRegistered?.();
      setSubscriptionCheckVersion((version) => version + 1);
    } catch (error) {
      setPermission(getPushNotificationPermission());
      const isMismatch = error instanceof Error && error.message.includes("PUSH_SUBSCRIPTION_MISMATCH");
      setStatusMessage(
        isMismatch
          ? "この端末の通知登録を確認できませんでした。画面を開き直してもう一度お試しください。"
          : "端末の通知先を切り替えられませんでした。",
      );
      onboarding?.onPushRegistrationFailed?.();
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-comet/25 bg-comet/10 px-4 py-4 text-comet shadow-[0_0_24px_rgba(125,223,255,0.08)] sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-black text-white">スマホ通知テスト</h3>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            この端末でR.Connect通知を表示できるか確認します。iPhoneではホーム画面に追加した星空Villageから試してください。
          </p>
          <p className="mt-3 text-xs font-black text-comet">{permissionLabel}</p>
          <p className="mt-1 text-xs font-black text-comet">{subscriptionLabel}</p>
          {statusMessage ? <p className="mt-2 text-xs leading-5 text-comet/80">{statusMessage}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button
            className="min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            data-onboarding-target={
              onboarding?.currentStep === "notification_permission" ? "push-permission" : undefined
            }
            disabled={!isSupported || isWorking}
            onClick={handleRequestPermission}
            type="button"
          >
            通知を許可
          </button>
          <button
            className="min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            data-onboarding-target={
              onboarding?.currentStep === "device_registration" ? "push-register" : undefined
            }
            disabled={
              !isSubscriptionSupported ||
              isWorking ||
              permission !== "granted" ||
              !session?.access_token ||
              subscriptionStatus === "checking" ||
              subscriptionStatus === "registered" ||
              subscriptionStatus === "account_mismatch"
            }
            onClick={handleRegisterDevice}
            type="button"
          >
            この端末を登録
          </button>
          <button
            className="min-h-10 rounded-2xl border border-aurora/40 bg-aurora/10 px-4 text-xs font-black text-aurora transition hover:bg-aurora/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              !isSubscriptionSupported ||
              isWorking ||
              permission !== "granted" ||
              !session?.access_token ||
              subscriptionStatus === "checking" ||
              subscriptionStatus === "account_mismatch"
            }
            onClick={handleReRegisterDevice}
            type="button"
          >
            通知端末を再登録
          </button>
          {subscriptionStatus === "account_mismatch" ? (
            <button
              className="min-h-10 rounded-2xl border border-sakura/40 bg-sakura/10 px-4 text-xs font-black text-sakura transition hover:bg-sakura/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!session?.access_token || isWorking}
              onClick={handleTransferDevice}
              type="button"
            >
              この端末の通知先を現在のアカウントへ切り替える
            </button>
          ) : null}
          <button
            className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
            data-onboarding-target={onboarding?.currentStep === "push_test" ? "push-test" : undefined}
            disabled={
              !isSubscriptionSupported ||
              isWorking ||
              permission !== "granted" ||
              !session?.access_token ||
              subscriptionStatus !== "registered"
            }
            onClick={handleSendTestNotification}
            type="button"
          >
            テスト通知
          </button>
        </div>
      </div>
    </section>
  );
}

function RConnectScreen({ notifications }) {
  return (
    <main className="mx-auto max-w-3xl">
      <section className="glass-panel p-5 sm:p-6">
        <p className="text-xs font-bold normal-case text-comet">R.Connect</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">R.Connect</h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">共鳴・星文・観測通知がここに届きます。</p>
        <PushNotificationTestCard onboarding={notifications.onboarding} session={notifications.session} />

        {!notifications.session ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-400">
            ログインすると、自分宛てのR.Connectを確認できます。
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {(notifications.loading || notifications.error || notifications.message) && (
              <p
                className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
                  notifications.error
                    ? "border-sakura/30 bg-sakura/10 text-sakura"
                    : "border-comet/20 bg-comet/10 text-comet"
                }`}
              >
                {notifications.error || notifications.message || "R.Connectを読み込み中..."}
              </p>
            )}

            {!notifications.loading && !notifications.error && notifications.items.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm leading-7 text-slate-400">
                まだ通知はありません。
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.items.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onMarkRead={notifications.onMarkRead}
                    onOpenMeteorDetail={notifications.onOpenMeteorDetail}
                    onOpenStarLetterThread={notifications.onOpenStarLetterThread}
                    onOpenStarProfile={notifications.onOpenStarProfile}
                    updating={notifications.updatingId === notification.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function NotificationCard({ notification, onMarkRead, onOpenMeteorDetail, onOpenStarLetterThread, onOpenStarProfile, updating }) {
  const isUnread = !notification.is_read;
  const actorName = getNotificationActorName(notification);
  const actorProfile = notification.actorProfile;
  const actorUsername = actorProfile?.username;
  const canOpenActorProfile = Boolean(actorUsername);
  const avatar = getAvatarText(actorName);

  return (
    <article
      className={`rounded-2xl border px-4 py-4 ${
        isUnread ? "border-comet/30 bg-comet/10 shadow-glow" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-black ${
            isUnread ? "bg-comet/20 text-comet" : "bg-white/10 text-slate-400"
          }`}
        >
          {isUnread ? "未読" : "既読"}
        </span>
        <span className="text-xs text-slate-500">{formatNotificationTime(notification.created_at)}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {canOpenActorProfile ? (
          <button
            className="flex min-w-0 items-center gap-3 rounded-2xl p-1 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-comet/40"
            onClick={() => onOpenStarProfile(actorUsername)}
            type="button"
          >
            <AvatarFrame avatar={avatar} avatarUrl={actorProfile?.avatar_url} className="h-10 w-10 rounded-2xl text-sm" frame={notification.actorFrame} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-white">{actorName}</span>
              <span className="block truncate text-xs text-slate-500">@{actorUsername}</span>
            </span>
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <AvatarFrame avatar={avatar} avatarUrl={actorProfile?.avatar_url} className="h-10 w-10 rounded-2xl text-sm" frame={notification.actorFrame} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-white">{actorName}</span>
              <span className="block text-xs text-slate-500">観測者情報を取得中</span>
            </span>
          </div>
        )}
      </div>

      <p className="mt-3 text-sm leading-7 text-slate-100">{formatNotificationMessage(notification)}</p>
      <p className="mt-2 text-[11px] font-bold text-slate-500">type: {notification.type}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {notification.post_id ? (
          <button
            className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={() =>
              isStarLetterThreadNotification(notification)
                ? onOpenStarLetterThread?.(notification.post_id, notification.star_letter_id)
                : onOpenMeteorDetail(notification.post_id)
            }
            type="button"
          >
            {isStarLetterThreadNotification(notification) ? "この会話を見る" : "流星便を見る"}
          </button>
        ) : null}

        {isUnread && (
          <button
            className="min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={updating}
            onClick={() => onMarkRead(notification.id)}
            type="button"
          >
            {updating ? "更新中..." : "既読にする"}
          </button>
        )}
      </div>
    </article>
  );
}

function ProfileScreen({
  archive,
  auth,
  feedback,
  myConstellation,
  onOpenMeteorDetail,
  onOpenPostMedia,
  onOpenStarMovieObservation,
  onOpenStarProfile,
  ownPosts,
  postActions,
  profile,
  resonance,
  starLetters,
}) {
  if (profile.profileScreenMode === "edit") {
    return (
      <main className="mx-auto max-w-2xl">
        <ProfileEditScreen profile={profile} />
      </main>
    );
  }

  if (profile.profileScreenMode === "settings") {
    return (
      <main className="mx-auto max-w-2xl">
        <SettingsPanel auth={auth} onBack={profile.onBackToProfile} profile={profile} />
      </main>
    );
  }

  if (profile.profileScreenMode === "feedback") {
    return (
      <main className="mx-auto max-w-2xl">
        <FeedbackScreen feedback={feedback} />
      </main>
    );
  }

  if (profile.profileScreenMode === "guide") {
    return (
      <main className="mx-auto max-w-2xl">
        <GuideScreen onBack={profile.onBackToProfile} onOpenFeedback={profile.onOpenFeedback} />
      </main>
    );
  }

  if (profile.profileScreenMode === "guide-admin") {
    return (
      <main className="mx-auto max-w-3xl">
        <VillageGuideAdminScreen isAdmin={profile.guideIsAdmin} onBack={profile.onBackToProfile} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <ProfileCard profile={profile} />
      <MyConstellationActivityPanel
        archive={archive}
        myConstellation={myConstellation}
        onOpenMeteorDetail={onOpenMeteorDetail}
        onOpenPostMedia={onOpenPostMedia}
        onOpenStarMovieObservation={onOpenStarMovieObservation}
        onOpenStarProfile={onOpenStarProfile}
        ownPosts={ownPosts}
        postActions={postActions}
        resonance={resonance}
        starLetters={starLetters}
      />
    </main>
  );
}

function SentStarLetterCard({ item, onOpenStarLetterThread }) {
  const sourcePost = item.sourcePost;
  const sourcePreview = sourcePost?.text?.trim() || "画像・動画を含む流星便";

  return (
    <article className="glass-panel overflow-hidden p-4 sm:p-5">
      <div className="flex gap-3">
        <AvatarFrame
          avatar={item.avatar}
          avatarUrl={item.avatarUrl}
          className="h-10 w-10 rounded-2xl text-xs"
          frame={item.avatarFrame}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-white">{item.name}</span>
            <span className="text-xs text-slate-500">{item.handle}</span>
            <span className="text-xs text-slate-500">· {item.time}</span>
            <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-1 text-[10px] font-black text-comet">
              星文
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
            <LinkedText>{item.body}</LinkedText>
          </p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-night-950/35 px-3 py-3">
            <p className="text-[11px] font-black text-slate-500">元の流星便</p>
            {sourcePost ? (
              <>
                <p className="mt-1 text-xs font-black text-slate-300">{sourcePost.name} {sourcePost.handle}</p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-6 text-slate-400">
                  {sourcePreview}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs leading-6 text-slate-500">元の流星便は現在表示できません。</p>
            )}
          </div>

          <button
            className="mt-4 min-h-9 rounded-full border border-comet/25 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!item.postId}
            onClick={() => onOpenStarLetterThread?.(item.postId, item.id)}
            type="button"
          >
            この会話を見る
          </button>
        </div>
      </div>
    </article>
  );
}

function MyConstellationActivityPanel({
  archive,
  myConstellation,
  onOpenMeteorDetail,
  onOpenPostMedia,
  onOpenStarMovieObservation,
  onOpenStarProfile,
  ownPosts,
  postActions,
  resonance,
  starLetters,
}) {
  if (!ownPosts.session) {
    return null;
  }

  const activeView = myConstellation?.activeView ?? "posts";
  const isResonatedView = activeView === "resonated";
  const isStarLetterView = activeView === "starLetters";
  const currentPosts = isResonatedView ? myConstellation.resonatedPosts : ownPosts;
  const currentError = isStarLetterView ? myConstellation.sentStarLetters.error : currentPosts.error;
  const currentLoading = isStarLetterView ? myConstellation.sentStarLetters.loading : currentPosts.loading;

  function renderPostList() {
    if (currentPosts.items.length === 0) {
      return (
        <p className="text-sm leading-7 text-slate-400">
          {isResonatedView
            ? "まだ共鳴した流星便はありません。観測画面で心が動いた流星便に共鳴してみましょう。"
            : "まだ流星便はありません。中央の＋から最初の流星便を放流できます。"}
        </p>
      );
    }

    return (
      <div className="space-y-5">
        {currentPosts.items.map((post) => (
          <PostCard
            archive={archive}
            key={post.id ?? post.handle}
            onOpenAuthorProfile={onOpenStarProfile}
            onOpenDetail={onOpenMeteorDetail}
            onOpenMedia={onOpenPostMedia}
            onOpenStarMovieObservation={onOpenStarMovieObservation}
            postActions={postActions}
            post={post}
            resonance={resonance}
            starLetters={starLetters}
          />
        ))}
      </div>
    );
  }

  return (
    <Panel title="わたしの星座" eyebrow="my constellation">
      <div aria-label="My Constellationの記録" className="mb-5 grid grid-cols-3 rounded-2xl border border-white/10 bg-night-950/45 p-1" role="tablist">
        <button
          aria-selected={activeView === "posts"}
          className={`min-h-11 rounded-xl px-2 text-xs font-black transition ${
            activeView === "posts" ? "bg-comet/15 text-comet shadow-glow" : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          onClick={() => myConstellation?.onViewChange?.("posts")}
          role="tab"
          type="button"
        >
          流星便 <span className="ml-1 text-[10px] opacity-70">{ownPosts.items.length}</span>
        </button>
        <button
          aria-selected={isResonatedView}
          className={`min-h-11 rounded-xl px-2 text-xs font-black transition ${
            isResonatedView ? "bg-comet/15 text-comet shadow-glow" : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          onClick={() => myConstellation?.onViewChange?.("resonated")}
          role="tab"
          type="button"
        >
          共鳴 <span className="ml-1 text-[10px] opacity-70">{myConstellation.resonatedPosts.items.length}</span>
        </button>
        <button
          aria-selected={isStarLetterView}
          className={`min-h-11 rounded-xl px-2 text-xs font-black transition ${
            isStarLetterView ? "bg-comet/15 text-comet shadow-glow" : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          onClick={() => myConstellation?.onViewChange?.("starLetters")}
          role="tab"
          type="button"
        >
          星文 <span className="ml-1 text-[10px] opacity-70">{myConstellation.sentStarLetters.items.length}</span>
        </button>
      </div>

      {!isStarLetterView && (postActions?.message || postActions?.error) ? (
        <p
          className={`mb-3 rounded-2xl border px-4 py-3 text-xs leading-5 ${
            postActions.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {postActions.error || postActions.message}
        </p>
      ) : null}

      {currentLoading || currentError ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
            currentError ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {currentError || (isStarLetterView ? "送った星文を読み込み中..." : isResonatedView ? "共鳴した流星便を読み込み中..." : "わたしの流星便を読み込み中...")}
        </p>
      ) : isStarLetterView ? (
        myConstellation.sentStarLetters.items.length === 0 ? (
          <p className="text-sm leading-7 text-slate-400">
            まだ送った星文はありません。流星便に言葉を届けると、ここに残ります。
          </p>
        ) : (
          <div className="space-y-5">
            {myConstellation.sentStarLetters.items.map((item) => (
              <SentStarLetterCard
                item={item}
                key={item.id}
                onOpenStarLetterThread={archive?.onOpenStarLetterThread}
              />
            ))}
          </div>
        )
      ) : (
        renderPostList()
      )}
    </Panel>
  );
}

function ArchivedStarLetterCard({ archive, item }) {
  const sourcePost = item.sourcePost;
  const sourcePreview = sourcePost?.body?.trim() || "画像・動画を含む流星便";
  const isSaving = archive.starLetterSavingIds?.has(item.id);

  return (
    <article className="glass-panel overflow-hidden p-4 sm:p-5">
      <div className="flex gap-3">
        <AvatarFrame
          avatar={item.avatar}
          avatarUrl={item.avatarUrl}
          className="h-10 w-10 rounded-2xl text-xs"
          frame={item.avatarFrame}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-white">{item.name}</span>
            <span className="text-xs text-slate-500">{item.handle}</span>
            <span className="text-xs text-slate-500">· {item.time}</span>
            <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-1 text-[10px] font-black text-comet">
              星文
            </span>
          </div>
          <p className={`mt-3 whitespace-pre-wrap text-sm leading-7 ${item.isDeleted ? "text-slate-500" : "text-slate-200"}`}>
            <LinkedText>{item.isDeleted ? "削除された星文です。" : item.body}</LinkedText>
          </p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-night-950/35 px-3 py-3">
            <p className="text-[11px] font-black text-slate-500">元の流星便</p>
            {sourcePost ? (
              <>
                <p className="mt-1 text-xs font-black text-slate-300">{sourcePost.name} {sourcePost.handle}</p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-6 text-slate-400">
                  {sourcePreview}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs leading-6 text-slate-500">元の流星便は現在表示できません。</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="min-h-9 rounded-full border border-comet/25 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!item.postId}
              onClick={() => archive.onOpenStarLetterThread?.(item.postId, item.id)}
              type="button"
            >
              この会話を見る
            </button>
            <button
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              onClick={() => archive.onToggleStarLetterArchive?.(item)}
              type="button"
            >
              {isSaving ? "解除中..." : "Archive解除"}
            </button>
            <span className="text-[11px] text-slate-600">Archive {item.archiveTime}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ArchiveScreen({
  archive,
  onboarding,
  onOpenMeteorDetail,
  onOpenPostMedia,
  onOpenStarMovieObservation,
  onOpenStarProfile,
  postActions,
  resonance,
  starLetters,
}) {
  const isStarLetterView = archive.activeView === "starLetters";
  const loading = isStarLetterView ? archive.starLetterLoading : archive.loading;
  const error = isStarLetterView ? archive.starLetterError || starLetters?.error : archive.error;
  const message = isStarLetterView ? starLetters?.message : archive.message;

  return (
    <main className="mx-auto max-w-3xl">
      <section className="glass-panel mb-4 p-5 sm:p-6">
        <p className="text-xs font-bold normal-case text-comet">Archive</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Archive</h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          自分の星空に残しておきたい流星便と星文を集めます。
        </p>
        {archive.session ? (
          <div aria-label="Archiveの種類" className="mt-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-night-950/45 p-1" role="tablist">
            <button
              aria-selected={!isStarLetterView}
              className={`min-h-11 rounded-xl px-3 text-xs font-black transition ${
                !isStarLetterView ? "bg-comet/15 text-comet shadow-glow" : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
              onClick={() => archive.onViewChange?.("posts")}
              role="tab"
              type="button"
            >
              流星便 <span className="ml-1 text-[10px] opacity-70">{archive.items.length}</span>
            </button>
            <button
              aria-selected={isStarLetterView}
              className={`min-h-11 rounded-xl px-3 text-xs font-black transition ${
                isStarLetterView ? "bg-comet/15 text-comet shadow-glow" : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
              onClick={() => archive.onViewChange?.("starLetters")}
              role="tab"
              type="button"
            >
              星文 <span className="ml-1 text-[10px] opacity-70">{archive.starLetterItems.length}</span>
            </button>
          </div>
        ) : null}
      </section>

      {!archive.session ? (
        <section className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
          ログインすると、Archiveした流星便と星文を確認できます。
        </section>
      ) : (
        <section className="space-y-5 px-3 pb-10 sm:px-5">
          {(loading || error || message) && (
            <p
              className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
                error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
              }`}
              role={error ? "alert" : "status"}
            >
              {error || message || (isStarLetterView ? "星文Archiveを読み込み中..." : "Archiveを読み込み中...")}
            </p>
          )}

          {!isStarLetterView && (postActions?.message || postActions?.error) ? (
            <p
              className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
                postActions.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
              }`}
            >
              {postActions.error || postActions.message}
            </p>
          ) : null}

          {isStarLetterView ? (
            !loading && !error && archive.starLetterItems.length === 0 ? (
              <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
                まだArchiveされた星文はありません。
              </div>
            ) : (
              archive.starLetterItems.map((item) => (
                <ArchivedStarLetterCard archive={archive} item={item} key={item.archiveId ?? item.id} />
              ))
            )
          ) : !loading && !error && archive.items.length === 0 ? (
            <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
              まだArchiveされた流星便はありません。
            </div>
          ) : (
            archive.items.map((post) => (
              <PostCard
                archive={archive}
                key={post.archiveId ?? post.id}
                onboarding={onboarding}
                onOpenAuthorProfile={onOpenStarProfile}
                onOpenDetail={onOpenMeteorDetail}
                onOpenMedia={onOpenPostMedia}
                onOpenStarMovieObservation={onOpenStarMovieObservation}
                postActions={postActions}
                post={post}
                resonance={resonance}
                starLetters={starLetters}
              />
            ))
          )}
        </section>
      )}
    </main>
  );
}

function NotificationSettingForm({ checked, description, disabled, label, name, onChange, onSubmit, saving }) {
  return (
    <form className="rounded-2xl border border-white/10 bg-night-950/35 px-3 py-3" onSubmit={onSubmit}>
      <label className="flex items-start gap-3">
        <input
          checked={checked}
          className="mt-1 h-5 w-5 rounded border-white/20 bg-night-950 text-comet focus:ring-comet/30"
          disabled={disabled}
          onChange={(event) => onChange(name, event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block text-sm font-black text-white">{label}</span>
          <span className="mt-1 block text-xs leading-6 text-slate-400">{description}</span>
        </span>
      </label>
      <button
        className="mt-4 min-h-10 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        type="submit"
      >
        {saving ? "保存中..." : "設定を保存"}
      </button>
    </form>
  );
}

function SettingsPanel({ auth, onBack, profile }) {
  return (
    <Panel title="設定" eyebrow="settings">
      <div className="space-y-3 text-sm leading-7 text-slate-400">
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
          onClick={onBack}
          type="button"
        >
          戻る
        </button>
        <p>基本設定は今後ここから調整できるようにします。</p>
        <button
          className="w-full rounded-2xl border border-aurora/20 bg-aurora/10 px-4 py-4 text-left transition hover:border-aurora/35 hover:bg-aurora/15"
          onClick={profile.onOpenGuide}
          type="button"
        >
          <span className="block text-sm font-black text-white">はじめての入村案内</span>
          <span className="mt-1 block text-xs leading-6 text-slate-400">
            星空Villageで今できること、基本の使い方、これから増える機能を確認できます。
          </span>
        </button>
        {profile.guideIsAdmin ? (
          <button
            className="w-full rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-4 text-left transition hover:border-amber-200/40 hover:bg-amber-300/15"
            onClick={profile.onOpenGuideAdmin}
            type="button"
          >
            <span className="block text-sm font-black text-amber-100">入村案内を編集</span>
            <span className="mt-1 block text-xs leading-6 text-slate-400">
              セクションと文章を1項目ずつ編集し、表示順や公開状態を変更できます。
            </span>
          </button>
        ) : null}
        {profile.guideAdminLoading ? <p className="text-xs text-slate-500">管理設定を確認中...</p> : null}
        <button
          className="w-full rounded-2xl border border-comet/20 bg-comet/10 px-4 py-4 text-left transition hover:border-comet/35 hover:bg-comet/15"
          onClick={profile.onOpenFeedback}
          type="button"
        >
          <span className="block text-sm font-black text-white">星の目安箱</span>
          <span className="mt-1 block text-xs leading-6 text-slate-400">
            不具合、感想、改善案を星空Villageへ送れます。
          </span>
        </button>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-xs font-black text-comet">法務・お問い合わせ</p>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[11px] font-bold text-slate-500">法務</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <a
                  className="min-h-11 rounded-2xl border border-white/10 bg-night-950/35 px-3 py-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
                  href="/terms"
                >
                  利用規約
                </a>
                <a
                  className="min-h-11 rounded-2xl border border-white/10 bg-night-950/35 px-3 py-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
                  href="/privacy"
                >
                  プライバシーポリシー
                </a>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500">お問い合わせ</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <a
                  className="min-h-11 rounded-2xl border border-comet/20 bg-comet/10 px-3 py-3 text-xs font-black text-comet transition hover:border-comet/35 hover:bg-comet/15 hover:text-white"
                  href={OFFICIAL_X_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  星空Village公式X
                </a>
                <a
                  className="min-h-11 rounded-2xl border border-white/10 bg-night-950/35 px-3 py-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
                  href="mailto:akaibuhoshizora@gmail.com"
                >
                  メールでお問い合わせ
                </a>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-500">
            公式X、またはメールからお問い合わせいただけます。
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs font-black text-comet">ログイン状態</p>
          <p className="mt-1 text-slate-300">{auth.status}</p>
        </div>
        {auth.session && (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            <NotificationSettingForm
              checked={Boolean(profile.form.notify_authors_when_i_resonate)}
              description="ONにすると、あなたが誰かの流星便に共鳴した時、相手に通知が届きます。OFFにすると、共鳴しても相手には通知されません。"
              disabled={profile.loading || profile.saving}
              label="自分の共鳴を相手に通知する"
              name="notify_authors_when_i_resonate"
              onChange={profile.onChange}
              onSubmit={profile.onResonanceNotificationSettingSubmit}
              saving={profile.saving}
            />
            <NotificationSettingForm
              checked={Boolean(profile.form.notify_authors_when_i_archive)}
              description="ONにすると、あなたが誰かの流星便をArchiveした時、相手に通知が届きます。OFFにすると、Archiveしても相手には通知されません。"
              disabled={profile.loading || profile.saving}
              label="自分のArchiveを相手に通知する"
              name="notify_authors_when_i_archive"
              onChange={profile.onChange}
              onSubmit={profile.onArchiveNotificationSettingSubmit}
              saving={profile.saving}
            />
            {(profile.message || profile.error) && (
              <p
                className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${
                  profile.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
                }`}
              >
                {profile.error || profile.message}
              </p>
            )}
          </div>
        )}
        {auth.session && (
          <button
            className="min-h-10 w-full rounded-2xl border border-sakura/30 bg-sakura/10 px-4 text-xs font-black text-sakura transition hover:bg-sakura/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={auth.loading}
            onClick={auth.onLogout}
            type="button"
          >
            {auth.loading ? "処理中..." : "ログアウト"}
          </button>
        )}
      </div>
    </Panel>
  );
}

function GuideScreen({ onBack, onOpenFeedback }) {
  const fallbackRows = getFallbackVillageGuideRows();
  const [guideTree, setGuideTree] = useState(() =>
    buildVillageGuideTree(fallbackRows.sections, fallbackRows.entries),
  );
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function readGuide() {
      setLoading(true);

      const [sectionResult, entryResult] = await Promise.all([
        supabase.from("guide_sections").select(GUIDE_SECTION_SELECT_COLUMNS).order("sort_order").order("section_key"),
        supabase.from("guide_entries").select(GUIDE_ENTRY_SELECT_COLUMNS).order("sort_order").order("entry_key"),
      ]);

      if (!isMounted) {
        return;
      }

      setLoading(false);
      const loadError = sectionResult.error || entryResult.error;

      if (loadError) {
        const fallback = getFallbackVillageGuideRows();
        setGuideTree(buildVillageGuideTree(fallback.sections, fallback.entries));
        setUsingFallback(true);

        if (!isMissingVillageGuideSchemaError(loadError)) {
          logSafeError(ERROR_OPERATION.GUIDE_LOAD, loadError);
        }
        return;
      }

      setGuideTree(buildVillageGuideTree(sectionResult.data ?? [], entryResult.data ?? []));
      setUsingFallback(false);
    }

    readGuide();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Panel title="はじめての入村案内" eyebrow="GUIDE">
      <div className="space-y-4 pb-8">
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
          onClick={onBack}
          type="button"
        >
          戻る
        </button>

        {loading ? (
          <p className="rounded-2xl border border-comet/20 bg-comet/10 px-4 py-3 text-xs leading-6 text-comet">
            入村案内を読み込み中...
          </p>
        ) : null}

        {usingFallback ? (
          <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs leading-6 text-amber-100">
            最新の案内を取得できなかったため、保存されている案内を表示しています。
          </p>
        ) : null}

        {!loading && guideTree.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-400">
            現在表示できる入村案内はありません。
          </p>
        ) : null}

        {guideTree.map((section) =>
          section.display_variant === "notice" ? (
            <div
              className="space-y-2 rounded-2xl border border-sakura/20 bg-sakura/10 px-4 py-4 text-xs leading-6 text-slate-300"
              key={section.id}
            >
              <GuideEntryCollection entries={section.entries} />
            </div>
          ) : (
            <GuideSection key={section.id} title={section.title}>
              <GuideEntryCollection entries={section.entries} />
              {section.children.length > 0 ? (
                <div className={`${section.entries.length > 0 ? "mt-5" : ""} space-y-5`}>
                  {section.children.map((child) => (
                    <div key={child.id}>
                      <h4 className="text-xs font-black text-aurora">{child.title}</h4>
                      <div className="mt-2">
                        <GuideEntryCollection entries={child.entries} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </GuideSection>
          ),
        )}

        <button
          className="min-h-11 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
          onClick={onOpenFeedback}
          type="button"
        >
          星の目安箱へ送る
        </button>
      </div>
    </Panel>
  );
}

function GuideEntryCollection({ entries }) {
  const blocks = [];
  let listItems = [];

  function flushList() {
    if (listItems.length > 0) {
      blocks.push(
        <GuideList items={listItems} key={`list-${blocks.length}`} />,
      );
      listItems = [];
    }
  }

  for (const entry of entries) {
    if (entry.entry_type === "list_item") {
      listItems.push(entry);
      continue;
    }

    flushList();
    blocks.push(
      <p className="text-sm leading-7 text-slate-300" key={entry.id}>
        {entry.body}
      </p>,
    );
  }

  flushList();
  return <div className="space-y-3">{blocks}</div>;
}

function GuideSection({ children, title }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-night-950/35 px-4 py-4 shadow-[0_18px_55px_rgba(3,7,18,0.22)] sm:px-5">
      <h3 className="text-sm font-black text-comet">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function GuideList({ items }) {
  return (
    <ul className="grid gap-2 text-sm leading-6 text-slate-300 sm:grid-cols-2">
      {items.map((item) => (
        <li className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2" key={item.id}>
          {item.body}
        </li>
      ))}
    </ul>
  );
}

function FeedbackScreen({ feedback }) {
  const trimmedLength = getTrimmedCharacterLength(feedback.body);
  const isOverLimit = trimmedLength > feedback.maxLength;
  const canSubmit = Boolean(feedback.session) && feedback.body.trim() && !isOverLimit && !feedback.saving;

  return (
    <Panel title="星の目安箱" eyebrow="feedback">
      <div className="space-y-4">
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={feedback.saving}
          onClick={feedback.onBack}
          type="button"
        >
          戻る
        </button>

        <p className="text-sm leading-7 text-slate-300">
          星空Villageを一緒に育てるための感想・不具合・改善案を送れます。
        </p>

        {!feedback.session && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-400">
            ログインするとフィードバックを送れます。
          </div>
        )}

        <form className="space-y-4 rounded-2xl border border-white/10 bg-night-950/35 p-4" onSubmit={feedback.onSubmit}>
          <label className="block text-xs font-bold text-slate-400">
            種別
            <select
              className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!feedback.session || feedback.saving}
              onChange={(event) => feedback.onTypeChange(event.target.value)}
              value={feedback.type}
            >
              {feedback.types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-bold text-slate-400">
            本文
            <textarea
              className="mt-1 min-h-36 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 px-3 py-3 text-sm leading-7 text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!feedback.session || feedback.saving}
              onChange={(event) => feedback.onBodyChange(event.target.value)}
              placeholder="気づいたこと、困ったこと、ほしい機能など"
              value={feedback.body}
            />
          </label>

          {isOverLimit && (
            <p className="rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
              フィードバックは1000文字以内で送ってください。
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-slate-500">
              <span className={isOverLimit ? "font-black text-sakura" : "text-slate-600"}>
                {trimmedLength}/{feedback.maxLength}
              </span>
            </p>
            <button
              className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-5 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              {feedback.saving ? "送信中..." : "送信する"}
            </button>
          </div>

          {(feedback.message || feedback.error) && (
            <p
              className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${
                feedback.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
              }`}
            >
              {feedback.error || feedback.message}
            </p>
          )}
        </form>
      </div>
    </Panel>
  );
}

function ProfileCard({ profile }) {
  const displayName = profile.data?.display_name || defaultProfileView.display_name;
  const username = profile.data?.username ? `@${profile.data.username}` : defaultProfileView.username;
  const bio = profile.data?.bio || defaultProfileView.bio;
  const avatarUrl = profile.data?.avatar_url;
  const activeFrame = profile.activeFrame;
  const constellationNote = profile.data?.constellation_note;
  const avatar = displayName.trim().charAt(0) || defaultProfileView.avatar;
  const canShareStarProfile = Boolean(profile.data?.username);
  const canOpenAvatar = Boolean(avatarUrl);
  const statusMessage = profile.error || profile.shareError || profile.message || profile.shareMessage;

  return (
    <section className="glass-panel overflow-hidden">
      <div className="h-20 bg-[radial-gradient(circle_at_24%_30%,rgba(125,223,255,0.55),transparent_28%),linear-gradient(120deg,rgba(159,140,255,0.36),rgba(255,139,207,0.18))]" />
      <div className="p-4 pt-0">
        <div className="-mt-7 flex items-end justify-between gap-3">
          {canOpenAvatar ? (
            <button
              aria-label={`${displayName}の星影を見る`}
              className="rounded-3xl outline-none transition hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-comet/25"
              onClick={() => profile.onOpenAvatar(avatarUrl, `${displayName}の星影`)}
              type="button"
            >
              <AvatarFrame avatar={avatar} avatarUrl={avatarUrl} className="h-16 w-16 rounded-3xl text-xl" frame={activeFrame} />
            </button>
          ) : (
            <AvatarFrame avatar={avatar} avatarUrl={avatarUrl} className="h-16 w-16 rounded-3xl text-xl" frame={activeFrame} />
          )}
          <div className="mb-2 flex items-center gap-2">
            {profile.canEdit && (
              <button
                className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
                onClick={profile.onOpenSettings}
                type="button"
              >
                ⚙
              </button>
            )}
            {profile.canEdit && (
              <button
                className="min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
                data-onboarding-target={profile.onboardingTarget === "profile-edit" ? "profile-edit" : undefined}
                disabled={profile.loading}
                onClick={profile.onStartEdit}
                type="button"
              >
                {profile.loading ? "読込中" : "編集"}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <h2 className="text-lg font-black text-white">{displayName}</h2>
          <p className="text-sm text-slate-400">{username}</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">{bio}</p>
          {constellationNote && (
            <div className="mt-3 rounded-2xl border border-comet/20 bg-comet/10 px-3 py-2">
              <p className="text-[11px] font-black text-comet">My Star Chart</p>
              <p className="mt-1 text-xs leading-5 text-slate-200">{constellationNote}</p>
            </div>
          )}
        </div>

        {profile.canEdit && (
          <button
            className="mt-4 min-h-10 w-full rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canShareStarProfile}
            onClick={() => profile.onShareProfile(profile.data?.username)}
            type="button"
          >
            星座URLを共有
          </button>
        )}

        {!profile.canEdit ? (
          <button
            className="mt-4 min-h-11 w-full rounded-2xl border border-aurora/25 bg-aurora/10 px-4 text-xs font-black text-aurora transition hover:border-aurora/40 hover:bg-aurora/15 hover:text-white"
            onClick={profile.onOpenGuide}
            type="button"
          >
            はじめての入村案内
          </button>
        ) : null}

        {statusMessage && (
          <p
            className={`mt-4 rounded-2xl border px-3 py-2 text-xs leading-5 ${
              profile.error || profile.shareError
                ? "border-sakura/30 bg-sakura/10 text-sakura"
                : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {statusMessage}
          </p>
        )}

      </div>
    </section>
  );
}

function ProfileEditScreen({ profile }) {
  return (
    <section className="glass-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-comet">profile edit</p>
          <h2 className="mt-1 text-2xl font-black text-white">プロフィール編集</h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            表示名、星影、My Star Chartを編集できます。
          </p>
        </div>
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={profile.saving}
          onClick={profile.onCancelEdit}
          type="button"
        >
          戻る
        </button>
      </div>

      <ProfileEditor profile={profile} />
    </section>
  );
}

function AvatarFrame({ avatar, avatarUrl, className = "h-12 w-12 rounded-2xl text-base", frame = null }) {
  const baseClass =
    "grid flex-none place-items-center overflow-hidden border border-white/20 bg-gradient-to-br from-night-800 via-aurora/70 to-sakura/70 font-black text-white shadow-glow";
  const avatarContent = avatarUrl ? (
    <img alt="" className="h-full w-full object-cover" src={avatarUrl} />
  ) : (
    avatar
  );

  if (!frame) {
    if (avatarUrl) {
      return (
        <div className={`${baseClass} ${className}`}>
          {avatarContent}
        </div>
      );
    }

    return <div className={`${baseClass} ${className}`}>{avatarContent}</div>;
  }

  const frameStyle = {
    "--profile-frame-offset-x": `${frame.offsetX ?? 0}%`,
    "--profile-frame-offset-y": `${frame.offsetY ?? 0}%`,
    "--profile-frame-scale": frame.scale ?? 1.22,
  };

  return (
    <div className={`relative flex-none ${className}`} style={frameStyle}>
      <div className={`${baseClass} h-full w-full rounded-[inherit]`}>
        {avatarContent}
      </div>
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-none select-none"
        draggable={false}
        src={frame.assetPath}
        style={{
          height: "calc(100% * var(--profile-frame-scale, 1.22))",
          transform:
            "translate(calc(-50% + var(--profile-frame-offset-x, 0%)), calc(-50% + var(--profile-frame-offset-y, 0%)))",
          width: "calc(100% * var(--profile-frame-scale, 1.22))",
        }}
      />
    </div>
  );
}

function AvatarCropper({
  disabled,
  frameSize,
  imageSize,
  imageUrl,
  offset,
  onFrameSizeChange,
  onImageLoad,
  onOffsetChange,
  onReset,
  onZoomChange,
  zoom,
}) {
  const guideRef = useRef(null);
  const imageRef = useRef(null);
  const dragStateRef = useRef(null);
  const latestVisualOffsetRef = useRef(offset);
  const animationFrameRef = useRef(null);
  const coverScale = getAvatarCoverScale(imageSize, frameSize);
  const displayedWidth = imageSize?.width && frameSize ? imageSize.width * coverScale * zoom : null;
  const displayedHeight = imageSize?.height && frameSize ? imageSize.height * coverScale * zoom : null;

  function applyImageTransform(nextOffset) {
    if (!imageRef.current) {
      return;
    }

    imageRef.current.style.transform = `translate(-50%, -50%) translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`;
  }

  function scheduleVisualOffset(nextOffset) {
    latestVisualOffsetRef.current = nextOffset;

    if (animationFrameRef.current) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      applyImageTransform(latestVisualOffsetRef.current);
    });
  }

  function flushVisualOffset() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    applyImageTransform(latestVisualOffsetRef.current);
  }

  function getMeasuredFrameSize() {
    const rect = guideRef.current?.getBoundingClientRect();
    const measuredSize = rect ? Math.round(Math.min(rect.width, rect.height)) : 0;

    return measuredSize || frameSize;
  }

  useEffect(() => {
    const guide = guideRef.current;

    if (!guide) {
      return undefined;
    }

    function updateFrameSize() {
      const rect = guide.getBoundingClientRect();
      const nextSize = Math.round(Math.min(rect.width, rect.height));

      if (nextSize > 0) {
        onFrameSizeChange(nextSize);
      }
    }

    updateFrameSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFrameSize);
      return () => {
        window.removeEventListener("resize", updateFrameSize);
      };
    }

    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(guide);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl, onFrameSizeChange]);

  useEffect(() => {
    latestVisualOffsetRef.current = offset;

    if (!dragStateRef.current) {
      applyImageTransform(offset);
    }
  }, [displayedHeight, displayedWidth, offset]);

  useEffect(
    () => () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  function handlePointerDown(event) {
    if (disabled || !imageSize?.width || !imageSize?.height) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; dragging still works without it.
    }

    const safeStartOffset = constrainAvatarCropOffset(
      latestVisualOffsetRef.current,
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    latestVisualOffsetRef.current = safeStartOffset;
    flushVisualOffset();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: safeStartOffset,
      target: event.currentTarget,
    };
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const nextOffset = constrainAvatarCropOffset(
      {
        x: dragState.startOffset.x + event.clientX - dragState.startX,
        y: dragState.startOffset.y + event.clientY - dragState.startY,
      },
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    scheduleVisualOffset(nextOffset);
  }

  function handlePointerEnd(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const finalOffset = latestVisualOffsetRef.current;

    dragStateRef.current = null;
    try {
      dragState.target?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Some mobile browsers release capture before the pointerup callback.
    }
    flushVisualOffset();
    onOffsetChange(finalOffset);
  }

  return (
    <div className="mt-4 rounded-3xl border border-comet/20 bg-night-950/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-comet">星影の位置を調整</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">枠の中をドラッグして、アイコンに使う光を合わせます。</p>
        </div>
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={onReset}
          type="button"
        >
          位置をリセット
        </button>
      </div>

      <div
        aria-label="星影の正方形プレビュー"
        className="relative mx-auto mt-4 aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-3xl border border-comet/30 bg-night-950/70 shadow-[0_0_35px_rgba(125,223,255,0.16)]"
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onLostPointerCapture={handlePointerEnd}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      >
        <img
          alt=""
          className={displayedWidth && displayedHeight ? "absolute max-w-none select-none" : "h-full w-full select-none object-cover"}
          draggable={false}
          onLoad={(event) =>
            onImageLoad({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          onDragStart={(event) => event.preventDefault()}
          ref={imageRef}
          src={imageUrl}
          style={
            displayedWidth && displayedHeight
              ? {
                  height: `${displayedHeight}px`,
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0)`,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  willChange: "transform",
                  width: `${displayedWidth}px`,
                }
              : undefined
          }
        />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[9%] bg-night-950/52" />
          <div className="absolute inset-x-0 bottom-0 h-[9%] bg-night-950/52" />
          <div className="absolute bottom-[9%] left-0 top-[9%] w-[9%] bg-night-950/52" />
          <div className="absolute bottom-[9%] right-0 top-[9%] w-[9%] bg-night-950/52" />
          <div
            className="absolute inset-[9%] rounded-[1.65rem] border border-comet/65 bg-white/[0.025] shadow-[0_0_28px_rgba(125,223,255,0.16),inset_0_0_22px_rgba(255,255,255,0.06)]"
            ref={guideRef}
          >
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/10" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/10" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/10" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/10" />
          </div>
          <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/25" />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
          <span>星影を遠ざける</span>
          <span>星影を近づける</span>
        </div>
        <input
          aria-label="星影のズーム"
          className="w-full accent-cyan-300"
          disabled={disabled}
          max={AVATAR_CROP_MAX_ZOOM}
          min={AVATAR_CROP_MIN_ZOOM}
          onChange={(event) => onZoomChange(event.target.value)}
          step="0.01"
          type="range"
          value={zoom}
        />
      </div>
    </div>
  );
}

function PostCoverCropper({
  disabled,
  frameSize,
  imageSize,
  imageUrl,
  offset,
  onFrameSizeChange,
  onImageLoad,
  onOffsetChange,
  onReset,
  onZoomChange,
  zoom,
}) {
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const dragStateRef = useRef(null);
  const latestVisualOffsetRef = useRef(offset);
  const animationFrameRef = useRef(null);
  const coverScale = getPostCoverCropScale(imageSize, frameSize);
  const displayedWidth = imageSize?.width && frameSize?.width ? imageSize.width * coverScale * zoom : null;
  const displayedHeight = imageSize?.height && frameSize?.height ? imageSize.height * coverScale * zoom : null;

  function applyImageTransform(nextOffset) {
    if (!imageRef.current) {
      return;
    }

    imageRef.current.style.transform = `translate(-50%, -50%) translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`;
  }

  function scheduleVisualOffset(nextOffset) {
    latestVisualOffsetRef.current = nextOffset;

    if (animationFrameRef.current) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      applyImageTransform(latestVisualOffsetRef.current);
    });
  }

  function flushVisualOffset() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    applyImageTransform(latestVisualOffsetRef.current);
  }

  function getMeasuredFrameSize() {
    const rect = frameRef.current?.getBoundingClientRect();

    if (!rect) {
      return frameSize;
    }

    return {
      height: Math.round(rect.height) || frameSize.height,
      width: Math.round(rect.width) || frameSize.width,
    };
  }

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return undefined;
    }

    function updateFrameSize() {
      const rect = frame.getBoundingClientRect();
      const nextSize = {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };

      if (nextSize.width > 0 && nextSize.height > 0) {
        onFrameSizeChange(nextSize);
      }
    }

    updateFrameSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFrameSize);
      return () => {
        window.removeEventListener("resize", updateFrameSize);
      };
    }

    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl, onFrameSizeChange]);

  useEffect(() => {
    latestVisualOffsetRef.current = offset;

    if (!dragStateRef.current) {
      applyImageTransform(offset);
    }
  }, [displayedHeight, displayedWidth, offset]);

  useEffect(
    () => () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  function handlePointerDown(event) {
    if (disabled || !imageSize?.width || !imageSize?.height) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; dragging still works without it.
    }

    const safeStartOffset = constrainPostCoverCropOffset(
      latestVisualOffsetRef.current,
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    latestVisualOffsetRef.current = safeStartOffset;
    flushVisualOffset();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startOffset: safeStartOffset,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
    };
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const nextOffset = constrainPostCoverCropOffset(
      {
        x: dragState.startOffset.x + event.clientX - dragState.startX,
        y: dragState.startOffset.y + event.clientY - dragState.startY,
      },
      zoom,
      imageSize,
      getMeasuredFrameSize(),
    );

    scheduleVisualOffset(nextOffset);
  }

  function handlePointerEnd(event) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const finalOffset = latestVisualOffsetRef.current;

    dragStateRef.current = null;
    try {
      dragState.target?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Some mobile browsers release capture before the pointerup callback.
    }
    flushVisualOffset();
    onOffsetChange(finalOffset);
  }

  return (
    <div className="mt-4 rounded-3xl border border-comet/20 bg-night-950/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-comet">表紙の位置を調整</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">16:9の枠に、見せたい星映の光を合わせます。</p>
        </div>
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={onReset}
          type="button"
        >
          位置をリセット
        </button>
      </div>

      <div
        aria-label="星映の表紙16:9プレビュー"
        className="relative mx-auto mt-4 aspect-video w-full max-w-[460px] touch-none overflow-hidden rounded-3xl border border-comet/30 bg-night-950/70 shadow-[0_0_35px_rgba(125,223,255,0.16)]"
        onLostPointerCapture={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={frameRef}
        style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      >
        <img
          alt=""
          className={displayedWidth && displayedHeight ? "absolute max-w-none select-none" : "h-full w-full select-none object-cover"}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onLoad={(event) =>
            onImageLoad({
              height: event.currentTarget.naturalHeight,
              width: event.currentTarget.naturalWidth,
            })
          }
          ref={imageRef}
          src={imageUrl}
          style={
            displayedWidth && displayedHeight
              ? {
                  height: `${displayedHeight}px`,
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0)`,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  willChange: "transform",
                  width: `${displayedWidth}px`,
                }
              : undefined
          }
        />
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/25">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/15" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/15" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/15" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/15" />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-slate-400">
          <span>遠ざける</span>
          <span>近づける</span>
        </div>
        <input
          aria-label="星映の表紙のズーム"
          className="w-full accent-cyan-300"
          disabled={disabled}
          max={AVATAR_CROP_MAX_ZOOM}
          min={AVATAR_CROP_MIN_ZOOM}
          onChange={(event) => onZoomChange(event.target.value)}
          step="0.01"
          type="range"
          value={zoom}
        />
      </div>
    </div>
  );
}

function ProfileEditor({ profile }) {
  const previewUrl = profile.avatarPreviewUrl || profile.form.avatar_url;
  const previewName = profile.form.display_name || defaultProfileView.display_name;
  const previewAvatar = getAvatarText(previewName);
  const selectedFrame = profile.selectedFrame;

  return (
    <form
      className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-night-950/35 p-3"
      data-onboarding-target={profile.onboardingTarget === "profile-editor" ? "profile-editor" : undefined}
      onSubmit={profile.onSubmit}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-comet">プロフィール編集</p>
        {(profile.loading || profile.avatarUploading) && (
          <span className="text-[11px] font-bold text-slate-500">
            {profile.avatarUploading ? "アップロード中..." : "読み込み中..."}
          </span>
        )}
      </div>

      <label className="block text-xs font-bold text-slate-400">
        表示名
        <input
          className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
          onChange={(event) => profile.onChange("display_name", event.target.value)}
          placeholder="名無しの観測者"
          required
          type="text"
          value={profile.form.display_name}
        />
      </label>

      <label className="block text-xs font-bold text-slate-400">
        ユーザー名
        <input
          className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
          onChange={(event) => profile.onChange("username", event.target.value)}
          pattern="[A-Za-z0-9_]{3,32}"
          placeholder="silent_creator"
          title="半角英数字とアンダースコアで3〜32文字"
          type="text"
          value={profile.form.username}
        />
      </label>

      <div className="rounded-2xl border border-comet/20 bg-comet/10 p-3">
        <p className="text-xs font-black text-comet">星影</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <AvatarFrame avatar={previewAvatar} avatarUrl={previewUrl} className="h-16 w-16 rounded-3xl text-xl" frame={selectedFrame} />
          <div className="min-w-0 flex-1">
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01]">
              写真フォルダから星影を選ぶ
              <input
                accept={profile.avatarAccept}
                className="sr-only"
                disabled={profile.loading || profile.saving || profile.avatarUploading}
                onChange={profile.onAvatarFileChange}
                type="file"
              />
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              jpg / jpeg / png / webp、5MBまで。保存するとプロフィールに反映されます。
            </p>
            {profile.avatarFileName && (
              <p className="mt-1 truncate text-xs font-bold text-comet">選択中: {profile.avatarFileName}</p>
            )}
          </div>
        </div>
      </div>

      <label className="block text-xs font-bold text-slate-400">
        画像URL（予備）
        <input
          className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
          onChange={(event) => profile.onChange("avatar_url", event.target.value)}
          placeholder="https://example.com/avatar.png"
          type="url"
          value={profile.form.avatar_url}
        />
      </label>

      <div className="rounded-2xl border border-white/10 bg-night-950/45 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-black text-comet">アイコンフレーム</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">所持しているフレームだけを装着できます。</p>
          </div>
          {profile.profileFramesLoading && <span className="text-[11px] font-bold text-slate-500">読込中...</span>}
        </div>
        {profile.profileFramesError && (
          <p className="mt-3 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
            {profile.profileFramesError}
          </p>
        )}
        {!profile.profileFramesAvailable ? (
          <p className="mt-3 rounded-2xl border border-comet/20 bg-comet/10 px-3 py-2 text-xs leading-5 text-comet">
            アイコンフレーム機能は準備中です。通常のプロフィール編集はそのまま使えます。
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            <button
              className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-xs font-bold transition ${
                !profile.form.active_frame_id
                  ? "border-comet/40 bg-comet/15 text-white"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-comet/30 hover:bg-comet/10"
              }`}
              disabled={profile.loading || profile.saving || profile.avatarUploading}
              onClick={() => profile.onChange("active_frame_id", "")}
              type="button"
            >
              <span>
                <span className="block font-black">フレームを使用しない</span>
                <span className="mt-1 block text-[11px] text-slate-500">現在の星影だけを表示します。</span>
              </span>
              {!profile.form.active_frame_id && <span className="text-comet">選択中</span>}
            </button>

            {profile.ownedProfileFrames.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs leading-5 text-slate-500">
                所持しているアイコンフレームはまだありません。
              </p>
            ) : (
              profile.ownedProfileFrames.map((frame) => {
                const isSelected = profile.form.active_frame_id === frame.id;

                return (
                  <button
                    className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                      isSelected
                        ? "border-comet/40 bg-comet/15 text-white"
                        : "border-white/10 bg-white/5 text-slate-300 hover:border-comet/30 hover:bg-comet/10"
                    }`}
                    disabled={profile.loading || profile.saving || profile.avatarUploading}
                    key={frame.id}
                    onClick={() => profile.onChange("active_frame_id", frame.id)}
                    type="button"
                  >
                    <AvatarFrame avatar={previewAvatar} avatarUrl={previewUrl} className="h-11 w-11 rounded-2xl text-sm" frame={frame} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">{frame.name}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-slate-500">{frame.description}</span>
                    </span>
                    {isSelected && <span className="text-xs font-black text-comet">選択中</span>}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <label className="block text-xs font-bold text-slate-400">
        自己紹介
        <textarea
          className="mt-1 min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
          onChange={(event) => profile.onChange("bio", event.target.value)}
          placeholder="まだ名前のない作品を、夜空に置いていく人。"
          value={profile.form.bio}
        />
      </label>

      <label className="block text-xs font-bold text-slate-400">
        My Star Chart
        <textarea
          className="mt-1 min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
          onChange={(event) => profile.onChange("constellation_note", event.target.value)}
          placeholder="好きなもの、創作傾向、今の自分の光など"
          value={profile.form.constellation_note}
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={profile.loading || profile.saving || profile.avatarUploading}
          type="submit"
        >
          {profile.avatarUploading ? "アップロード中..." : profile.saving ? "保存中..." : "保存する"}
        </button>
        <button
          className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={profile.saving || profile.avatarUploading}
          onClick={profile.onCancelEdit}
          type="button"
        >
          キャンセル
        </button>
      </div>

      {(profile.message || profile.error) && (
        <p
          className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${
            profile.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {profile.error || profile.message}
        </p>
      )}
    </form>
  );
}

function BottomNav({ activeTab, onTabChange, onboardingTarget = "" }) {
  return (
    <nav
      aria-label="星空Village bottom navigation"
      className="bottom-navigation fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5"
    >
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/15 bg-night-950/85 px-2 py-2 shadow-[0_0_40px_rgba(125,223,255,0.16)] backdrop-blur-2xl">
        <div className="grid grid-cols-5 items-end gap-1">
          {bottomNavItems.map((item) => {
            const isActive = activeTab === item.id;
            const buttonClass = item.primary
              ? `-mt-5 flex min-h-16 flex-col items-center justify-center gap-1 rounded-3xl bg-gradient-to-br from-comet via-aurora to-sakura px-2 pb-2 pt-2 text-night-950 shadow-glow transition hover:scale-[1.03] ${
                  isActive ? "-translate-y-1 ring-2 ring-white/40" : ""
                }`
              : `flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition ${
                  isActive ? "bg-comet/15 text-white ring-1 ring-comet/30" : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`;

            return (
              <button
                aria-current={isActive ? "page" : undefined}
                aria-label={item.ariaLabel ?? item.label}
                className={buttonClass}
                data-onboarding-target={onboardingTarget === `nav-${item.id}` ? onboardingTarget : undefined}
                key={item.id}
                onClick={() => onTabChange(item.id)}
                type="button"
              >
                <span
                  className={
                    item.primary
                      ? "grid h-9 w-9 place-items-center rounded-full bg-night-950/15 text-night-950"
                      : `grid h-6 w-6 place-items-center ${isActive ? "text-white" : "text-comet"}`
                  }
                >
                  <BottomNavIcon icon={item.icon} />
                </span>
                <span
                  className={`text-center text-[10px] font-black leading-tight ${item.primary ? "text-night-950" : ""}`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function BottomNavIcon({ icon }) {
  if (icon === "plus") {
    return <span className="text-2xl leading-none">+</span>;
  }

  if (icon === "telescope") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M4 14.5 14.5 9l1.5 3L5.5 17.5 4 14.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="m14.5 9 3-1.6 2.2 4.2-3.7 1.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M9.5 16 7 21" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="m11.5 14.8 3.2 5.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "bell") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M18 10a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "bookmark") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M7 4h10v16l-5-3-5 3V4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return <span aria-hidden="true" className="text-xl leading-none">✩</span>;
}

function AuthPanel({ auth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [legalDocument, setLegalDocument] = useState(null);
  const legalDialogRef = useRef(null);
  const legalLinkReturnFocusRef = useRef(null);
  const isSignUp = mode === "signup";
  const userEmail = auth.session?.user?.email;
  const signUpConsentReady = acceptedLegal && confirmedAge;
  const isLegalDialogOpen = Boolean(legalDocument);

  useEffect(() => {
    if (!isLegalDialogOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setLegalDocument(null);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    legalDialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      legalLinkReturnFocusRef.current?.focus();
    };
  }, [isLegalDialogOpen]);

  function openLegalDocument(documentType, event) {
    event.preventDefault();
    event.stopPropagation();
    legalLinkReturnFocusRef.current = event.currentTarget;
    setLegalDocument(documentType);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSignUp) {
      await auth.onSignUp(email, password, {
        acceptedLegal,
        confirmedAge,
      });
      return;
    }

    await auth.onLogin(email, password);
  }

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-night-950/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold normal-case text-comet">Supabase Auth</p>
          <p className="mt-1 text-sm font-black text-white">{auth.status}</p>
        </div>
        <span className={`h-2 w-2 rounded-full ${auth.session ? "bg-comet" : "bg-slate-500"}`} />
      </div>

      {auth.session ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-slate-300">
            {userEmail ? `${userEmail} でログイン中` : "ログイン中"}
          </p>
          <button
            className="min-h-10 w-full rounded-2xl border border-sakura/30 bg-sakura/10 px-4 text-xs font-black text-sakura transition hover:bg-sakura/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={auth.loading}
            onClick={auth.onLogout}
            type="button"
          >
            {auth.loading ? "処理中..." : "ログアウト"}
          </button>
        </div>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1">
            <button
              className={`min-h-9 rounded-xl text-xs font-black transition ${
                mode === "login" ? "bg-comet/20 text-white" : "text-slate-400 hover:text-white"
              }`}
              onClick={() => setMode("login")}
              type="button"
            >
              ログイン
            </button>
            <button
              className={
                `min-h-9 rounded-xl text-xs font-black transition ${
                  mode === "signup" ? "bg-comet/20 text-white" : "text-slate-400 hover:text-white"
                }
              `}
              onClick={() => setMode("signup")}
              type="button"
            >
              会員登録
            </button>
          </div>

          <label className="block text-xs font-bold text-slate-400">
            メールアドレス
            <input
              autoComplete="email"
              className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block text-xs font-bold text-slate-400">
            パスワード
            <input
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6文字以上"
              required
              type="password"
              value={password}
            />
          </label>

          {isSignUp && (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs leading-5 text-slate-300">
              <div className="flex items-start gap-3">
                <input
                  aria-label="利用規約とプライバシーポリシーに同意する"
                  checked={acceptedLegal}
                  className="mt-1 h-5 w-5 rounded border-white/20 bg-night-950 text-comet focus:ring-comet/30"
                  onChange={(event) => setAcceptedLegal(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <button
                    className="font-black text-comet underline-offset-4 hover:underline"
                    onClick={(event) => openLegalDocument("terms", event)}
                    type="button"
                  >
                    利用規約
                  </button>
                  <span>と</span>
                  <button
                    className="font-black text-comet underline-offset-4 hover:underline"
                    onClick={(event) => openLegalDocument("privacy", event)}
                    type="button"
                  >
                    プライバシーポリシー
                  </button>
                  <span>を確認し、同意します</span>
                </span>
              </div>
              <label className="flex items-start gap-3">
                <input
                  checked={confirmedAge}
                  className="mt-1 h-5 w-5 rounded border-white/20 bg-night-950 text-comet focus:ring-comet/30"
                  onChange={(event) => setConfirmedAge(event.target.checked)}
                  type="checkbox"
                />
                <span>私は18歳以上であることを確認します</span>
              </label>
            </div>
          )}

          <button
            className="min-h-10 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={auth.loading || (isSignUp && !signUpConsentReady)}
            type="submit"
          >
            {auth.loading ? "処理中..." : isSignUp ? "会員登録する" : "ログインする"}
          </button>
        </form>
      )}

      {(auth.message || auth.error) && (
        <p
          className={`mt-3 rounded-2xl border px-3 py-2 text-xs leading-5 ${
            auth.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {auth.error || auth.message}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
        <a className="transition hover:text-comet" href="/terms">利用規約</a>
        <a className="transition hover:text-comet" href="/privacy">プライバシーポリシー</a>
        <a className="transition hover:text-comet" href={OFFICIAL_X_URL} rel="noopener noreferrer" target="_blank">公式X</a>
        <a className="transition hover:text-comet" href="mailto:akaibuhoshizora@gmail.com">メール</a>
      </div>

      {legalDocument && (
        <LegalDocumentModal
          documentType={legalDocument}
          dialogRef={legalDialogRef}
          onClose={() => setLegalDocument(null)}
          onSelectDocument={setLegalDocument}
        />
      )}
    </section>
  );
}

function LegalDocumentModal({ documentType, dialogRef, onClose, onSelectDocument }) {
  const document =
    documentType === "privacy"
      ? {
          markdown: privacyPolicyMarkdown,
          title: "プライバシーポリシー",
        }
      : {
          markdown: termsOfServiceMarkdown,
          title: "利用規約",
        };
  const titleId = "signup-legal-document-title";

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-night-950/90 px-3 py-4 backdrop-blur-xl"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-night-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-night-950 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[11px] font-bold normal-case text-comet">legal</p>
            <h2 className="mt-1 text-base font-black text-white" id={titleId}>
              {document.title}
            </h2>
          </div>
          <button
            aria-label="法務文書を閉じる"
            className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            閉じる
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <button
            aria-pressed={documentType === "terms"}
            className={`min-h-9 rounded-full border px-3 py-2 text-xs font-black transition ${
              documentType === "terms"
                ? "border-comet/35 bg-comet/15 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            }`}
            onClick={() => onSelectDocument("terms")}
            type="button"
          >
            利用規約
          </button>
          <button
            aria-pressed={documentType === "privacy"}
            className={`min-h-9 rounded-full border px-3 py-2 text-xs font-black transition ${
              documentType === "privacy"
                ? "border-comet/35 bg-comet/15 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            }`}
            onClick={() => onSelectDocument("privacy")}
            type="button"
          >
            プライバシーポリシー
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-5">
          <MarkdownDocument markdown={document.markdown} />
          <button
            className="mt-8 min-h-12 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
            onClick={onClose}
            type="button"
          >
            確認して会員登録に戻る
          </button>
        </div>
      </section>
    </div>
  );
}

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

function useStarMovieObservationViewport() {
  const [isDesktopObservationViewport, setIsDesktopObservationViewport] = useState(() =>
    isStarMovieObservationViewport(),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(STAR_MOVIE_OBSERVATION_MEDIA_QUERY);

    function handleViewportChange(event) {
      setIsDesktopObservationViewport(event.matches);
    }

    setIsDesktopObservationViewport(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener?.("change", handleViewportChange);
    };
  }, []);

  return isDesktopObservationViewport;
}

function YouTubeEmbed({ onOpenObservation, videoId }) {
  const iframeRef = useRef(null);
  const isDesktopObservationViewport = useStarMovieObservationViewport();

  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return null;
  }

  return (
    <div
      className="post-video-shell post-video-youtube relative mt-4 aspect-video overflow-hidden rounded-2xl border border-comet/20 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.28)]"
      data-card-action="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="star-movie-surface h-full w-full"
        loading="lazy"
        ref={iframeRef}
        referrerPolicy="strict-origin-when-cross-origin"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`}
        title="YouTube video player"
      />
      {isDesktopObservationViewport ? (
        <button
          aria-label="YouTubeを星映観測モードで開く"
          className="absolute bottom-12 left-3 z-10 min-h-9 rounded-full border border-white/20 bg-night-950/75 px-3 text-[11px] font-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-md transition hover:border-comet/45 hover:bg-comet/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/30"
          onClick={(event) => {
            event.stopPropagation();
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
              "https://www.youtube-nocookie.com",
            );
            onOpenObservation?.(event.currentTarget);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          星映観測モード
        </button>
      ) : null}
    </div>
  );
}

function SunoLinkCard({ url }) {
  if (!url) {
    return null;
  }

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-aurora/25 bg-gradient-to-br from-night-950/75 via-comet/10 to-aurora/15 p-3 shadow-[0_18px_55px_rgba(3,7,18,0.24)]"
      data-card-action="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-2xl border border-comet/25 bg-comet/10 text-lg font-black text-comet shadow-[0_0_18px_rgba(125,223,255,0.12)]">
          ♪
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-comet">Sunoで音楽を聴く</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">この流星便にはSunoの楽曲リンクがあります。</p>
          <a
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
            href={url}
            onClick={(event) => event.stopPropagation()}
            rel="noopener noreferrer"
            target="_blank"
          >
            Sunoで開く
          </a>
        </div>
        <span className="text-sm text-aurora/70" aria-hidden="true">
          ✦
        </span>
      </div>
    </div>
  );
}

function PostMediaGrid({ media = [], onOpenMedia, onOpenObservation }) {
  const videoItem = media.find((item) => item?.mediaType === "video" && item.url);
  const visibleImages = media
    .filter((item) => item?.mediaType !== "video" && item?.url)
    .slice(0, METEOR_IMAGE_MAX_COUNT);

  if (!videoItem && visibleImages.length === 0) {
    return null;
  }

  const gridClass =
    visibleImages.length === 1
      ? "grid-cols-1"
      : visibleImages.length === 2
        ? "grid-cols-2"
        : "grid-cols-2";

  function handleOpenMedia(event, index) {
    event.stopPropagation();
    onOpenMedia?.(visibleImages, index);
  }

  return (
    <>
      {videoItem && (
        <PostVideoAttachment
          item={videoItem}
          onOpenMedia={onOpenMedia}
          onOpenObservation={(triggerElement) =>
            onOpenObservation?.(videoItem, triggerElement)
          }
        />
      )}
      {visibleImages.length > 0 && (
        <div
          className={`mt-4 grid overflow-hidden rounded-2xl border border-white/10 bg-night-950/35 ${gridClass} gap-1`}
          data-card-action="true"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {visibleImages.map((item, index) => {
            const isFeatured = visibleImages.length === 3 && index === 0;
            const itemClass = visibleImages.length === 1
              ? "aspect-[4/3] max-h-[420px]"
              : isFeatured
                ? "aspect-square sm:row-span-2"
                : "aspect-square";

            return (
              <button
                aria-label={`流星便の星影 ${index + 1} / ${visibleImages.length} を開く`}
                className={`${itemClass} min-h-0 overflow-hidden bg-white/5 outline-none transition hover:brightness-110 focus-visible:ring-4 focus-visible:ring-comet/25`}
                data-card-action="true"
                key={item.id ?? item.storagePath ?? item.url}
                onClick={(event) => handleOpenMedia(event, index)}
                type="button"
              >
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  loading="lazy"
                  src={item.url}
                />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function PostVideoAttachment({ item, onOpenMedia, onOpenObservation }) {
  const videoRef = useRef(null);
  const [hasLoadedVideo, setHasLoadedVideo] = useState(false);
  const isDesktopObservationViewport = useStarMovieObservationViewport();
  const mediaId = item.id ?? item.storagePath ?? item.url;

  useEffect(() => {
    function handleOtherVideoPlay(event) {
      if (event.detail?.mediaId === mediaId) {
        return;
      }

      videoRef.current?.pause();
    }

    window.addEventListener(POST_INLINE_VIDEO_PLAY_EVENT, handleOtherVideoPlay);

    return () => {
      window.removeEventListener(POST_INLINE_VIDEO_PLAY_EVENT, handleOtherVideoPlay);
      videoRef.current?.pause();
    };
  }, [mediaId]);

  function stopCardAction(event) {
    event.stopPropagation();
  }

  function requestInlinePlay(event) {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId } }));
    setHasLoadedVideo(true);
    window.requestAnimationFrame(() => {
      videoRef.current?.play?.().catch(() => {
        // Browser autoplay rules can still block; controls remain available.
      });
    });
  }

  function handleOpenViewer(event) {
    event.stopPropagation();
    videoRef.current?.pause();
    onOpenMedia?.([item], 0);
  }

  return (
    <div
      className="post-video-shell post-video-upload mt-4 overflow-hidden rounded-2xl border border-white/10 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.22)]"
      data-card-action="true"
      onClick={stopCardAction}
      onPointerDown={stopCardAction}
    >
      <div className="post-video-viewport relative aspect-video bg-black">
        {hasLoadedVideo ? (
          <video
            className="star-movie-surface h-full w-full bg-black object-contain"
            controls
            onPlay={() => window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId } }))}
            playsInline
            poster={item.thumbnailUrl ?? undefined}
            preload="none"
            ref={videoRef}
            src={item.url}
          />
        ) : (
          <button
            aria-label="流星便の星映を再生"
            className="group relative h-full w-full overflow-hidden bg-night-950 text-left outline-none focus-visible:ring-4 focus-visible:ring-comet/30"
            onClick={requestInlinePlay}
            type="button"
          >
            {item.thumbnailUrl ? (
              <img
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                draggable={false}
                loading="lazy"
                src={item.thumbnailUrl}
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(125,223,255,0.22),transparent_35%),linear-gradient(135deg,rgba(5,8,22,1),rgba(44,24,86,0.9),rgba(3,7,18,1))]">
                <div className="text-center">
                  <p className="text-4xl">✦</p>
                  <p className="mt-2 text-xs font-black text-comet">流星便の星映</p>
                </div>
              </div>
            )}
            <span className="absolute inset-0 bg-night-950/15" />
            <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-white/20 text-2xl text-white shadow-[0_0_30px_rgba(125,223,255,0.35)] backdrop-blur-md transition group-hover:scale-105">
              ▶
            </span>
          </button>
        )}
        {!isDesktopObservationViewport ? (
          <button
            className="absolute right-3 top-3 min-h-9 rounded-full border border-white/15 bg-night-950/70 px-3 text-[11px] font-black text-white backdrop-blur-md transition hover:border-comet/35 hover:bg-comet/20"
            onClick={handleOpenViewer}
            type="button"
          >
            拡大
          </button>
        ) : (
          <button
            aria-label="アップロード動画を星映観測モードで開く"
            className="absolute bottom-12 left-3 z-10 min-h-9 rounded-full border border-white/20 bg-night-950/75 px-3 text-[11px] font-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-md transition hover:border-comet/45 hover:bg-comet/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/30"
            onClick={(event) => {
              event.stopPropagation();
              videoRef.current?.pause();
              onOpenObservation?.(event.currentTarget);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            星映観測モード
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-slate-400">
        <span>いちばん光る35秒</span>
        {item.durationSeconds ? <span>{formatMediaDuration(item.durationSeconds)}</span> : null}
      </div>
    </div>
  );
}

function PostMediaViewerModal({ onClose, onStep, viewer }) {
  const currentItem = viewer?.items?.[viewer.index];
  const total = viewer?.items?.length ?? 0;
  const canGoPrevious = Boolean(viewer && viewer.index > 0);
  const canGoNext = Boolean(viewer && viewer.index < total - 1);
  const onCloseRef = useRef(onClose);
  const videoRef = useRef(null);
  const isVideo = currentItem?.mediaType === "video";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!viewer) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCloseRef.current?.();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer || !isVideo) {
      return undefined;
    }

    window.dispatchEvent(new CustomEvent(POST_INLINE_VIDEO_PLAY_EVENT, { detail: { mediaId: "viewer" } }));

    return () => {
      videoRef.current?.pause();
      videoRef.current?.removeAttribute("src");
      videoRef.current?.load();
    };
  }, [isVideo, viewer, currentItem?.url]);

  if (!viewer || !currentItem?.url) {
    return null;
  }

  return (
    <div
      aria-label={isVideo ? "流星便の星映を見る" : "流星便の星影を見る"}
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-night-950/90 px-3 py-6 backdrop-blur-xl"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-white/15 bg-night-950/75 p-3 shadow-[0_0_70px_rgba(125,223,255,0.18)]"
        data-card-action="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-black text-comet">
            {isVideo ? "星映を見る" : "星影を見る"}
            <span className="ml-2 text-slate-400">
              {viewer.index + 1} / {total}
            </span>
          </p>
          <button
            className="min-h-9 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            閉じる
          </button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/35">
          {isVideo ? (
            <video
              className="max-h-[72vh] w-full bg-black object-contain"
              controls
              playsInline
              poster={currentItem.thumbnailUrl ?? undefined}
              preload="metadata"
              ref={videoRef}
              src={currentItem.url}
            />
          ) : (
            <img
              alt=""
              className="max-h-[72vh] w-full object-contain"
              draggable={false}
              src={currentItem.url}
            />
          )}
        </div>

        {!isVideo && total > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canGoPrevious}
              onClick={() => onStep(-1)}
              type="button"
            >
              前の星影
            </button>
            <button
              className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canGoNext}
              onClick={() => onStep(1)}
              type="button"
            >
              次の星影
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({
  archive,
  onboarding,
  onOpenMeteorDetail,
  onOpenPostMedia,
  onOpenStarMovieObservation,
  onOpenStarProfile,
  postActions,
  posts,
  postsError,
  postsLoading,
  resonance,
  starLetters,
}) {
  return (
    <section className="timeline mx-auto max-w-3xl">
      {(postsLoading || postsError) && (
        <div className="px-3 pt-4 sm:px-5">
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              postsError ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {postsError || "公開流星便を読み込み中..."}
          </p>
        </div>
      )}

      {(resonance?.message || resonance?.error) && (
        <div className="px-3 pt-4 sm:px-5">
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              resonance.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {resonance.error || resonance.message}
          </p>
        </div>
      )}

      {(archive?.message || archive?.error) && (
        <div className="px-3 pt-4 sm:px-5">
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              archive.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {archive.error || archive.message}
          </p>
        </div>
      )}

      {(starLetters?.message || starLetters?.error) && (
        <div className="px-3 pt-4 sm:px-5">
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              starLetters.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {starLetters.error || starLetters.message}
          </p>
        </div>
      )}

      {(postActions?.message || postActions?.error) && (
        <div className="px-3 pt-4 sm:px-5">
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              postActions.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {postActions.error || postActions.message}
          </p>
        </div>
      )}

      <div className="timeline-post-list space-y-5 px-3 pb-10 pt-4 sm:px-5">
        {!postsLoading && !postsError && posts.length === 0 ? (
          <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            まだ流星便はありません。最初の光を放流してみましょう。
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              archive={archive}
              key={post.id ?? post.handle}
              onboarding={onboarding}
              onOpenAuthorProfile={onOpenStarProfile}
              onOpenDetail={onOpenMeteorDetail}
              onOpenMedia={onOpenPostMedia}
              onOpenStarMovieObservation={onOpenStarMovieObservation}
              postActions={postActions}
              post={post}
              resonance={resonance}
              starLetters={starLetters}
            />
          ))
        )}
      </div>
    </section>
  );
}

function useKeyboardToolbarOffset() {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const frameRef = useRef(null);
  const orientationTimerRef = useRef(null);
  const toolbarKeyboardGap = 10;

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return undefined;
    }

    function measureKeyboardOffset() {
      const viewportBottom = viewport.offsetTop + viewport.height;
      const keyboardInset = Math.max(0, Math.round(window.innerHeight - viewportBottom));
      const safeOffset = keyboardInset > 16 ? keyboardInset + toolbarKeyboardGap : 0;

      setKeyboardOffset((currentOffset) => (currentOffset === safeOffset ? currentOffset : safeOffset));
    }

    function requestKeyboardOffsetUpdate() {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measureKeyboardOffset();
      });
    }

    function handleOrientationChange() {
      if (orientationTimerRef.current) {
        window.clearTimeout(orientationTimerRef.current);
      }

      orientationTimerRef.current = window.setTimeout(() => {
        orientationTimerRef.current = null;
        requestKeyboardOffsetUpdate();
      }, 250);
    }

    requestKeyboardOffsetUpdate();
    viewport.addEventListener("resize", requestKeyboardOffsetUpdate);
    viewport.addEventListener("scroll", requestKeyboardOffsetUpdate);
    window.addEventListener("resize", requestKeyboardOffsetUpdate);
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      if (orientationTimerRef.current) {
        window.clearTimeout(orientationTimerRef.current);
      }

      viewport.removeEventListener("resize", requestKeyboardOffsetUpdate);
      viewport.removeEventListener("scroll", requestKeyboardOffsetUpdate);
      window.removeEventListener("resize", requestKeyboardOffsetUpdate);
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, []);

  return keyboardOffset;
}

function MeteorTagTextarea({
  autoResize = false,
  className,
  disabled,
  maxLength,
  onChange,
  placeholder,
  textareaRef,
  value,
}) {
  const mirrorRef = useRef(null);
  const textareaElementRef = useRef(null);

  function setTextareaNode(node) {
    textareaElementRef.current = node;

    if (typeof textareaRef === "function") {
      textareaRef(node);
      return;
    }

    if (textareaRef) {
      textareaRef.current = node;
    }
  }

  function resizeTextarea() {
    if (!autoResize || !textareaElementRef.current) {
      return;
    }

    const textarea = textareaElementRef.current;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  useEffect(() => {
    resizeTextarea();
  }, [autoResize, value]);

  useEffect(() => {
    if (!autoResize) {
      return undefined;
    }

    window.addEventListener("resize", resizeTextarea);

    return () => {
      window.removeEventListener("resize", resizeTextarea);
    };
  }, [autoResize]);

  function handleScroll(event) {
    if (!mirrorRef.current) {
      return;
    }

    mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
    mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div className="relative w-full">
      <div
        aria-hidden="true"
        className={`${className} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-slate-100`}
        ref={mirrorRef}
        style={{ color: "#f1f5f9" }}
      >
        {value ? (
          <LinkedText highlightMeteorTags>{value.endsWith("\n") ? `${value} ` : value}</LinkedText>
        ) : null}
      </div>
      <textarea
        className={`${className} relative z-10 text-transparent caret-white selection:bg-amber-300/25`}
        disabled={disabled}
        maxLength={maxLength}
        onChange={onChange}
        onScroll={handleScroll}
        placeholder={placeholder}
        ref={setTextareaNode}
        style={{ color: "transparent" }}
        value={value}
      />
    </div>
  );
}

function Composer({ composer }) {
  const statusText = !composer.canPost
    ? "ログインすると流星便を放流できます。"
    : !composer.hasProfile
      ? "先にプロフィールを保存すると流星便を放流できます。"
      : "";
  const hasImages = composer.imageDrafts.length > 0;
  const hasVideo = Boolean(composer.videoDraft);
  const mediaHintText = hasVideo
    ? "星映を削除すると、星影を選べます。"
    : hasImages
      ? "星影を削除すると、星映を選べます。"
      : "";
  const keyboardOffset = useKeyboardToolbarOffset();
  const textareaRef = useRef(null);
  const imageInputDisabled =
    composer.saving ||
    !composer.canPost ||
    !composer.hasProfile ||
    hasVideo ||
    composer.imageDrafts.length >= composer.maxImages;
  const videoInputDisabled =
    composer.saving || composer.videoPreparing || !composer.canPost || !composer.hasProfile || hasImages;
  const meteorTagInputDisabled = composer.saving || !composer.canPost || !composer.hasProfile;
  const composerLayoutStyle = {
    "--compose-active-toolbar-height":
      keyboardOffset > 0 ? "4.65rem" : "calc(env(safe-area-inset-bottom) + 5.35rem)",
    "--compose-keyboard-offset": `${keyboardOffset}px`,
  };

  function handleInsertMeteorTag(event) {
    event.preventDefault();
    event.stopPropagation();

    if (meteorTagInputDisabled) {
      return;
    }

    const textarea = textareaRef.current;
    const cursorIndex = textarea?.selectionStart ?? composer.draft.length;

    if (composer.draft[cursorIndex - 1] === "#" || composer.draft[cursorIndex] === "#") {
      textarea?.focus({ preventScroll: true });
      return;
    }

    const nextDraft = `${composer.draft.slice(0, cursorIndex)}#${composer.draft.slice(cursorIndex)}`;
    composer.onChange(nextDraft);

    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true });
      textarea?.setSelectionRange(cursorIndex + 1, cursorIndex + 1);
    });
  }

  return (
    <form
      className="contents"
      data-onboarding-target={composer.onboardingTarget === "post-composer" ? "post-composer" : undefined}
      id={METEOR_COMPOSER_FORM_ID}
      onSubmit={composer.onSubmit}
      style={composerLayoutStyle}
    >
      <div className="compose-scroll-content fixed inset-x-0 z-20 overflow-y-auto overscroll-contain px-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <MeteorTagTextarea
            autoResize
            className="min-h-36 w-full resize-none overflow-hidden bg-transparent text-base leading-8 text-white outline-none placeholder:text-slate-500 sm:min-h-40 sm:text-lg"
            disabled={!composer.canPost || !composer.hasProfile || composer.saving}
            maxLength={POST_MAX_LENGTH + 1}
            onChange={(event) => composer.onChange(event.target.value)}
            placeholder="今夜、どの星を観測してほしい？"
            textareaRef={textareaRef}
            value={composer.draft}
          />

        {(mediaHintText || statusText || composer.uploadProgress || composer.message || composer.error || composer.tagError) && (
          <div className="mt-3 space-y-2">
            {mediaHintText && <p className="text-xs font-bold leading-5 text-sakura">{mediaHintText}</p>}
            {statusText && <p className="text-xs font-bold leading-5 text-slate-500">{statusText}</p>}
            {composer.uploadProgress && (
              <p className="inline-flex rounded-full bg-comet/10 px-3 py-1 text-xs font-bold text-comet">
                {composer.uploadProgress}
              </p>
            )}
            {(composer.message || composer.error || composer.tagError) && (
              <p
                className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${
                  composer.error || composer.tagError
                    ? "border-sakura/30 bg-sakura/10 text-sakura"
                    : "border-comet/20 bg-comet/10 text-comet"
                }`}
              >
                {composer.error || composer.tagError || composer.message}
              </p>
            )}
          </div>
        )}

        {composer.imageDrafts.length > 0 && (
          <div className="mt-3">
            <PostImageDraftPreview
              drafts={composer.imageDrafts}
              disabled={composer.saving}
              onMove={composer.onMoveImage}
              onRemove={composer.onRemoveImage}
            />
          </div>
        )}

        {composer.videoDraft && (
          <PostVideoDraftPreview
            disabled={composer.saving}
            draft={composer.videoDraft}
            onRemove={composer.onRemoveVideo}
          />
        )}

        {composer.videoDraft && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-night-950/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black text-comet">星映の表紙</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  未設定なら星映から自動生成します。16:9で調整できます。
                </p>
              </div>
              <label
                className={`inline-flex min-h-9 items-center rounded-2xl px-3 text-[11px] font-black transition ${
                  composer.saving
                    ? "cursor-not-allowed bg-white/10 text-slate-500"
                    : "cursor-pointer border border-comet/30 bg-comet/10 text-comet hover:bg-comet/15"
                }`}
              >
                表紙を選ぶ
                <input
                  accept={composer.thumbnailAccept}
                  className="sr-only"
                  disabled={composer.saving}
                  onChange={composer.onThumbnailFileChange}
                  type="file"
                />
              </label>
            </div>

            {composer.thumbnailDraft && (
              <PostThumbnailDraftPreview
                disabled={composer.saving}
                draft={composer.thumbnailDraft}
                onEdit={composer.onEditThumbnail}
                onRemove={composer.onRemoveThumbnail}
              />
            )}
          </div>
        )}
          </div>
        </div>

      <div
        className={`compose-media-toolbar fixed inset-x-0 z-40 border-t border-white/10 bg-night-950/90 px-4 pt-2 shadow-[0_-14px_44px_rgba(3,7,18,0.36)] backdrop-blur-2xl ${
          keyboardOffset > 0 ? "pb-2" : "pb-[calc(env(safe-area-inset-bottom)+0.55rem)]"
        }`}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <label
            aria-label="星影を添える"
            className={`group inline-flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-full text-center transition active:scale-95 ${
              imageInputDisabled
                ? hasImages
                  ? "cursor-not-allowed bg-comet/15 text-comet shadow-[0_0_18px_rgba(103,232,249,0.16)]"
                  : "cursor-not-allowed bg-white/[0.03] text-slate-600"
                : hasImages
                  ? "cursor-pointer bg-comet/15 text-comet shadow-[0_0_18px_rgba(103,232,249,0.22)] hover:bg-comet/20"
                  : "cursor-pointer bg-white/5 text-slate-300 hover:bg-comet/10 hover:text-comet"
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full border border-current/25 bg-white/5">
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path
                  d="M4.75 7.5A2.75 2.75 0 0 1 7.5 4.75h9A2.75 2.75 0 0 1 19.25 7.5v9a2.75 2.75 0 0 1-2.75 2.75h-9A2.75 2.75 0 0 1 4.75 16.5v-9Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="m6.75 15.75 3.25-3.3 2.35 2.35 1.8-1.8 3.1 2.75"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M14.75 8.75h.01"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                />
              </svg>
            </span>
            <span className="text-[10px] font-black leading-none">星影</span>
            <input
              accept={composer.imageAccept}
              className="sr-only"
              disabled={imageInputDisabled}
              multiple
              onChange={composer.onImageFileChange}
              type="file"
            />
          </label>

          <label
            aria-label="星映を添える"
            className={`group inline-flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-full text-center transition active:scale-95 ${
              videoInputDisabled
                ? hasVideo
                  ? "cursor-not-allowed bg-aurora/15 text-aurora shadow-[0_0_18px_rgba(167,139,250,0.16)]"
                  : "cursor-not-allowed bg-white/[0.03] text-slate-600"
                : hasVideo
                  ? "cursor-pointer bg-aurora/15 text-aurora shadow-[0_0_18px_rgba(167,139,250,0.22)] hover:bg-aurora/20"
                  : "cursor-pointer bg-white/5 text-slate-300 hover:bg-aurora/10 hover:text-aurora"
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full border border-current/25 bg-white/5">
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path
                  d="M4.75 7.5A2.75 2.75 0 0 1 7.5 4.75h9A2.75 2.75 0 0 1 19.25 7.5v9a2.75 2.75 0 0 1-2.75 2.75h-9A2.75 2.75 0 0 1 4.75 16.5v-9Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="m10 8.75 5 3.25-5 3.25v-6.5Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
              </svg>
            </span>
            <span className="text-[10px] font-black leading-none">
              {composer.videoPreparing ? "確認中" : "星映"}
            </span>
            <input
              accept={composer.videoAccept}
              className="sr-only"
              disabled={videoInputDisabled}
              onChange={composer.onVideoFileChange}
              type="file"
            />
          </label>

          <button
            aria-label="流星タグを入力"
            className={`group inline-flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-full text-center transition active:scale-95 ${
              meteorTagInputDisabled
                ? "cursor-not-allowed bg-white/[0.03] text-slate-600"
                : "bg-amber-300/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.16)] hover:bg-amber-300/15 hover:text-amber-50"
            }`}
            data-card-action="true"
            disabled={meteorTagInputDisabled}
            onClick={handleInsertMeteorTag}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full border border-current/30 bg-amber-300/10 text-xl font-black">
              #
            </span>
            <span className="text-[10px] font-black leading-none">流星タグ</span>
          </button>
        </div>
      </div>
    </form>
  );
}

function PostImageDraftPreview({ disabled, drafts, onMove, onRemove }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {drafts.map((draft, index) => (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-night-950/55" key={draft.id}>
          <img
            alt=""
            className="aspect-square w-full object-cover"
            draggable={false}
            src={draft.previewUrl}
          />
          <div className="space-y-2 p-2">
            <p className="truncate text-[11px] font-bold text-slate-400">
              {index + 1} / {METEOR_IMAGE_MAX_COUNT}
            </p>
            <div className="grid grid-cols-3 gap-1">
              <button
                className="min-h-8 rounded-xl border border-white/10 bg-white/5 text-[11px] font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled || index === 0}
                onClick={() => onMove(draft.id, -1)}
                type="button"
              >
                前へ
              </button>
              <button
                className="min-h-8 rounded-xl border border-white/10 bg-white/5 text-[11px] font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled || index === drafts.length - 1}
                onClick={() => onMove(draft.id, 1)}
                type="button"
              >
                後ろ
              </button>
              <button
                className="min-h-8 rounded-xl border border-sakura/30 bg-sakura/10 text-[11px] font-black text-sakura disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled}
                onClick={() => onRemove(draft.id)}
                type="button"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PostVideoDraftPreview({ disabled, draft, onRemove }) {
  if (!draft) {
    return null;
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-night-950/55">
      <video
        className="aspect-video w-full bg-black object-contain"
        controls
        playsInline
        preload="metadata"
        src={draft.previewUrl}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-white">{draft.displayName || draft.name || "選択した星映"}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">
            {formatMediaDuration(draft.durationSeconds)} / {formatFileSize(draft.size)}
            {draft.wasTrimmed ? " / 切り取り済み" : ""}
          </p>
        </div>
        <button
          className="min-h-9 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 text-[11px] font-black text-sakura disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          星映を削除
        </button>
      </div>
    </div>
  );
}

function PostThumbnailDraftPreview({ disabled, draft, onEdit, onRemove }) {
  if (!draft) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <img
        alt=""
        className="h-20 w-28 rounded-2xl border border-white/10 object-cover"
        draggable={false}
        src={draft.previewUrl}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black text-white">{draft.displayName || draft.name || "星映の表紙"}</p>
        <p className="mt-1 text-[11px] font-bold text-slate-400">{formatFileSize(draft.size)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-9 rounded-2xl border border-comet/30 bg-comet/10 px-3 text-[11px] font-black text-comet disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onEdit}
          type="button"
        >
          表紙を調整
        </button>
        <button
          className="min-h-9 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 text-[11px] font-black text-sakura disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          削除
        </button>
      </div>
    </div>
  );
}

function PostCard({
  archive,
  detailMode = false,
  onboarding,
  onOpenAuthorProfile,
  onOpenDetail,
  onOpenMedia,
  onOpenStarMovieObservation,
  post,
  postActions,
  resonance,
  showStarLetters = false,
  starLetters,
}) {
  const resonanceCount = Number.isFinite(post.resonanceCount) ? post.resonanceCount : 0;
  const isResonanceSaving = resonance?.savingPostId === post.id;
  const isArchiveSaving = archive?.savingPostId === post.id;
  const isArchived = archive?.archivedPostIds?.includes(post.id);
  const isOwnPost = postActions?.session?.user?.id === post.authorId;
  const isPostEditing = postActions?.editingId === post.id;
  const postEditDraft = postActions?.editDrafts?.[post.id] ?? post.text;
  const postEditLength = getTrimmedCharacterLength(postEditDraft);
  const isPostEditOverLimit = postEditLength > POST_MAX_LENGTH;
  const postEditTagValidation = validateMeteorTagsFromText(postEditDraft);
  const postMedia = post.media ?? [];
  const youtubeVideoId = !isPostEditing ? findFirstYouTubeVideoId(post.text) : null;
  const isPostUpdating = postActions?.updatingId === post.id;
  const isPostDeleting = postActions?.deletingId === post.id;
  const canSavePostEdit =
    (Boolean(postEditDraft.trim()) || postMedia.length > 0) &&
    !isPostEditOverLimit &&
    !postEditTagValidation.error &&
    !isPostUpdating;
  const postStarLetters = starLetters?.itemsByPostId?.[post.id] ?? [];
  const isStarLettersOpen = showStarLetters || starLetters?.openPostId === post.id;
  const isStarLetterSaving = starLetters?.savingPostId === post.id;
  const sunoUrl = !isPostEditing ? findFirstSunoUrl(post.text) : null;
  const resonanceLabel = `${resonanceCount} 共鳴`;
  const starLetterLabel = `星文 ${postStarLetters.length}`;
  const canOpenDetail = Boolean(onOpenDetail && post.id && !detailMode);
  const authorUsername = post.authorUsername;
  const canOpenAuthorProfile = Boolean(onOpenAuthorProfile && authorUsername);
  const isOnboardingTargetPost =
    onboarding?.active && onboarding.targetPostId === post.id;

  function isCardActionTarget(target) {
    return Boolean(
      target?.closest?.("button, a, input, textarea, select, label, [data-card-action='true']"),
    );
  }

  function handleOpenAuthorProfile(event) {
    event.stopPropagation();

    if (canOpenAuthorProfile) {
      onOpenAuthorProfile(authorUsername);
    }
  }

  function handleOpenDetail(event) {
    if (canOpenDetail && !isCardActionTarget(event.target)) {
      onOpenDetail(post.id);
    }
  }

  function handleOpenDetailKeyDown(event) {
    if (!canOpenDetail || event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetail(post.id);
    }
  }

  function handleOpenUploadObservation(item, triggerElement) {
    const media = createUploadMovieObservationMedia(item);

    if (media) {
      onOpenStarMovieObservation?.(post, media, triggerElement);
    }
  }

  function handleOpenYouTubeObservation(triggerElement) {
    const media = createYouTubeMovieObservationMedia(youtubeVideoId);

    if (media) {
      onOpenStarMovieObservation?.(post, media, triggerElement);
    }
  }

  return (
    <article
      aria-label={canOpenDetail ? `${post.name}の流星便を開く` : undefined}
      className={`glass-panel post-card-panel post-card group overflow-hidden ${
        canOpenDetail ? "is-clickable" : ""
      }`}
      data-onboarding-target={isOnboardingTargetPost ? "onboarding-archive-post" : undefined}
      onClick={handleOpenDetail}
      onKeyDown={handleOpenDetailKeyDown}
      role={canOpenDetail ? "link" : undefined}
      tabIndex={canOpenDetail ? 0 : undefined}
    >
      <div className={`h-1 bg-gradient-to-r ${post.glow}`} />
      <div className="post-card-content p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {canOpenAuthorProfile ? (
            <button
              aria-label={`${post.name}の星座を開く`}
              className="inline-flex flex-none self-start rounded-2xl outline-none transition hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-comet/25"
              data-card-action="true"
              onClick={handleOpenAuthorProfile}
              type="button"
            >
              <AvatarFrame avatar={post.avatar} avatarUrl={post.avatarUrl} frame={post.avatarFrame} />
            </button>
          ) : (
            <AvatarFrame avatar={post.avatar} avatarUrl={post.avatarUrl} frame={post.avatarFrame} />
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {canOpenAuthorProfile ? (
                <button
                  className="min-w-0 max-w-full truncate text-left font-black text-white transition hover:text-comet focus-visible:rounded focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/20"
                  data-card-action="true"
                  onClick={handleOpenAuthorProfile}
                  type="button"
                >
                  {post.name}
                </button>
              ) : (
                <h3 className="font-black text-white">{post.name}</h3>
              )}
              <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-0.5 text-[11px] font-bold text-comet">
                {post.badge}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {canOpenAuthorProfile ? (
                <button
                  className="text-sm text-slate-500 transition hover:text-comet focus-visible:rounded focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/20"
                  data-card-action="true"
                  onClick={handleOpenAuthorProfile}
                  type="button"
                >
                  {post.handle}
                </button>
              ) : (
                <span className="text-sm text-slate-500">{post.handle}</span>
              )}
              <span className="text-sm text-slate-500">· {post.time}</span>
            </div>
          </div>
        </div>
        {post.archivedTime && (
          <p className="mt-3 text-[11px] font-bold text-comet/80">Archive: {post.archivedTime}</p>
        )}
        {isPostEditing ? (
          <form
            className="mt-3 rounded-2xl border border-white/10 bg-night-950/45 p-3"
            data-card-action="true"
            onSubmit={(event) => postActions?.onUpdate?.(event, post)}
          >
            <MeteorTagTextarea
              className="min-h-28 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 p-3 text-sm leading-7 text-white outline-none placeholder:text-slate-500 focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPostUpdating}
              maxLength={POST_MAX_LENGTH + 1}
              onChange={(event) => postActions?.onEditChange?.(post.id, event.target.value)}
              placeholder="流星便の本文を編集する"
              value={postEditDraft}
            />
            <PostMediaGrid media={postMedia} onOpenMedia={onOpenMedia} />
            {isPostEditOverLimit && (
              <p className="mt-2 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
                流星便は500文字以内で放流してください
              </p>
            )}
            {postEditTagValidation.error && (
              <p className="mt-2 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
                {postEditTagValidation.error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-slate-500">
                <span className={isPostEditOverLimit ? "font-black text-sakura" : "text-slate-600"}>
                  {postEditLength}/{POST_MAX_LENGTH}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPostUpdating}
                  onClick={() => postActions?.onCancelEdit?.(post.id)}
                  type="button"
                >
                  キャンセル
                </button>
                <button
                  className="min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canSavePostEdit}
                  type="submit"
                >
                  {isPostUpdating ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <>
            {post.text ? (
              <p className={`${detailMode ? "text-base sm:text-lg" : "text-[15px]"} mt-3 whitespace-pre-wrap leading-8 text-slate-100`}>
                <LinkedText highlightMeteorTags onMeteorTagClick={postActions?.onOpenMeteorTag}>
                  {post.text}
                </LinkedText>
              </p>
            ) : null}
            <YouTubeEmbed
              onOpenObservation={handleOpenYouTubeObservation}
              videoId={youtubeVideoId}
            />
            <SunoLinkCard url={sunoUrl} />
            <PostMediaGrid
              media={postMedia}
              onOpenMedia={onOpenMedia}
              onOpenObservation={handleOpenUploadObservation}
            />
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-400">
          <ActionButton
            disabled={isResonanceSaving || !resonance?.onResonate}
            icon="♡"
            label={isResonanceSaving ? "共鳴中..." : resonanceLabel}
            onClick={() => resonance?.onResonate?.(post.id)}
          />
          <ActionButton
            active={isStarLettersOpen}
            disabled={!starLetters?.onToggle}
            icon="✎"
            label={starLetterLabel}
            onClick={() => starLetters?.onToggle?.(post.id)}
          />
          <ActionButton
            active={isArchived}
            dataOnboardingTarget={
              isOnboardingTargetPost && onboarding.currentStep === "archive_prompt"
                ? "onboarding-archive-action"
                : undefined
            }
            disabled={isArchiveSaving || !archive?.onToggleArchive}
            icon="✦"
            label={isArchiveSaving ? "Archive中..." : isArchived ? "Archive済み" : "Archive"}
            onClick={() => archive?.onToggleArchive?.(post.id)}
          />
          {isOwnPost && !post.deletedAt && (
            <>
              <ActionButton
                active={isPostEditing}
                disabled={isPostUpdating || isPostDeleting || !postActions?.onStartEdit}
                icon="✐"
                label={isPostEditing ? "編集中" : "編集"}
                onClick={() => postActions?.onStartEdit?.(post)}
                variant="edit"
              />
              <ActionButton
                disabled={isPostDeleting || isPostUpdating || !postActions?.onDelete}
                icon="×"
                label={isPostDeleting ? "削除中..." : "削除"}
                onClick={() => postActions?.onDelete?.(post)}
                variant="danger"
              />
            </>
          )}
        </div>
        {isStarLettersOpen && (
          <StarLettersPanel
            draft={starLetters?.drafts?.[post.id] ?? ""}
            letters={postStarLetters}
            loading={starLetters?.loading}
            postId={post.id}
            onChange={(value) => starLetters?.onChange?.(post.id, value)}
            onSubmit={(event) => starLetters?.onSubmit?.(event, post.id)}
            saving={isStarLetterSaving}
            starLetters={starLetters}
          />
        )}
      </div>
    </article>
  );
}

function StarLettersPanel({ draft, letters, loading, postId, onChange, onSubmit, saving, starLetters }) {
  const threadRows = buildStarLetterThreadRows(letters);
  const trimmedLength = getTrimmedCharacterLength(draft);
  const isOverLimit = trimmedLength > STAR_LETTER_MAX_LENGTH;
  const helperText = !starLetters?.canWrite
    ? "ログインすると星文を送れます。"
    : !starLetters?.hasProfile
      ? "先にプロフィールを保存すると星文を送れます。"
      : "500文字以内で、この流星便に言葉を残せます。";
  const canSubmit = starLetters?.canWrite && starLetters?.hasProfile && draft.trim() && !isOverLimit && !saving;

  return (
    <div
      className="mt-5 rounded-3xl border border-white/10 bg-night-950/35 p-3 sm:p-4"
      data-card-action="true"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {(starLetters?.message || starLetters?.error) && (
        <div
          className={`mb-3 rounded-2xl border px-3 py-2 text-xs leading-5 ${
            starLetters.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
          role={starLetters.error ? "alert" : "status"}
        >
          <p>{starLetters.error || starLetters.message}</p>
          {starLetters.error && postId && (
            <button
              className="mt-2 min-h-9 rounded-xl border border-sakura/30 px-3 text-xs font-bold text-sakura transition hover:bg-sakura/10"
              onClick={() => starLetters?.onRetry?.(postId)}
              type="button"
            >
              再試行
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-xs leading-6 text-slate-400">星文を読み込み中...</p>
        ) : threadRows.length === 0 ? (
          <p className="text-xs leading-6 text-slate-500">まだ星文はありません。</p>
        ) : (
          threadRows.map((letter) => <StarLetterItem key={letter.id} letter={letter} starLetters={starLetters} />)
        )}
      </div>

      <form className="mt-4 border-t border-white/10 pt-4" onSubmit={onSubmit}>
        <textarea
          className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-night-950/60 p-3 text-sm leading-7 text-white outline-none placeholder:text-slate-500 focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!starLetters?.canWrite || !starLetters?.hasProfile || saving}
          onChange={(event) => onChange(event.target.value)}
          placeholder="この流星便に星文を残す"
          value={draft}
        />
        {isOverLimit && (
          <p className="mt-2 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
            星文は500文字以内で送ってください
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-slate-500">
            {helperText}{" "}
            <span className={isOverLimit ? "font-black text-sakura" : "text-slate-600"}>
              {trimmedLength}/{STAR_LETTER_MAX_LENGTH}
            </span>
          </p>
          <button
            className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmit}
            type="submit"
          >
            {saving ? "送信中..." : "星文を送る"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StarLetterItem({ letter, starLetters }) {
  const isOwner = starLetters?.session?.user?.id === letter.authorId;
  const isEditing = starLetters?.editingId === letter.id;
  const isReplying = starLetters?.replyComposer?.parentStarLetterId === letter.id;
  const editDraft = starLetters?.editDrafts?.[letter.id] ?? letter.body;
  const replyDraft = isReplying ? starLetters?.replyComposer?.body ?? "" : "";
  const editTrimmedLength = getTrimmedCharacterLength(editDraft);
  const replyTrimmedLength = getTrimmedCharacterLength(replyDraft);
  const isEditOverLimit = editTrimmedLength > STAR_LETTER_MAX_LENGTH;
  const isReplyOverLimit = replyTrimmedLength > STAR_LETTER_MAX_LENGTH;
  const canSaveEdit = Boolean(editDraft.trim()) && !isEditOverLimit && starLetters?.updatingId !== letter.id;
  const canSubmitReply = Boolean(replyDraft.trim()) && !isReplyOverLimit && starLetters?.replySavingId !== letter.id;
  const isDeleting = starLetters?.deletingId === letter.id;
  const isResonating = starLetters?.resonatingIds?.has(letter.id);
  const isArchiving = starLetters?.archivingIds?.has(letter.id);
  const canUseConversation = letter.conversationAvailable && !letter.isDeleted;

  return (
    <article
      aria-label={`${letter.name}の星文`}
      className={`rounded-2xl border bg-white/5 px-3 py-3 transition-colors ${
        letter.displayDepth ? "ml-3 border-l-2 border-l-comet/30 border-white/10 sm:ml-5" : "border-white/10"
      } ${starLetters?.highlightedId === letter.id ? "border-comet/60 bg-comet/10 shadow-glow" : ""}`}
      id={`star-letter-${letter.id}`}
      tabIndex={-1}
    >
      <div className="flex gap-3">
        <AvatarFrame avatar={letter.avatar} avatarUrl={letter.avatarUrl} className="h-9 w-9 rounded-2xl text-xs" frame={letter.avatarFrame} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-black text-white">{letter.name}</span>
            <span className="text-xs text-slate-500">{letter.handle}</span>
            <span className="text-xs text-slate-500">· {letter.time}</span>
            {letter.isDeleted ? <span className="text-[11px] font-bold text-slate-500">削除済み</span> : null}
          </div>
          {isEditing && !letter.isDeleted ? (
            <form className="mt-3" onSubmit={(event) => starLetters?.onUpdate?.(event, letter)}>
              <textarea
                aria-label="星文を編集"
                className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 p-3 text-sm leading-7 text-white outline-none placeholder:text-slate-500 focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={starLetters?.updatingId === letter.id}
                onChange={(event) => starLetters?.onEditChange?.(letter.id, event.target.value)}
                value={editDraft}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className={`text-xs leading-5 ${isEditOverLimit ? "font-black text-sakura" : "text-slate-500"}`}>
                  {editTrimmedLength}/{STAR_LETTER_MAX_LENGTH}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300" disabled={starLetters?.updatingId === letter.id} onClick={() => starLetters?.onCancelEdit?.(letter.id)} type="button">キャンセル</button>
                  <button className="min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet disabled:cursor-not-allowed disabled:opacity-60" disabled={!canSaveEdit} type="submit">{starLetters?.updatingId === letter.id ? "保存中..." : "保存"}</button>
                </div>
              </div>
            </form>
          ) : (
            <>
              <p className={`mt-2 whitespace-pre-wrap text-sm leading-7 ${letter.isDeleted ? "text-slate-500" : "text-slate-200"}`}>
                <LinkedText>{letter.isDeleted ? "削除された星文です。" : letter.body}</LinkedText>
              </p>
              {letter.conversationAvailable ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="min-h-8 rounded-full border border-comet/25 bg-comet/10 px-3 text-[11px] font-black text-comet disabled:cursor-not-allowed disabled:opacity-60" disabled={!canUseConversation || isResonating} onClick={() => starLetters?.onResonate?.(letter)} type="button">{isResonating ? "共鳴中..." : `共鳴 ${letter.totalResonanceCount}`}{letter.viewerResonanceCount ? ` · あなた ${letter.viewerResonanceCount}` : ""}</button>
                  <button className="min-h-8 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canUseConversation || isArchiving} onClick={() => starLetters?.onArchive?.(letter)} type="button">{isArchiving ? "更新中..." : letter.isArchived ? "Archive解除" : "Archive"}</button>
                  <button className="min-h-8 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canUseConversation} onClick={() => starLetters?.onStartReply?.(letter)} type="button">星文を返す</button>
                  <button className="min-h-8 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-black text-slate-400" onClick={() => starLetters?.onOpenThread?.(letter.postId, letter.id)} type="button">この会話を見る</button>
                  {isOwner ? <button className={`min-h-8 rounded-full border px-3 text-[11px] font-black ${getActionButtonTone("edit")}`} onClick={() => starLetters?.onStartEdit?.(letter)} type="button">編集</button> : null}
                  {isOwner ? <button className={`min-h-8 rounded-full border px-3 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-60 ${getActionButtonTone("danger")}`} disabled={isDeleting} onClick={() => starLetters?.onDelete?.(letter)} type="button">{isDeleting ? "削除中..." : "削除"}</button> : null}
                </div>
              ) : null}
            </>
          )}
          {isReplying ? (
            <form className="mt-3 border-t border-white/10 pt-3" onSubmit={starLetters?.onReplySubmit}>
              <p className="text-xs font-bold text-comet">{letter.name}さんへ星文を返す</p>
              <textarea aria-label="星文を返す本文" className="mt-2 min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 p-3 text-sm leading-7 text-white outline-none focus:border-comet/40 focus:ring-4 focus:ring-comet/10" disabled={starLetters?.replySavingId === letter.id} onChange={(event) => starLetters?.onReplyChange?.(event.target.value)} placeholder="この星文に言葉を返す" value={replyDraft} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs ${isReplyOverLimit ? "font-black text-sakura" : "text-slate-500"}`}>{replyTrimmedLength}/{STAR_LETTER_MAX_LENGTH}</span>
                <div className="flex gap-2"><button className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300" disabled={starLetters?.replySavingId === letter.id} onClick={() => starLetters?.onCancelReply?.()} type="button">キャンセル</button><button className="min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet disabled:cursor-not-allowed disabled:opacity-60" disabled={!canSubmitReply} type="submit">{starLetters?.replySavingId === letter.id ? "送信中..." : "星文を返す"}</button></div>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Panel({ eyebrow, title, children }) {
  return (
    <section className="glass-panel p-4">
      <p className="text-xs font-bold uppercase text-comet">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-black text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function getActionButtonTone(variant = "default", active = false) {
  if (variant === "edit") {
    return active
      ? "border-amber-200/60 bg-amber-300/20 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.18)]"
      : "border-amber-300/35 bg-amber-300/10 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.08)] hover:border-amber-200/55 hover:bg-amber-300/18 hover:text-white";
  }

  if (variant === "danger") {
    return active
      ? "border-sakura/55 bg-sakura/20 text-rose-50 shadow-[0_0_18px_rgba(255,120,168,0.16)]"
      : "border-sakura/35 bg-sakura/10 text-sakura shadow-[0_0_14px_rgba(255,120,168,0.08)] hover:border-sakura/55 hover:bg-sakura/16 hover:text-rose-50";
  }

  return active
    ? "border-comet/40 bg-comet/15 text-white"
    : "border-white/10 bg-white/5 hover:border-comet/30 hover:bg-comet/10 hover:text-white";
}

function ActionButton({
  active = false,
  dataOnboardingTarget,
  disabled = false,
  icon,
  label,
  onClick,
  variant = "default",
}) {
  function handleClick(event) {
    event.stopPropagation();
    onClick?.(event);
  }

  return (
    <button
      className={`flex min-h-9 items-center gap-2 rounded-full border px-3 transition disabled:cursor-not-allowed disabled:opacity-70 ${getActionButtonTone(
        variant,
        active,
      )}`}
      data-onboarding-target={dataOnboardingTarget}
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      <span className="text-comet">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default App;

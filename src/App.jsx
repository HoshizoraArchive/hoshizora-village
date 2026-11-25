import { useCallback, useEffect, useRef, useState } from "react";
import { createPostMediaTaskGate } from "./lib/postMediaTaskGate.js";
import { useAuthSessionLifecycle } from "./hooks/useAuthSessionLifecycle.js";
import { useVillageRouteViewState } from "./hooks/useVillageRouteViewState.js";
import { usePostMediaDraftState } from "./hooks/usePostMediaDraftState.js";
import { useStarLetterUiState } from "./hooks/useStarLetterUiState.js";
import { useFeedbackUiState } from "./hooks/useFeedbackUiState.js";
import {
  ERROR_OPERATION,
  createUserFacingError,
  getUserFacingError,
  isSafeUserFacingError,
  logSafeError,
} from "./safeErrors";
import { supabase } from "./lib/supabaseClient";
import ChiaMemorySettings from "./ChiaMemorySettings";
import privacyPolicyMarkdown from "./legal/privacy-policy.md?raw";
import termsOfServiceMarkdown from "./legal/terms-of-service.md?raw";
import VillageGuideAdminScreen from "./VillageGuideAdmin";
import ContentReportDialog from "./ContentReportDialog";
import ObservationStationAdminScreen from "./ObservationStationAdmin";
import StarMovieObservationMode from "./StarMovieObservationMode";
import ObserveBrandHeader from "./ObserveBrandHeader";
import InteractiveOnboarding from "./InteractiveOnboarding";
import AuthConfirmationPanel from "./AuthConfirmationPanel";
import PasswordRecoveryPanel from "./PasswordRecoveryPanel";
import ProfileTitleBadge from "./ProfileTitleBadge";
import ProfileTitleEmblem from "./ProfileTitleEmblem";
import { isPinnedPost, orderPostsWithPinnedFirst } from "./pinnedPosts.mjs";
import { comparePostsByCreatedAtDesc, mixHumanResurfacePosts } from "./humanResurface.mjs";
import {
  PROFILE_TITLES_RELATION_SELECT,
  getPrimaryProfileTitle,
  isMissingProfileTitlesSchemaError,
} from "./profileTitles";
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
  getStarLetterThreadSnapshot,
  setStarLetterArchived,
  updateStarLetter,
} from "./starLetterConversations";
import {
  buildStarLetterThreadRows,
  createOperationRequestIdStore,
  isStarLetterThreadNotification,
} from "./starLetterThread";
import {
  OBSERVE_PULL_REFRESH_THRESHOLD_PX,
  OBSERVE_TIMELINE_POLL_INTERVAL_MS,
  getObservePullGesture,
  isInteractiveObserveTimelineTarget,
  isPublicPostNewer,
  isUnseenPublicTimelinePost,
  runLatestQueuedOperation,
  runObserveTimelineSingleFlight,
  shouldTriggerObservePullRefresh,
} from "./observeTimelineRefresh";
import {
  APP_FOREGROUND_REFRESH_MIN_HIDDEN_MS,
  createEntityRequestVersionStore,
  createEntityRevisionStore,
  getEngagementVersion,
  getPostContentVersion,
  getStarThreadVersion,
  isRevisionComponentBehind,
  reconcileRefreshedPosts,
  shouldRefreshAfterForeground,
} from "./appDataFreshness";
import {
  addPostResonance,
  createPost as createPostMutation,
  createRootStarLetter,
  deletePost as deletePostMutation,
  insertPostAssets,
  mergeDiscoveredPostRows,
  readArchivedPostSnapshots,
  readPostEngagementSnapshots,
  readPostSnapshots,
  readStarThreadSnapshots,
  replacePostTags,
  setPostArchived,
  updatePost as updatePostMutation,
} from "./dataRevisionApi";
import {
  BLACK_HOLE_ERROR_MESSAGE,
  BLACK_HOLE_RESTORE_ERROR_MESSAGE,
  BLACK_HOLE_SUCCESS_MESSAGE,
  blockProfile,
  isMissingProfileBlocksSchemaError,
  isProfileBlocked,
  isTrustedProtectedProfile,
  readBlockedProfileIds,
  readMyProfileBlocks,
  unblockProfile,
} from "./profileBlocking";
import {
  CONTENT_REPORT_DUPLICATE_MESSAGE,
  CONTENT_REPORT_ERROR_MESSAGE,
  CONTENT_REPORT_SUCCESS_MESSAGE,
  canReportContent,
  createContentReport,
  createContentReportSingleFlight,
  isMissingContentReportsSchemaError,
  validateContentReportInput,
} from "./contentReports";
import {
  getOwnedAvatarStoragePath,
  runProfileSaveWithAvatarLifecycle,
  saveProfileWithAvatarGuard,
} from "./profileAvatarStorage";
import {
  AUTH_CONFIRMATION_KIND,
  AUTH_CONFIRMATION_RESEND_COOLDOWN_MS,
  AUTH_PASSWORD_RECOVERY_COOLDOWN_MS,
  AUTH_PASSWORD_RECOVERY_KIND,
  AUTH_PASSWORD_RECOVERY_PATH,
  getAuthCallbackIntent,
  getAuthConfirmationCooldownSeconds,
  getPasswordRecoveryRedirectUrl,
  finishAuthAction,
  isAuthEmailRateLimitError,
  isEmailNotConfirmedError,
  isPasswordRecoveryAccountLookupError,
  isPasswordRecoverySessionError,
  isVerifiedPasswordRecoveryUser,
  tryStartAuthAction,
  validatePasswordRecoveryPasswords,
} from "./authConfirmation";
import { OFFICIAL_X_URL } from "./lib/appSiteConfig";
import { defaultProfileView, getAvatarText } from "./lib/profileUi";
import { AuthPanel, LegalDocumentModal, LegalDocumentScreen } from "./components/AuthAndLegalScreens";
import { PushNotificationTestCard } from "./components/PushNotificationTestCard";
import { PublicProfileCard, ProfileCard, ProfileEditor, ProfileEditScreen, AvatarPreviewModal } from "./components/ProfileCards";
import { AvatarCropModal, PostCoverCropModal, PostVideoTrimModal } from "./components/MediaEditors";
import { PostImageDraftPreview, PostVideoDraftPreview, PostThumbnailDraftPreview } from "./components/MediaDraftPreviews";
import { YouTubeEmbed, SunoLinkCard, PostMediaGrid, PostMediaViewerModal } from "./components/PostMediaViews";
import { SkyBackdrop, StardustForeground } from "./components/BackgroundEffects";
import { AvatarFrame } from "./components/AvatarFrame";
import { Panel } from "./components/Panel";
import { BottomNav } from "./components/BottomNav";
import { BlackHoleConfirmationDialog } from "./components/BlackHoleConfirmationDialog";
import { LinkedText } from "./components/LinkedText";
import { Composer, METEOR_COMPOSER_FORM_ID } from "./components/PostComposer";
import { PostCard } from "./components/PostCard";
import {
  STAR_LETTER_MAX_LENGTH,
  POST_MAX_LENGTH,
  METEOR_TAG_MAX_COUNT,
  getTrimmedCharacterLength,
  normalizeMeteorTagName,
  getMeteorTagSearchKey,
  getMeteorTagLabel,
  validateMeteorTagsFromText,
} from "./lib/postTextUtils";

import { AVATAR_CROP_MIN_ZOOM, AVATAR_CROP_MAX_ZOOM, METEOR_VIDEO_MAX_DURATION_SECONDS, METEOR_IMAGE_MAX_COUNT, YOUTUBE_VIDEO_ID_PATTERN, clampNumber, getAvatarCoverScale, constrainAvatarCropOffset, getPostCoverCropScale, constrainPostCoverCropOffset, formatMediaDuration, formatFileSize } from "./lib/mediaEditorUtils";





const FEEDBACK_MAX_LENGTH = 1000;



const FEEDBACK_TYPES = ["不具合", "分かりにくい", "改善案", "ほしい機能", "感想", "その他"];
const POST_SELECT_COLUMNS = "id, author_id, type, body, visibility, created_at";
const POST_SELECT_COLUMNS_WITH_DELETED_AT = `${POST_SELECT_COLUMNS}, deleted_at`;
const PUBLIC_POST_FRESHNESS_SELECT_COLUMNS = "id, author_id, created_at, visibility, type";
const PUBLIC_POST_FRESHNESS_SELECT_COLUMNS_WITH_DELETED_AT = `${PUBLIC_POST_FRESHNESS_SELECT_COLUMNS}, deleted_at`;
const METEOR_TAG_SELECT_COLUMNS = "id, name, normalized_name, created_by, created_at";
const POST_METEOR_TAG_SELECT_COLUMNS = "post_id, tag_id, sort_order, meteor_tags(id, name, normalized_name)";



const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_CROP_SIZE = 512;


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

const METEOR_IMAGE_MAX_SIZE_BYTES = 8 * 1024 * 1024;
const METEOR_IMAGE_ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const METEOR_IMAGE_ACCEPT = Object.keys(METEOR_IMAGE_ALLOWED_TYPES).join(",");

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
const PROFILE_DETAIL_SELECT_COLUMNS = "id, display_name, username, avatar_url, bio, constellation_note, pinned_post_id";
const PROFILE_DETAIL_SELECT_COLUMNS_WITH_FRAME = `${PROFILE_DETAIL_SELECT_COLUMNS}, active_frame_id`;
const PROFILE_FRAME_SELECT_COLUMNS =
  "id, frame_key, name, description, asset_path, acquisition_type, rarity, frame_scale, frame_offset_x, frame_offset_y, is_active, created_at, updated_at";
const PROFILE_FRAME_OWNERSHIP_SELECT_COLUMNS = "profile_id, frame_id, acquisition_source, granted_at";
const VISIBLE_POST_TYPES = ["text", "image", "video", "youtube"];
const LEGAL_TERMS_VERSION = "2026-07-10";
const LEGAL_PRIVACY_VERSION = "2026-07-10";
const LEGAL_CONSENT_REQUIRED_AFTER_MS = Date.parse("2026-07-10T00:00:00.000Z");


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









function isSameAvatarCropOffset(currentOffset, nextOffset) {
  return Math.abs(currentOffset.x - nextOffset.x) < 0.5 && Math.abs(currentOffset.y - nextOffset.y) < 0.5;
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

async function reserveStorageUploadPath(bucket, extension) {
  const { data, error } = await supabase.rpc("reserve_storage_upload_v1", {
    p_bucket_id: bucket,
    p_extension: extension,
  });

  if (error) {
    return { error, path: null };
  }

  if (typeof data !== "string" || !data) {
    return {
      error: new Error("Storage upload reservation did not return a path."),
      path: null,
    };
  }

  return { error: null, path: data };
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

function revokePostVideoTrimDraft(draft) {
  if (draft?.previewUrl) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

function revokePostThumbnailDraft(draft) {
  if (draft?.previewUrl) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

function revokePostMediaDrafts({ imageDrafts, thumbnailDraft, videoDraft, videoTrimDraft }) {
  for (const draft of imageDrafts) {
    revokePostImageDraft(draft);
  }

  revokePostVideoDraft(videoDraft);
  revokePostThumbnailDraft(thumbnailDraft);
  revokePostVideoTrimDraft(videoTrimDraft);
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

function applyQueryAbortSignal(query, signal) {
  return signal && typeof query?.abortSignal === "function" ? query.abortSignal(signal) : query;
}

async function attachVersionedPostSnapshots(result, signal) {
  if (result.error || !result.data) {
    return result;
  }

  const isArrayResult = Array.isArray(result.data);
  const discoveredRows = isArrayResult ? result.data : [result.data];

  if (discoveredRows.length === 0) {
    return result;
  }

  try {
    const snapshots = await readPostSnapshots(
      supabase,
      discoveredRows.map((post) => post.id),
      { signal },
    );
    const versionedRows = mergeDiscoveredPostRows(discoveredRows, snapshots);

    return {
      ...result,
      data: isArrayResult ? versionedRows : versionedRows[0] ?? null,
    };
  } catch (error) {
    return {
      ...result,
      data: isArrayResult ? [] : null,
      error,
    };
  }
}

async function runPostQuery(buildQuery, { signal } = {}) {
  const result = await applyQueryAbortSignal(
    buildQuery(POST_SELECT_COLUMNS_WITH_DELETED_AT, true),
    signal,
  );

  if (result.error && isMissingDeletedAtError(result.error)) {
    return attachVersionedPostSnapshots({
      ...(await applyQueryAbortSignal(buildQuery(POST_SELECT_COLUMNS, false), signal)),
      supportsSoftDelete: false,
    }, signal);
  }

  return attachVersionedPostSnapshots({
    ...result,
    supportsSoftDelete: true,
  }, signal);
}

async function readLatestPublicPost() {
  const buildQuery = (columns, supportsSoftDelete) => {
    let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).eq("visibility", "public"));

    if (supportsSoftDelete) {
      query = query.is("deleted_at", null);
    }

    return query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  };
  const result = await buildQuery(PUBLIC_POST_FRESHNESS_SELECT_COLUMNS_WITH_DELETED_AT, true);

  if (result.error && isMissingDeletedAtError(result.error)) {
    return buildQuery(PUBLIC_POST_FRESHNESS_SELECT_COLUMNS, false);
  }

  return result;
}

async function runProfileQuery(buildQuery, columnsWithFrame, fallbackColumns) {
  let supportsProfileFrames = true;
  let supportsProfileTitles = true;
  let result = await buildQuery(`${columnsWithFrame}, ${PROFILE_TITLES_RELATION_SELECT}`, true);

  if (result.error && isMissingProfileFrameSchemaError(result.error)) {
    supportsProfileFrames = false;
    result = await buildQuery(`${fallbackColumns}, ${PROFILE_TITLES_RELATION_SELECT}`, false);
  }

  if (result.error && isMissingProfileTitlesSchemaError(result.error)) {
    supportsProfileTitles = false;
    result = await buildQuery(supportsProfileFrames ? columnsWithFrame : fallbackColumns, supportsProfileFrames);
  }

  if (result.error && supportsProfileFrames && isMissingProfileFrameSchemaError(result.error)) {
    supportsProfileFrames = false;
    result = await buildQuery(fallbackColumns, false);
  }

  return {
    ...result,
    supportsProfileFrames,
    supportsProfileTitles,
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

function attachMediaToPosts(posts, mediaByPostId) {
  return (posts ?? []).map((post) => ({
    ...post,
    media: mediaByPostId.get(post.id) ?? [],
    mediaLoaded: true,
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
    tagsLoaded: true,
  }));
}

async function hydratePostsWithMeteorTags(posts) {
  const safePosts = posts ?? [];
  const hasVersionedRows = safePosts.every((post) => Array.isArray(post.assetTagRows));

  if (hasVersionedRows) {
    return {
      error: null,
      posts: safePosts.map((post) => ({
        ...post,
        tags: post.assetTagRows
          .map((row) => mapMeteorTagRow(row.meteor_tags, row.sort_order ?? 0))
          .filter((tag) => tag.name),
        tagsLoaded: true,
      })),
    };
  }

  const { tagsByPostId, error } = await readMeteorTagsForPostIds(safePosts.map((post) => post.id));

  if (error) {
    return { error, posts: safePosts };
  }

  return { error: null, posts: attachMeteorTagsToPosts(safePosts, tagsByPostId) };
}

async function hydratePostsWithMedia(posts) {
  const safePosts = posts ?? [];
  const hasVersionedRows = safePosts.every((post) => Array.isArray(post.assetMediaRows));

  if (hasVersionedRows) {
    const hydratedPosts = await Promise.all(
      safePosts.map(async (post) => {
        const media = await mapPostMediaRows(post.assetMediaRows);
        const expectedMediaCount = post.assetMediaRows.filter(
          (row) => (row?.media_type === "image" || row?.media_type === "video") && row.storage_path,
        ).length;

        return {
          ...post,
          media,
          mediaLoaded: media.length === expectedMediaCount,
        };
      }),
    );

    return {
      posts: hydratedPosts,
      error: hydratedPosts.some((post) => post.mediaLoaded === false)
        ? createUserFacingError("星影の一部を読み込めませんでした。")
        : null,
    };
  }

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
    mediaError: mediaResult.error,
    posts: tagResult.posts,
    tagError: tagResult.error,
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

  try {
    const result = await replacePostTags(supabase, {
      postId,
      tagIds: tags.map((tag) => tag.id),
    });

    return { error: null, result, tags };
  } catch (error) {
    return { error, result: null, tags: [] };
  }
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
  if (notification.type === "content_report") {
    return "観測局に新しい異常が届きました";
  }

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
  if (post?.tombstoned || post?.available === false) {
    return {
      id: post.post_id ?? post.id,
      available: false,
      tombstoned: Boolean(post.tombstoned),
      revisionEpoch: post.revision_epoch ?? null,
      contentRevision: post.content_revision ?? "0",
      assetsRevision: post.assets_revision ?? "0",
      viewerContextRevision: post.viewer_context_revision ?? "0",
      assetMediaRows: [],
      assetTagRows: [],
      media: [],
      tags: [],
      mediaLoaded: true,
      tagsLoaded: true,
    };
  }

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
    primaryTitle: getPrimaryProfileTitle(authorProfile),
    createdAt: post.created_at,
    deletedAt: post.deleted_at ?? null,
    time: formatPostTime(post.created_at),
    type: post.type,
    text: post.body,
    visibility: post.visibility,
    revisionEpoch: post.revision_epoch ?? null,
    contentRevision: post.content_revision ?? "0",
    assetsRevision: post.assets_revision ?? "0",
    viewerContextRevision: post.viewer_context_revision ?? "0",
    available: post.available ?? true,
    tombstoned: false,
    assetMediaRows: Array.isArray(post.media_rows) ? post.media_rows : null,
    assetTagRows: Array.isArray(post.tag_rows) ? post.tag_rows : null,
    media: [],
    mediaLoaded: false,
    tags: [],
    tagsLoaded: false,
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
    primaryTitle: getPrimaryProfileTitle(authorProfile),
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
    primaryTitle: getPrimaryProfileTitle(authorProfile),
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
    primaryTitle: getPrimaryProfileTitle(authorProfile),
    time: formatNotificationTime(letter.created_at),
    createdAt: letter.created_at,
    updatedAt: letter.updated_at ?? null,
    editedAt: letter.edited_at ?? null,
  };
}

function App() {
  const { activeTab, setActiveTab, route, setRoute, detailPost, setDetailPost, detailPostLoading,
    setDetailPostLoading, detailPostError, setDetailPostError, publicProfile, setPublicProfile,
    publicProfileTags, setPublicProfileTags, publicProfilePosts, setPublicProfilePosts, publicProfileLoading,
    setPublicProfileLoading, publicProfileError, setPublicProfileError, meteorTagView, setMeteorTagView,
    meteorTagPosts, setMeteorTagPosts, meteorTagLoading, setMeteorTagLoading, meteorTagError,
    setMeteorTagError, shareMessage, setShareMessage, shareError, setShareError, profileShareMessage,
    setProfileShareMessage, profileShareError, setProfileShareError, } = useVillageRouteViewState(getRouteFromLocation);
  const [initialAuthCallback] = useState(() => getAuthCallbackIntent(window.location));
  const [session, setSession] = useState(null);
  const activeSessionUserIdRef = useRef(null);
  // A→B→A may be batched before React renders; keep a monotonic Auth event epoch.
  const [authIdentityEpoch, setAuthIdentityEpoch] = useState(0);
  const authIdentityEpochRef = useRef(0);
  const [onboardingProgress, setOnboardingProgress] = useState(null);
  const onboardingProgressRef = useRef(null);
  // Latest-started read wins; a successful advance invalidates earlier reads.
  const onboardingProgressReadVersionRef = useRef(0);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const onboardingAdvanceInFlightRef = useRef(false);
  const onboardingPostCompletionRef = useRef(false);
  const [authStatus, setAuthStatus] = useState("確認中");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [authConfirmation, setAuthConfirmation] = useState(() =>
    initialAuthCallback.kind === AUTH_CONFIRMATION_KIND.INVALID_LINK
      ? {
          email: "",
          kind: AUTH_CONFIRMATION_KIND.INVALID_LINK,
          resendAvailableAt: 0,
        }
      : null,
  );
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    if (initialAuthCallback.kind === "password_recovery_invalid") {
      return {
        email: "",
        kind: AUTH_PASSWORD_RECOVERY_KIND.INVALID,
        resendAvailableAt: 0,
      };
    }

    if (initialAuthCallback.kind === "password_recovery") {
      return {
        email: "",
        kind: AUTH_PASSWORD_RECOVERY_KIND.RESOLVING,
        resendAvailableAt: 0,
      };
    }

    return null;
  });
  const authActionInFlightRef = useRef(false);
  const authCallbackCleanedRef = useRef(false);
  const authCallbackResolvedRef = useRef(false);
  const passwordRecoveryVerifiedUserIdRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const profileNotificationSettingPendingRef = useRef(new Set());
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileScreenMode, setProfileScreenMode] = useState("view");
  const [observationStationInitialReportId, setObservationStationInitialReportId] = useState(null);
  const [blockedProfileIds, setBlockedProfileIds] = useState(() => new Set());
  const blockedProfileIdsRef = useRef(new Set());
  const [profileBlockingAvailable, setProfileBlockingAvailable] = useState(true);
  const [blackHoleDialog, setBlackHoleDialog] = useState(null);
  const [blackHoleSaving, setBlackHoleSaving] = useState(false);
  const [blackHoleMessage, setBlackHoleMessage] = useState("");
  const [blackHoleError, setBlackHoleError] = useState("");
  const [blackHoleItems, setBlackHoleItems] = useState([]);
  const [blackHoleItemsLoading, setBlackHoleItemsLoading] = useState(false);
  const blackHoleItemsRequestVersionRef = useRef(0);
  const [contentReportsAvailable, setContentReportsAvailable] = useState(true);
  const [contentReportDialog, setContentReportDialog] = useState(null);
  const [contentReportSaving, setContentReportSaving] = useState(false);
  const contentReportSingleFlightRef = useRef(createContentReportSingleFlight());
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
  const [timelineRefreshing, setTimelineRefreshing] = useState(false);
  const [timelinePullDistance, setTimelinePullDistance] = useState(0);
  const [timelineHasNewPosts, setTimelineHasNewPosts] = useState(false);
  const [serverDataRevision, setServerDataRevision] = useState(0);
  const [resonanceDataRevision, setResonanceDataRevision] = useState(0);
  const [starLetterDataRevision, setStarLetterDataRevision] = useState(0);
  const publicPostsRefreshInFlightRef = useRef(false);
  const publicPostsRefreshQueueRef = useRef({
    activeController: null,
    generation: 0,
    pendingOperation: null,
    promise: null,
  });
  const publicPostsFreshnessCheckInFlightRef = useRef(false);
  const dataSessionEpochRef = useRef(0);
  const dataSessionKeyRef = useRef("anonymous:0");
  const previousDataSessionUserIdRef = useRef(undefined);
  const previousResetAuthIdentityEpochRef = useRef(undefined);
  const postContentRevisionsRef = useRef(createEntityRevisionStore());
  const postAssetsRevisionsRef = useRef(createEntityRevisionStore());
  const resonanceRevisionsRef = useRef(createEntityRevisionStore());
  const archiveRevisionsRef = useRef(createEntityRevisionStore());
  const starThreadRevisionsRef = useRef(createEntityRevisionStore());
  const locallyCreatedPostIdsRef = useRef(new Set());
  const canonicalPostsByIdRef = useRef(new Map());
  const savedPostsRef = useRef([]);
  const resonanceCountsByPostRef = useRef(new Map());
  const resonanceRequestVersionsRef = useRef(createEntityRequestVersionStore());
  const archiveRequestVersionRef = useRef(0);
  const publicTimelineKnownPostIdsRef = useRef(new Set());
  const publicTimelineTopPostRef = useRef(null);
  const isObserveTimelineActiveRef = useRef(false);
  const foregroundHiddenAtRef = useRef(null);
  const foregroundRefreshTimerRef = useRef(null);
  const appMountedRef = useRef(true);
  const postMediaTaskGateRef = useRef(createPostMediaTaskGate());
  const automaticCoverGenerationRef = useRef(0);
  const { postDraft, setPostDraft, postImageDrafts, setPostImageDrafts, postImageDraftsRef, postVideoDraft,
    setPostVideoDraft, postVideoDraftRef, postThumbnailDraft, setPostThumbnailDraft, postThumbnailDraftRef,
    postVideoPreparing, setPostVideoPreparing, postVideoTrimDraft, setPostVideoTrimDraft,
    postVideoTrimDraftRef, postVideoTrimStart, setPostVideoTrimStart, postVideoTrimLength,
    setPostVideoTrimLength, postVideoTrimProgress, setPostVideoTrimProgress, postVideoTrimProcessing,
    setPostVideoTrimProcessing, postVideoTrimError, setPostVideoTrimError, postVideoTrimConversionRef,
    postVideoTrimCancelRequestedRef, postCoverCropFile, setPostCoverCropFile, postCoverCropPreviewUrl,
    setPostCoverCropPreviewUrl, postCoverCropModalOpen, setPostCoverCropModalOpen, postCoverCropZoom,
    setPostCoverCropZoom, postCoverCropOffset, setPostCoverCropOffset, postCoverImageSize,
    setPostCoverImageSize, postCoverCropFrameSize, setPostCoverCropFrameSize, postCoverCropPreparing,
    setPostCoverCropPreparing, } = usePostMediaDraftState({ coverFallbackHeight: METEOR_VIDEO_COVER_PREVIEW_FALLBACK_HEIGHT, coverFallbackWidth: METEOR_VIDEO_COVER_PREVIEW_FALLBACK_WIDTH });
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
  const [viewerResonatedPostIds, setViewerResonatedPostIds] = useState(() => new Set());
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
  const { starLettersByPostId, setStarLettersByPostId, starLettersByPostIdRef, starLettersLoading,
    setStarLettersLoading, starLettersError, setStarLettersError, starLettersMessage, setStarLettersMessage,
    starLetterSavingPostId, setStarLetterSavingPostId, openStarLetterPostId, setOpenStarLetterPostId,
    starLetterDrafts, setStarLetterDrafts, editingStarLetterId, setEditingStarLetterId, starLetterEditDrafts,
    setStarLetterEditDrafts, starLetterUpdatingId, setStarLetterUpdatingId, starLetterDeletingId,
    setStarLetterDeletingId, starLetterReplyComposer, setStarLetterReplyComposer, starLetterReplySavingId,
    setStarLetterReplySavingId, starLetterResonatingIds, setStarLetterResonatingIds, starLetterArchivingIds,
    setStarLetterArchivingIds, highlightedStarLetterId, setHighlightedStarLetterId, starLetterRequestIdsRef,
    starLetterRequestVersionsRef, archivedStarLettersRequestVersionRef, } = useStarLetterUiState();
  const { feedbackType, setFeedbackType, feedbackBody, setFeedbackBody, feedbackSaving, setFeedbackSaving,
    feedbackMessage, setFeedbackMessage, feedbackError, setFeedbackError, } = useFeedbackUiState(FEEDBACK_TYPES);
  const detailPostId = route.name === "meteor" ? route.postId : null;
  const detailStarLetterId = route.name === "meteor" ? route.starLetterId ?? null : null;
  const publicProfileUsername = route.name === "starProfile" ? route.username : null;
  const meteorTagRouteName = route.name === "meteorTag" ? route.tagName : null;
  const ownPostIdsKey = ownPosts.map((post) => post.id).filter(Boolean).join("|");
  const archivedPostIdsKey = archivedPosts.map((post) => post.id).filter(Boolean).join("|");
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
    savedPostsRef.current = savedPosts;
    const nextPosts = [
      ...savedPosts,
      ...ownPosts,
      ...resonatedPosts,
      ...archivedPosts,
      ...publicProfilePosts,
      ...meteorTagPosts,
      ...sentStarLetters.map((letter) => letter.sourcePost).filter(Boolean),
      ...archivedStarLetters.map((letter) => letter.sourcePost).filter(Boolean),
      detailPost,
    ].filter(Boolean);

    for (const post of nextPosts) {
      canonicalPostsByIdRef.current.set(post.id, post);
    }
  }, [
    archivedPosts,
    archivedStarLetters,
    detailPost,
    meteorTagPosts,
    ownPosts,
    publicProfilePosts,
    resonatedPosts,
    savedPosts,
    sentStarLetters,
  ]);

  useEffect(() => {
    if (
      previousDataSessionUserIdRef.current === sessionUserId &&
      previousResetAuthIdentityEpochRef.current === authIdentityEpoch
    ) {
      return;
    }

    previousDataSessionUserIdRef.current = sessionUserId;
    previousResetAuthIdentityEpochRef.current = authIdentityEpoch;
    blackHoleItemsRequestVersionRef.current += 1;
    dataSessionEpochRef.current += 1;
    const sessionKey = `${sessionUserId ?? "anonymous"}:${dataSessionEpochRef.current}`;
    dataSessionKeyRef.current = sessionKey;

    for (const store of [
      postContentRevisionsRef.current,
      postAssetsRevisionsRef.current,
      resonanceRevisionsRef.current,
      archiveRevisionsRef.current,
      starThreadRevisionsRef.current,
    ]) {
      store.beginSession(sessionKey);
    }

    resonanceRequestVersionsRef.current.clear();
    starLetterRequestVersionsRef.current.clear();
    archiveRequestVersionRef.current += 1;
    archivedStarLettersRequestVersionRef.current += 1;
    publicPostsRefreshQueueRef.current.pendingOperation = null;
    publicPostsRefreshQueueRef.current.activeController?.abort("session-changed");
    publicPostsRefreshInFlightRef.current = false;
    setPostsLoading(false);
    setTimelineRefreshing(false);
    resonanceCountsByPostRef.current.clear();
    locallyCreatedPostIdsRef.current.clear();
    canonicalPostsByIdRef.current.clear();
    savedPostsRef.current = [];
    publicTimelineKnownPostIdsRef.current.clear();
    publicTimelineTopPostRef.current = null;
    blockedProfileIdsRef.current = new Set();
    setBlockedProfileIds(new Set());
    setProfile(null);
    setProfileForm(emptyProfileForm);
    setProfileSaving(false);
    profileNotificationSettingPendingRef.current.clear();
    setAvatarUploading(false);
    setProfileScreenMode("view");
    setFeedbackType(FEEDBACK_TYPES[0]);
    setFeedbackBody("");
    setFeedbackSaving(false);
    setFeedbackMessage("");
    setFeedbackError("");
    setSavedPosts([]);
    setOwnPosts([]);
    setOwnPostsLoading(false);
    setOwnPostsError("");
    setResonatedPosts([]);
    setResonatedPostsLoading(false);
    setResonatedPostsError("");
    setArchivedPosts([]);
    setArchivesLoading(false);
    setSentStarLetters([]);
    setSentStarLettersLoading(false);
    setSentStarLettersError("");
    setArchivedStarLetters([]);
    setArchivedStarLettersLoading(false);
    setArchivedStarLettersError("");
    setPublicProfile(null);
    setPublicProfileTags([]);
    setPublicProfilePosts([]);
    setPublicProfileLoading(false);
    setPublicProfileError("");
    setMeteorTagPosts([]);
    setDetailPost(null);
    setStarLettersByPostId({});
    starLettersByPostIdRef.current = {};
    setStarLettersLoading(false);
    setNotifications([]);
    setNotificationsLoading(false);
    setNotificationsError("");
    setNotificationsMessage("");
    setNotificationUpdatingId(null);
    setTimelineHasNewPosts(false);
    setMediaViewer(null);
    setStarMovieObservation(null);
    setHighlightedStarLetterId(null);
    setPostSaving(false);
    setPostUploadProgress("");
    setPostUpdatingId(null);
    setPostDeletingId(null);
    setPostActionMessage("");
    setPostActionError("");
    setResonanceSavingPostId(null);
    setResonanceMessage("");
    setResonanceError("");
    setViewerResonatedPostIds(new Set());
    setArchiveSavingPostId(null);
    setArchivesMessage("");
    setArchivesError("");
    setStarLetterSavingPostId(null);
    setStarLetterReplySavingId(null);
    setStarLetterUpdatingId(null);
    setStarLetterDeletingId(null);
    setStarLettersMessage("");
    setStarLettersError("");
    setPostDraft("");
    invalidatePendingPostMediaWork();
    clearSelectedAvatar();
    clearAvatarCropDraft();
    clearPostImageDrafts();
    clearPostVideoDraft();
    clearPostThumbnailDraft();
    clearPostVideoTrimDraft();
    clearPostCoverCropDraft();
    setPostVideoPreparing(false);
    setEditingPostId(null);
    setPostEditDrafts({});
    setOpenStarLetterPostId(null);
    setStarLetterDrafts({});
    setEditingStarLetterId(null);
    setStarLetterEditDrafts({});
    setStarLetterReplyComposer(null);
    setStarLetterResonatingIds(new Set());
    setStarLetterArchivingIds(new Set());
    starLetterRequestIdsRef.current = createOperationRequestIdStore();
    setServerDataRevision((current) => current + 1);
  }, [sessionUserId, authIdentityEpoch]);

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
      if (postCoverCropPreviewUrl) {
        URL.revokeObjectURL(postCoverCropPreviewUrl);
      }
    };
  }, [postCoverCropPreviewUrl]);

  useEffect(() => {
    starLetterRequestVersionsRef.current = createEntityRequestVersionStore();
    resonanceRequestVersionsRef.current = createEntityRequestVersionStore();
  }, [session?.user?.id, authIdentityEpoch]);

  useEffect(() => {
    starLettersByPostIdRef.current = starLettersByPostId;
  }, [starLettersByPostId]);

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
  }, [session?.user?.id, authIdentityEpoch]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;
    const emptyIds = new Set();

    blockedProfileIdsRef.current = emptyIds;
    setBlockedProfileIds(emptyIds);
    setProfileBlockingAvailable(true);
    setBlackHoleDialog(null);
    setBlackHoleSaving(false);
    setBlackHoleMessage("");
    setBlackHoleError("");
    setBlackHoleItems([]);
    setBlackHoleItemsLoading(false);
    setContentReportsAvailable(true);
    setContentReportDialog(null);
    setContentReportSaving(false);
    contentReportSingleFlightRef.current = createContentReportSingleFlight();

    if (!userId) {
      return () => {
        isMounted = false;
      };
    }

    async function loadBlockedProfileIds() {
      try {
        const nextIds = await readBlockedProfileIds(supabase);

        if (!isMounted || activeSessionUserIdRef.current !== userId) {
          return;
        }

        blockedProfileIdsRef.current = nextIds;
        setBlockedProfileIds(nextIds);
        for (const targetProfileId of nextIds) {
          removeBlockedProfileFromVisibleState(targetProfileId);
        }
      } catch (error) {
        if (!isMounted || activeSessionUserIdRef.current !== userId) {
          return;
        }

        if (isMissingProfileBlocksSchemaError(error)) {
          setProfileBlockingAvailable(false);
          return;
        }

        logSafeError("black_hole_load", error);
        setBlackHoleError("ブラックホールの状態を確認できませんでした。");
      }
    }

    void loadBlockedProfileIds();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, authIdentityEpoch]);

  useEffect(() => {
    postImageDraftsRef.current = postImageDrafts;
  }, [postImageDrafts]);

  useEffect(() => {
    postVideoDraftRef.current = postVideoDraft;
  }, [postVideoDraft]);

  useEffect(() => {
    postThumbnailDraftRef.current = postThumbnailDraft;
  }, [postThumbnailDraft]);

  useEffect(() => {
    postVideoTrimDraftRef.current = postVideoTrimDraft;
  }, [postVideoTrimDraft]);

  useEffect(
    () => () => {
      revokePostMediaDrafts({
        imageDrafts: postImageDraftsRef.current,
        thumbnailDraft: postThumbnailDraftRef.current,
        videoDraft: postVideoDraftRef.current,
        videoTrimDraft: postVideoTrimDraftRef.current,
      });
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

  function advanceAuthIdentityEpoch(nextSession) {
    const nextUserId = nextSession?.user?.id ?? null;
    if (activeSessionUserIdRef.current === nextUserId) {
      return;
    }

    // Invalidate in-flight requests synchronously. Waiting for the reset
    // effect would allow A→B→A in one batch to make old A tokens valid again.
    authIdentityEpochRef.current += 1;
    dataSessionEpochRef.current += 1;
    dataSessionKeyRef.current = `${nextUserId ?? "anonymous"}:${dataSessionEpochRef.current}`;
    // Force the reset effect even when React batches the final user back to A.
    setAuthIdentityEpoch(authIdentityEpochRef.current);
  }

  useAuthSessionLifecycle({
    advanceAuthIdentityEpoch,
    initialAuthCallback,
    authCallbackCleanedRef,
    authCallbackResolvedRef,
    passwordRecoveryVerifiedUserIdRef,
    setAuthConfirmation,
    setAuthError,
    setAuthMessage,
    setPasswordRecovery,
    setAuthStatus,
    activeSessionUserIdRef,
    setSession,
  });

  useEffect(() => {
    activeSessionUserIdRef.current = session?.user?.id ?? null;
  }, [session?.user?.id, authIdentityEpoch]);

  useEffect(() => {
    onboardingProgressRef.current = isOnboardingProgressForUser(onboardingProgress, sessionUserId)
      ? onboardingProgress
      : null;
  }, [onboardingProgress, sessionUserId, authIdentityEpoch]);

  useEffect(() => {
    let isMounted = true;
    const userId = sessionUserId;

    activeSessionUserIdRef.current = userId;
    onboardingProgressRef.current = null;
    onboardingProgressReadVersionRef.current += 1;
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
      const requestedSession = captureDataMutationSession();
      const requestVersion = ++onboardingProgressReadVersionRef.current;
      const isCurrentRequest = () =>
        isMounted &&
        isCurrentDataMutationSession(requestedSession) &&
        onboardingProgressReadVersionRef.current === requestVersion;
      setOnboardingLoading(true);
      setOnboardingError("");

      try {
        const { data, error } = await supabase
          .from("user_onboarding_progress")
          .select(ONBOARDING_PROGRESS_SELECT_COLUMNS)
          .eq("user_id", userId)
          .maybeSingle();

        if (!isCurrentRequest()) {
          return;
        }

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
      } catch (error) {
        if (isCurrentRequest()) {
          logSafeError(ERROR_OPERATION.ONBOARDING_LOAD, error);
          setOnboardingError(getUserFacingError(error, ERROR_OPERATION.ONBOARDING_LOAD));
        }
      } finally {
        if (isCurrentRequest()) {
          setOnboardingLoading(false);
        }
      }
    }

    readOnboardingProgress();

    return () => {
      isMounted = false;
    };
  }, [sessionUserId, authIdentityEpoch]);

  useEffect(() => {
    let isMounted = true;
    const postIds = allPostIdsKey ? allPostIdsKey.split("|") : [];

    if (postIds.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    const requestTokens = resonanceRequestVersionsRef.current.begin(postIds);
    const requestedSessionKey = dataSessionKeyRef.current;
    const requestedUserId = activeSessionUserIdRef.current;
    const hasCurrentRequest = () =>
      isMounted &&
      dataSessionKeyRef.current === requestedSessionKey &&
      activeSessionUserIdRef.current === requestedUserId &&
      postIds.some((postId) => resonanceRequestVersionsRef.current.isCurrent(requestTokens, postId));

    async function readResonances() {
      setResonanceError("");

      let snapshots;

      try {
        snapshots = await readPostEngagementSnapshots(supabase, postIds);
      } catch (error) {
        if (!isMounted || !hasCurrentRequest()) {
          return;
        }

        setResonanceError(getUserFacingError(error, ERROR_OPERATION.RESONANCE_LOAD));
        return;
      }

      if (!hasCurrentRequest()) {
        return;
      }

      const countsByPost = new Map();
      const viewerResonatedPostIdsFromSnapshot = new Set();
      const acceptedPostIds = [];

      for (const snapshot of snapshots ?? []) {
        if (
          !resonanceRequestVersionsRef.current.isCurrent(requestTokens, snapshot.post_id) ||
          !resonanceRevisionsRef.current.apply(
            snapshot.post_id,
            getEngagementVersion(snapshot, "resonance"),
            requestedSessionKey,
          )
        ) {
          continue;
        }

        acceptedPostIds.push(snapshot.post_id);
        countsByPost.set(snapshot.post_id, Number(snapshot.resonance_count ?? 0));
        if (Number(snapshot.viewer_resonance_count ?? 0) > 0) {
          viewerResonatedPostIdsFromSnapshot.add(snapshot.post_id);
        }
      }

      applyResonanceCountsEverywhere(
        acceptedPostIds,
        countsByPost,
        viewerResonatedPostIdsFromSnapshot,
        requestTokens,
      );
    }

    readResonances();

    return () => {
      isMounted = false;
    };
  }, [allPostIdsKey, resonanceDataRevision, serverDataRevision]);

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
  }, [session?.user?.id, authIdentityEpoch]);

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
        const { data: notificationSettingsRows, error: notificationSettingsError } = await supabase
          .rpc("get_own_profile_notification_settings_v1");

        if (!isMounted) {
          return;
        }

        const notificationSettings = notificationSettingsRows?.[0];

        if (!notificationSettingsError && notificationSettings) {
          nextProfile = {
            ...nextProfile,
            notify_authors_when_i_archive: notificationSettings.notify_authors_when_i_archive,
            notify_authors_when_i_resonate: notificationSettings.notify_authors_when_i_resonate,
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
  }, [session?.user?.id, authIdentityEpoch]);

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
  }, [session?.user?.id, authIdentityEpoch]);

  useEffect(() => {
    let isMounted = true;
    const requestedSessionKey = dataSessionKeyRef.current;
    const requestedUserId = activeSessionUserIdRef.current;
    const isCurrentRequest = () =>
      isMounted &&
      dataSessionKeyRef.current === requestedSessionKey &&
      activeSessionUserIdRef.current === requestedUserId;

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

      let post;
      let error = null;

      try {
        post = (await readPostSnapshots(supabase, [detailPostId]))[0] ?? null;
      } catch (readError) {
        error = readError;
      }

      if (!isCurrentRequest()) {
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

      if (post.available === false || post.tombstoned) {
        const accepted = postContentRevisionsRef.current.apply(
          detailPostId,
          getPostContentVersion(post),
          dataSessionKeyRef.current,
        );

        if (accepted) {
          setDetailPost(null);
          setDetailPostError("この流星便は見つかりませんでした。");
        }
        setDetailPostLoading(false);
        return;
      }

      const { data: authorProfile, error: profileRowsError } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).eq("id", post.author_id).maybeSingle(),
        PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_BASIC_SELECT_COLUMNS,
      );

      if (!isCurrentRequest()) {
        return;
      }

      const knownPost =
        detailPost?.id === post.id
          ? detailPost
          : [savedPosts, ownPosts, resonatedPosts, archivedPosts, publicProfilePosts, meteorTagPosts]
              .flat()
              .find((currentPost) => currentPost?.id === post.id);
      const mappedPost = mapSavedPost(post, profileRowsError ? null : authorProfile, profileFrames);
      const basePost = {
        ...mappedPost,
        ...(profileRowsError && knownPost
          ? {
              authorUsername: knownPost.authorUsername,
              name: knownPost.name,
              handle: knownPost.handle,
              avatar: knownPost.avatar,
              avatarUrl: knownPost.avatarUrl,
              avatarFrame: knownPost.avatarFrame,
              avatarFrameId: knownPost.avatarFrameId,
              primaryTitle: knownPost.primaryTitle,
            }
          : {}),
        media: knownPost?.media ?? [],
        tags: knownPost?.tags ?? [],
      };
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets([basePost]);

      if (!isCurrentRequest()) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      const refreshedPost = hydratedPosts[0] ?? basePost;
      setDetailPost((currentPost) =>
        reconcilePostSnapshots(
          currentPost?.id === refreshedPost.id ? [currentPost] : knownPost ? [knownPost] : [],
          [refreshedPost],
        )[0],
      );
      setDetailPostLoading(false);
    }

    readDetailPost();

    return () => {
      isMounted = false;
    };
  }, [detailPostId, profileFrames, serverDataRevision, sessionUserId, authIdentityEpoch]);

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

    const preserveExistingProfile = publicProfile?.username === publicProfileUsername;
    const requestedSessionKey = dataSessionKeyRef.current;
    const requestedUserId = activeSessionUserIdRef.current;
    const isCurrentRequest = () =>
      isMounted &&
      dataSessionKeyRef.current === requestedSessionKey &&
      activeSessionUserIdRef.current === requestedUserId;

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

      if (!isCurrentRequest()) {
        return;
      }

      if (profileError) {
        if (!preserveExistingProfile) {
          setPublicProfile(null);
          setPublicProfileTags([]);
          setPublicProfilePosts([]);
        }
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

      if (!isCurrentRequest()) {
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

      if (!isCurrentRequest()) {
        return;
      }

      if (postsError) {
        setPublicProfile(nextPublicProfile);
        setPublicProfileTags(tagRows ?? []);
        if (!preserveExistingProfile) {
          setPublicProfilePosts([]);
        }
        setPublicProfileLoading(false);
        setPublicProfileError(getUserFacingError(postsError, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const discoveredPostIds = new Set((postRows ?? []).map((post) => post.post_id ?? post.id));
      const missingKnownPostIds = [...new Set([
        ...publicProfilePosts
        .filter((post) => post.authorId === profileRow.id)
        .map((post) => post.id)
        .filter((postId) => postId && !discoveredPostIds.has(postId)),
        profileRow.pinned_post_id && !discoveredPostIds.has(profileRow.pinned_post_id)
          ? profileRow.pinned_post_id
          : null,
      ].filter(Boolean))];
      let knownSnapshots = [];

      try {
        knownSnapshots = missingKnownPostIds.length > 0
          ? await readPostSnapshots(supabase, missingKnownPostIds)
          : [];
      } catch (snapshotError) {
        if (!isCurrentRequest()) {
          return;
        }
        setPublicProfile(nextPublicProfile);
        setPublicProfileTags(tagRows ?? []);
        setPublicProfileLoading(false);
        setPublicProfileError(getUserFacingError(snapshotError, ERROR_OPERATION.POST_LOAD));
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }

      const candidateRows = [...(postRows ?? []), ...knownSnapshots];
      const invalidationRows = candidateRows.filter(
        (post) => post.available === false || post.tombstoned || post.visibility !== "public",
      );
      const visibleRows = orderPostsWithPinnedFirst(
        candidateRows.filter(
          (post) =>
            post.available !== false &&
            !post.tombstoned &&
            post.author_id === profileRow.id &&
            post.visibility === "public",
        ),
        profileRow.pinned_post_id,
        30,
      );
      const mappedPosts = [...visibleRows, ...invalidationRows]
        .map((post) => ({
          ...mapSavedPost(post, profileRow, profileFrames),
          isPinned: isPinnedPost(post, profileRow.pinned_post_id),
        }));
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isCurrentRequest()) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setPublicProfile(nextPublicProfile);
      setPublicProfileTags(tagRows ?? []);
      setPublicProfilePosts((currentPosts) => reconcilePostSnapshots(currentPosts, hydratedPosts));
      setPublicProfileLoading(false);
    }

    readPublicProfile();

    return () => {
      isMounted = false;
    };
  }, [publicProfileUsername, profileFrames, serverDataRevision, sessionUserId, authIdentityEpoch]);

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

    const requestedSessionKey = dataSessionKeyRef.current;
    const requestedUserId = activeSessionUserIdRef.current;
    const isCurrentRequest = () =>
      isMounted &&
      dataSessionKeyRef.current === requestedSessionKey &&
      activeSessionUserIdRef.current === requestedUserId;

    async function readMeteorTagPosts() {
      setMeteorTagLoading(true);
      setMeteorTagError("");

      const normalizedName = getMeteorTagSearchKey(meteorTagRouteName);
      const preserveExistingTag = meteorTagView?.normalizedName === normalizedName;

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

      if (!isCurrentRequest()) {
        return;
      }

      if (tagError) {
        setMeteorTagView({ label: `#${meteorTagRouteName}`, name: meteorTagRouteName, normalizedName });
        if (!preserveExistingTag) {
          setMeteorTagPosts([]);
        }
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

      if (!isCurrentRequest()) {
        return;
      }

      if (relationError) {
        if (!preserveExistingTag) {
          setMeteorTagPosts([]);
        }
        setMeteorTagLoading(false);
        setMeteorTagError(getUserFacingError(relationError, ERROR_OPERATION.METEOR_TAG_LOAD));
        return;
      }

      const postIds = [
        ...new Set([
          ...(relationRows ?? []).map((row) => row.post_id),
          ...meteorTagPosts.map((post) => post.id),
        ].filter(Boolean)),
      ];

      if (postIds.length === 0) {
        setMeteorTagPosts([]);
        setMeteorTagLoading(false);
        setMeteorTagError("");
        return;
      }

      let postRows;
      let postsError = null;

      try {
        postRows = await readPostSnapshots(supabase, postIds);
      } catch (error) {
        postsError = error;
      }

      if (!isCurrentRequest()) {
        return;
      }

      if (postsError) {
        if (!preserveExistingTag) {
          setMeteorTagPosts([]);
        }
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

        if (!isCurrentRequest()) {
          return;
        }

        if (profileRowsError) {
          if (!preserveExistingTag) {
            setMeteorTagPosts([]);
          }
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

      if (!isCurrentRequest()) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setMeteorTagPosts((currentPosts) =>
        reconcilePostSnapshots(currentPosts, hydratedPosts)
          .filter((post) =>
            (post.tags ?? []).some(
              (currentTag) =>
                currentTag.id === tag.id ||
                currentTag.normalizedName === tag.normalizedName,
            ),
          )
          .sort((left, right) => {
            const timeDifference = Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "");
            return timeDifference || String(right.id).localeCompare(String(left.id));
          }),
      );
      setMeteorTagLoading(false);
      setMeteorTagError("");
    }

    readMeteorTagPosts();

    return () => {
      isMounted = false;
    };
  }, [meteorTagRouteName, profileFrames, serverDataRevision, sessionUserId, authIdentityEpoch]);

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

    const requestTokens = starLetterRequestVersionsRef.current.begin(postIds);
    const requestedSessionKey = dataSessionKeyRef.current;
    const requestedUserId = activeSessionUserIdRef.current;
    const hasCurrentRequest = () =>
      isMounted &&
      dataSessionKeyRef.current === requestedSessionKey &&
      activeSessionUserIdRef.current === requestedUserId &&
      postIds.some((postId) => starLetterRequestVersionsRef.current.isCurrent(requestTokens, postId));

    async function readStarLetters() {
      setStarLettersLoading(true);
      setStarLettersError("");

      let snapshots;

      try {
        snapshots = await readStarThreadSnapshots(supabase, postIds);
      } catch (error) {
        if (!isMounted || !hasCurrentRequest()) {
          return;
        }

        setStarLettersLoading(false);
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_LOAD));
        return;
      }

      if (!hasCurrentRequest()) {
        return;
      }

      const acceptedSnapshots = (snapshots ?? []).filter((snapshot) =>
        starLetterRequestVersionsRef.current.isCurrent(requestTokens, snapshot.post_id) &&
        starThreadRevisionsRef.current.apply(
          snapshot.post_id,
          getStarThreadVersion(snapshot),
          requestedSessionKey,
        ),
      );

      const authorIds = [
        ...new Set(
          acceptedSnapshots
            .flatMap((snapshot) => snapshot.letters ?? [])
            .map((letter) => letter.author_id)
            .filter(Boolean),
        ),
      ];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!hasCurrentRequest()) {
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      const nextLettersByPostId = {};

      for (const snapshot of acceptedSnapshots) {
        nextLettersByPostId[snapshot.post_id] = (snapshot.letters ?? []).map((letter) =>
          mapStarLetter(
            { ...letter, conversationAvailable: true },
            profilesById.get(letter.author_id),
            profileFrames,
          ),
        );
      }

      setStarLettersByPostId((currentLettersByPostId) => {
        const activePostIds = new Set(postIds);
        const nextState = Object.fromEntries(
          Object.entries(currentLettersByPostId).filter(([postId]) => activePostIds.has(postId)),
        );

        for (const snapshot of acceptedSnapshots) {
          nextState[snapshot.post_id] = nextLettersByPostId[snapshot.post_id] ?? [];
        }

        return nextState;
      });
      setStarLettersLoading(false);
    }

    readStarLetters();

    return () => {
      isMounted = false;
    };
  }, [allPostIdsKey, profileFrames, serverDataRevision]);

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

    const requestedSessionKey = dataSessionKeyRef.current;
    const isCurrentRequest = () =>
      isMounted &&
      requestedSessionKey === dataSessionKeyRef.current &&
      activeSessionUserIdRef.current === userId;

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

      if (!isCurrentRequest()) {
        return;
      }

      if (error) {
        setOwnPostsLoading(false);
        setOwnPostsError(getUserFacingError(error, ERROR_OPERATION.POST_LOAD));
        return;
      }

      const discoveredPostIds = new Set((data ?? []).map((post) => post.post_id ?? post.id));
      const missingKnownPostIds = [...new Set([
        ...ownPosts
        .map((post) => post.id)
        .filter((postId) => postId && !discoveredPostIds.has(postId)),
        profile?.pinned_post_id && !discoveredPostIds.has(profile.pinned_post_id)
          ? profile.pinned_post_id
          : null,
      ].filter(Boolean))];
      let knownSnapshots = [];

      try {
        knownSnapshots = missingKnownPostIds.length > 0
          ? await readPostSnapshots(supabase, missingKnownPostIds)
          : [];
      } catch (snapshotError) {
        if (!isCurrentRequest()) {
          return;
        }
        setOwnPostsLoading(false);
        setOwnPostsError(getUserFacingError(snapshotError, ERROR_OPERATION.POST_LOAD));
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }

      const candidateRows = [...(data ?? []), ...knownSnapshots];
      const invalidationRows = candidateRows.filter(
        (post) => post.available === false || post.tombstoned,
      );
      const visibleRows = orderPostsWithPinnedFirst(
        candidateRows.filter(
          (post) =>
            post.available !== false &&
            !post.tombstoned &&
            post.author_id === userId,
        ),
        profile?.pinned_post_id,
        30,
      );
      const mappedPosts = [...visibleRows, ...invalidationRows]
        .map((post) => ({
          ...mapSavedPost(post, profile, profileFrames),
          isPinned: isPinnedPost(post, profile?.pinned_post_id),
        }));
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isCurrentRequest()) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setOwnPosts((currentPosts) => reconcilePostSnapshots(currentPosts, hydratedPosts));
      setOwnPostsLoading(false);
    }

    readOwnPosts();

    return () => {
      isMounted = false;
    };
  }, [
    session?.user?.id,
    profile?.display_name,
    profile?.username,
    profile?.avatar_url,
    profile?.active_frame_id,
    profile?.pinned_post_id,
    profileFrames,
    serverDataRevision,
    authIdentityEpoch,
  ]);

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

    const requestedSessionKey = dataSessionKeyRef.current;
    const isCurrentRequest = () =>
      isMounted &&
      requestedSessionKey === dataSessionKeyRef.current &&
      activeSessionUserIdRef.current === userId;

    async function readResonatedPosts() {
      setResonatedPostsLoading(true);
      setResonatedPostsError("");

      const { data: resonanceRows, error: resonanceRowsError } = await supabase
        .from("resonances")
        .select("id, post_id, profile_id, resonance_type, created_at")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!isCurrentRequest()) {
        return;
      }

      if (resonanceRowsError) {
        setResonatedPostsLoading(false);
        setResonatedPostsError(getUserFacingError(resonanceRowsError, ERROR_OPERATION.RESONANCE_LOAD));
        return;
      }

      const currentPostsById = new Map(resonatedPosts.map((post) => [post.id, post]));
      const resonanceRowsByPostId = new Map();

      for (const row of resonanceRows ?? []) {
        if (row.post_id && !resonanceRowsByPostId.has(row.post_id)) {
          resonanceRowsByPostId.set(row.post_id, row);
        }
      }

      const candidatePostIds = [
        ...new Set([
          ...resonanceRowsByPostId.keys(),
          ...currentPostsById.keys(),
        ]),
      ];

      if (candidatePostIds.length === 0) {
        setResonatedPosts([]);
        setResonatedPostsLoading(false);
        return;
      }

      let engagementSnapshots;

      try {
        engagementSnapshots = await readPostEngagementSnapshots(supabase, candidatePostIds);
      } catch (engagementError) {
        if (!isCurrentRequest()) {
          return;
        }
        setResonatedPostsLoading(false);
        setResonatedPostsError(getUserFacingError(engagementError, ERROR_OPERATION.RESONANCE_LOAD));
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }

      const memberPostIds = [];

      for (const snapshot of engagementSnapshots ?? []) {
        const accepted = resonanceRevisionsRef.current.apply(
          snapshot.post_id,
          getEngagementVersion(snapshot, "resonance"),
          requestedSessionKey,
        );

        if (!accepted) {
          if (currentPostsById.has(snapshot.post_id)) {
            memberPostIds.push(snapshot.post_id);
          }
          continue;
        }

        resonanceCountsByPostRef.current.set(
          snapshot.post_id,
          Number(snapshot.resonance_count ?? 0),
        );
        if (Number(snapshot.viewer_resonance_count ?? 0) > 0) {
          memberPostIds.push(snapshot.post_id);
        }
      }

      memberPostIds.splice(30);

      if (memberPostIds.length === 0) {
        setResonatedPosts([]);
        setResonatedPostsLoading(false);
        return;
      }

      const { data: postRows, error: postRowsError } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).in("id", memberPostIds));

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query;
      });

      if (!isCurrentRequest()) {
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

        if (!isCurrentRequest()) {
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
      const mappedPosts = memberPostIds
        .map((postId) => {
          const post = postsById.get(postId);
          const resonanceRow = resonanceRowsByPostId.get(postId);
          const currentPost = currentPostsById.get(postId);

          if (!post) {
            return null;
          }

          return {
            ...mapSavedPost(post, profilesById.get(post.author_id), profileFrames),
            resonanceId: resonanceRow?.id ?? currentPost?.resonanceId ?? null,
            resonatedAt: resonanceRow?.created_at ?? currentPost?.resonatedAt ?? null,
          };
        })
        .filter(Boolean);
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

      if (!isCurrentRequest()) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setResonatedPosts((currentPosts) => reconcilePostSnapshots(currentPosts, hydratedPosts));
      setResonatedPostsLoading(false);
    }

    readResonatedPosts();

    return () => {
      isMounted = false;
    };
  }, [activeTab, session?.user?.id, profileFrames, resonanceDataRevision, serverDataRevision, authIdentityEpoch]);

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

    const requestedSessionKey = dataSessionKeyRef.current;
    const shouldAbortRequest = () => {
      if (!isMounted || dataSessionKeyRef.current !== requestedSessionKey) {
        setSentStarLettersLoading(false);
        return true;
      }

      return false;
    };

    async function readSentStarLetters() {
      setSentStarLettersLoading(true);
      setSentStarLettersError("");

      const { data: discoveredLetterRows, error: letterRowsError } = await runStarLetterQuery((columns) => {
        let query = supabase
          .from("star_letters")
          .select(columns)
          .eq("author_id", userId);

        if (columns.includes("deleted_at")) {
          query = query.is("deleted_at", null);
        }

        return query.order("created_at", { ascending: false }).limit(50);
      });

      if (shouldAbortRequest()) {
        return;
      }

      if (letterRowsError) {
        setSentStarLettersLoading(false);
        setSentStarLettersError(getUserFacingError(letterRowsError, ERROR_OPERATION.STAR_LETTER_LOAD));
        return;
      }

      const postIds = [
        ...new Set([
          ...(discoveredLetterRows ?? []).map((letter) => letter.post_id),
          ...sentStarLetters.map((letter) => letter.postId),
        ].filter(Boolean)),
      ];
      let threadSnapshots = [];

      try {
        threadSnapshots = await readStarThreadSnapshots(supabase, postIds);
      } catch (error) {
        if (shouldAbortRequest()) {
          return;
        }

        setSentStarLettersLoading(false);
        setSentStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_LOAD));
        return;
      }

      if (shouldAbortRequest()) {
        return;
      }

      const acceptedSnapshots = (threadSnapshots ?? []).filter((snapshot) =>
        starThreadRevisionsRef.current.apply(
          snapshot.post_id,
          getStarThreadVersion(snapshot),
          requestedSessionKey,
        ),
      );
      const acceptedPostIds = new Set(acceptedSnapshots.map((snapshot) => snapshot.post_id));
      const letterRows = acceptedSnapshots
        .flatMap((snapshot) => snapshot.letters ?? [])
        .filter((letter) => letter.author_id === userId && !letter.is_deleted);
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

        if (shouldAbortRequest()) {
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

          if (shouldAbortRequest()) {
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

      if (shouldAbortRequest()) {
        return;
      }

      const nextLetters = (letterRows ?? []).map((letter) => {
        const sourcePostRow = postsById.get(letter.post_id);
        const sourcePost = sourcePostRow
          ? mapSavedPost(sourcePostRow, profilesById.get(sourcePostRow.author_id), profileFrames)
          : null;

        return {
          ...mapStarLetter(letter, profile, profileFrames),
          sourcePost,
        };
      });
      setSentStarLetters((currentLetters) => {
        const currentSourcePosts = [
          ...currentLetters.map((letter) => letter.sourcePost),
          ...postIds.map((postId) => canonicalPostsByIdRef.current.get(postId)),
        ].filter(Boolean);
        const refreshedSourcePosts = nextLetters.map((letter) => letter.sourcePost).filter(Boolean);
        const reconciledSourcesById = new Map(
          reconcilePostSnapshots(currentSourcePosts, refreshedSourcePosts).map((post) => [post.id, post]),
        );
        const preservedLetters = currentLetters.filter(
          (letter) => !acceptedPostIds.has(letter.postId),
        );

        return [
          ...nextLetters.map((letter) => ({
            ...letter,
            sourcePost: letter.sourcePost
              ? reconciledSourcesById.get(letter.sourcePost.id) ?? letter.sourcePost
              : null,
          })),
          ...preservedLetters,
        ];
      });
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
    serverDataRevision,
    starLetterDataRevision,
    authIdentityEpoch,
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

    const requestVersion = archiveRequestVersionRef.current + 1;
    archiveRequestVersionRef.current = requestVersion;
    const requestedSessionKey = dataSessionKeyRef.current;
    const knownPostIds = archivedPosts.map((post) => post.id).filter(Boolean);
    const isCurrentRequest = () =>
      isMounted &&
      dataSessionKeyRef.current === requestedSessionKey &&
      requestVersion === archiveRequestVersionRef.current;

    async function readArchivedPosts() {
      setArchivesLoading(true);
      setArchivesError("");

      let snapshots;

      try {
        snapshots = await readArchivedPostSnapshots(supabase, knownPostIds);
      } catch (error) {
        if (!isCurrentRequest()) {
          return;
        }

        setArchivesLoading(false);
        setArchivesError(getUserFacingError(error, ERROR_OPERATION.ARCHIVE_LOAD));
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }

      const acceptedSnapshots = [];
      const rejectedPostIds = new Set();

      for (const snapshot of snapshots ?? []) {
        if (
          !archiveRevisionsRef.current.apply(
            snapshot.post_id,
            getEngagementVersion(snapshot, "archive"),
            requestedSessionKey,
          )
        ) {
          rejectedPostIds.add(snapshot.post_id);
          continue;
        }

        if (snapshot.is_archived && snapshot.available !== false && !snapshot.tombstoned) {
          acceptedSnapshots.push(snapshot);
        }
      }

      const authorIds = [...new Set(acceptedSnapshots.map((post) => post.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await runProfileQuery(
          (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
          PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
          PROFILE_BASIC_SELECT_COLUMNS,
        );

        if (!isCurrentRequest()) {
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

      if (!isCurrentRequest()) {
        return;
      }

      const mappedArchives = acceptedSnapshots.map((snapshot) =>
        mapArchivedPost(
          {
            id: snapshot.archive_id,
            created_at: snapshot.archived_at,
          },
          snapshot,
          profilesById.get(snapshot.author_id),
          profileFrames,
        ),
      );
      const { posts: hydratedArchives, error: assetsError } = await hydratePostsWithAssets(mappedArchives);

      if (!isCurrentRequest()) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      setArchivedPosts((currentPosts) =>
        reconcilePostSnapshots(currentPosts, [
          ...hydratedArchives,
          ...currentPosts.filter((post) => rejectedPostIds.has(post.id)),
        ]),
      );
      setArchivesLoading(false);
    }

    readArchivedPosts();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, profileFrames, serverDataRevision, authIdentityEpoch]);

  useEffect(() => {
    if (activeTab !== "archive") {
      return;
    }

    void refreshArchivedStarLetters();
  }, [activeTab, session?.user?.id, profileFrames, serverDataRevision, starLetterDataRevision, authIdentityEpoch]);

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

    const requestedSession = captureDataMutationSession();
    const isCurrentRequest = () =>
      isMounted && isCurrentDataMutationSession(requestedSession);

    async function readNotifications() {
      setNotificationsLoading(true);
      setNotificationsError("");
      setNotificationsMessage("");

      try {
        let notificationResult = await supabase
          .from("notifications")
          .select("id, recipient_id, actor_id, post_id, star_letter_id, content_report_id, type, message, is_read, created_at")
          .eq("recipient_id", userId)
          .order("created_at", { ascending: false });

        if (!isCurrentRequest()) {
          return;
        }

        if (
          notificationResult.error &&
          ["42703", "PGRST204"].includes(String(notificationResult.error.code ?? "")) &&
          String(notificationResult.error.message ?? "").includes("content_report_id")
        ) {
          notificationResult = await supabase
            .from("notifications")
            .select("id, recipient_id, actor_id, post_id, star_letter_id, type, message, is_read, created_at")
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false });
        }

        if (!isCurrentRequest()) {
          return;
        }

        const { data, error } = notificationResult;
        if (error) {
          setNotificationsError(getUserFacingError(error, ERROR_OPERATION.NOTIFICATION_LOAD));
          return;
        }

        // The source should already be scoped by RLS; keep the UI scoped too.
        const ownNotifications = (data ?? []).filter((item) => item.recipient_id === userId);
        const actorIds = [...new Set(ownNotifications.map((notification) => notification.actor_id).filter(Boolean))];
        const profilesById = new Map();

        if (actorIds.length > 0) {
          const { data: profileRows } = await runProfileQuery(
            (columns) => supabase.from("profiles").select(columns).in("id", actorIds),
            PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
            PROFILE_BASIC_SELECT_COLUMNS,
          );

          if (!isCurrentRequest()) {
            return;
          }

          for (const profileRow of profileRows ?? []) {
            profilesById.set(profileRow.id, profileRow);
          }
        }

        const hydrated = ownNotifications.map((notification) => ({
          ...notification,
          actorProfile: profilesById.get(notification.actor_id) ?? null,
          actorFrame: getProfileFrameById(profileFrames, profilesById.get(notification.actor_id)?.active_frame_id),
        }));
        // A queued React updater may run after a synchronous Auth switch.
        setNotifications((currentNotifications) =>
          isCurrentRequest() ? hydrated : currentNotifications,
        );
      } catch (error) {
        if (!isCurrentRequest()) {
          return;
        }
        logSafeError(ERROR_OPERATION.NOTIFICATION_LOAD, error);
        setNotificationsError(getUserFacingError(error, ERROR_OPERATION.NOTIFICATION_LOAD));
      } finally {
        if (isCurrentRequest()) {
          setNotificationsLoading(false);
        }
      }
    }

    void readNotifications();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, profileFrames, activeTab, authIdentityEpoch]);

  useEffect(() => {
    appMountedRef.current = true;

    return () => {
      appMountedRef.current = false;
      invalidatePendingPostMediaWork();
    };
  }, []);

  const refreshPublicPosts = useCallback(
    ({ initial = false } = {}) => runLatestQueuedOperation(publicPostsRefreshQueueRef, async ({ signal, isCurrent, shouldFinish }) => {
      const requestedSessionKey = dataSessionKeyRef.current;
      const requestedUserId = activeSessionUserIdRef.current;
      const canApplyResponse = () =>
        appMountedRef.current &&
        isCurrent() &&
        dataSessionKeyRef.current === requestedSessionKey &&
        activeSessionUserIdRef.current === requestedUserId;
      const canFinishRequest = () =>
        appMountedRef.current &&
        shouldFinish() &&
        dataSessionKeyRef.current === requestedSessionKey &&
        activeSessionUserIdRef.current === requestedUserId;
      publicPostsRefreshInFlightRef.current = true;
      const isInitialLoad = initial && publicTimelineKnownPostIdsRef.current.size === 0;

      if (isInitialLoad) {
        setPostsLoading(true);
      } else {
        setTimelineRefreshing(true);
      }
      setPostsError("");

      try {
        // Exclude blocked authors at the database boundary before LIMIT.
        // Filtering only after LIMIT can hide every card even when public
        // posts from other authors exist immediately beyond the first page.
        const blockedQueryAuthorIds = [...(blockedProfileIdsRef.current ?? [])].filter(
          (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
        );
        const { data, error } = await runPostQuery((columns, supportsSoftDelete) => {
          let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).eq("visibility", "public"));

          if (supportsSoftDelete) {
            query = query.is("deleted_at", null);
          }
          if (blockedQueryAuthorIds.length > 0) {
            query = query.not("author_id", "in", `(${blockedQueryAuthorIds.join(",")})`);
          }

          return query.order("created_at", { ascending: false })
            .order("id", { ascending: false }).limit(80);
        }, { signal });

        if (!canApplyResponse()) {
          return false;
        }

        if (error) {
          setPostsError(getUserFacingError(error, ERROR_OPERATION.POST_LOAD));
          return false;
        }

        const discoveredPostIds = new Set((data ?? []).map((post) => post.post_id ?? post.id));
        const missingCurrentPostIds = savedPostsRef.current
          .map((post) => post.id)
          .filter((postId) => postId && !discoveredPostIds.has(postId));
        const missingCurrentSnapshots = missingCurrentPostIds.length > 0
          ? await readPostSnapshots(supabase, missingCurrentPostIds, { signal })
          : [];

        if (!canApplyResponse()) {
          return false;
        }

        const candidateRows = [...(data ?? []), ...missingCurrentSnapshots];
        const isUnavailablePublicPost = (post) =>
          post.available === false || post.tombstoned || post.visibility !== "public" || post.deleted_at != null;
        const invalidationRows = candidateRows.filter(isUnavailablePublicPost);
        const invalidatedIds = new Set(invalidationRows.map((post) => post.id ?? post.post_id).filter(Boolean));
        const sortNewest = comparePostsByCreatedAtDesc;
        const baseRows = candidateRows
          .filter((post) => !isUnavailablePublicPost(post) &&
            !invalidatedIds.has(post.id ?? post.post_id) &&
            !isProfileBlocked(blockedProfileIdsRef.current, post.author_id))
          .sort(sortNewest)
          .slice(0, 20);
        let visibleRows = baseRows;

        // Optional view-only resurfacing; failures preserve the regular latest-post timeline.
        // "AI" requires a positive profile_kinds match. Unknown authors never count as AI.
        try {
          const { data: kindRows, error: kindError } = await applyQueryAbortSignal(
            supabase.from("profile_kinds").select("profile_id, kind").limit(501),
            signal,
          );

          if (!canApplyResponse()) {
            return false;
          }

          if (kindError) {
            logSafeError(ERROR_OPERATION.PROFILE_LOAD, kindError);
          } else if (kindRows?.length && kindRows.length < 501) {
            const humanAuthorIds = new Set(kindRows.filter((row) => row.kind === "human").map((row) => row.profile_id));
            const aiAuthorIds = new Set(kindRows.filter((row) => row.kind === "ai_resident").map((row) => row.profile_id));
            const permittedHumanAuthors = [...humanAuthorIds].filter(
              (id) => id && !isProfileBlocked(blockedProfileIdsRef.current, id),
            );

            if (permittedHumanAuthors.length && aiAuthorIds.size) {
              const now = Date.now();
              const from = new Date(now - 60 * 86400000).toISOString();
              const through = new Date(now).toISOString();
              const humanQuery = (authorId = null, limit = 200) => (columns, supportsSoftDelete) => {
                let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns)
                  .eq("visibility", "public").gte("created_at", from).lte("created_at", through));
                if (supportsSoftDelete) {
                  query = query.is("deleted_at", null);
                }
                query = authorId ? query.eq("author_id", authorId) : query.in("author_id", permittedHumanAuthors);
                return query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
              };

              const { data: candidateHumanRows, error: humanError } = await runPostQuery(humanQuery(), { signal });
              if (!canApplyResponse()) {
                return false;
              }
              if (humanError) {
                logSafeError(ERROR_OPERATION.POST_LOAD, humanError);
              } else {
                const humanRows = [...(candidateHumanRows ?? [])];
                // If one prolific author filled the bounded batch, sample missing authors
                // individually without changing DB, Auth or RLS. No unbounded pagination.
                if (humanRows.length === 200) {
                  const foundAuthors = new Set(humanRows.map((post) => post.author_id));
                  const missingAuthors = permittedHumanAuthors.filter(
                    (id) => !foundAuthors.has(id) && !baseRows.some((post) => post.author_id === id),
                  ).sort().slice(0, 20);
                  for (let index = 0; index < missingAuthors.length; index += 4) {
                    const authorBatch = missingAuthors.slice(index, index + 4);
                    const authorResults = await Promise.all(authorBatch.map(
                      (authorId) => runPostQuery(humanQuery(authorId, 1), { signal }),
                    ));
                    if (!canApplyResponse()) {
                      return false;
                    }
                    for (const result of authorResults) {
                      if (result.error) {
                        logSafeError(ERROR_OPERATION.POST_LOAD, result.error);
                      } else {
                        humanRows.push(...(result.data ?? []));
                      }
                    }
                  }
                }
                const invalidatedCandidateRows = humanRows.filter(isUnavailablePublicPost);
                const knownInvalidIds = new Set(invalidationRows.map((post) => post.id ?? post.post_id));
                for (const row of invalidatedCandidateRows) {
                  const postId = row.id ?? row.post_id;
                  if (postId && !knownInvalidIds.has(postId)) {
                    invalidationRows.push(row);
                    knownInvalidIds.add(postId);
                  }
                }
                const excludedPostIds = new Set(knownInvalidIds);
                visibleRows = mixHumanResurfacePosts(
                  baseRows.filter((post) => !excludedPostIds.has(post.id ?? post.post_id)),
                  humanRows,
                  {
                    humanAuthorIds,
                    aiAuthorIds,
                    excludedPostIds,
                    blockedAuthorIds: blockedProfileIdsRef.current,
                    now,
                  },
                );
              }
            }
          }
        } catch (resurfaceError) {
          if (!canApplyResponse()) {
            return false;
          }
          logSafeError(ERROR_OPERATION.POST_LOAD, resurfaceError);
        }

        const refreshedRows = [...visibleRows, ...invalidationRows];
        const authorIds = [...new Set(refreshedRows.map((post) => post.author_id).filter(Boolean))];
        const profilesById = new Map();

        if (authorIds.length > 0) {
          const { data: profileRows, error: profileRowsError } = await runProfileQuery(
            (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
            PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
            PROFILE_BASIC_SELECT_COLUMNS,
          );

          if (!canApplyResponse()) {
            return false;
          }

          if (profileRowsError) {
            setPostsError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
            return false;
          }

          for (const profileRow of profileRows ?? []) {
            profilesById.set(profileRow.id, profileRow);
          }
        }

        const mappedPosts = refreshedRows.map((post) => mapSavedPost(
          isUnavailablePublicPost(post) ? { ...post, available: false, tombstoned: true } : post,
          profilesById.get(post.author_id),
          profileFrames,
        ));
        const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets(mappedPosts);

        if (!canApplyResponse()) {
          return false;
        }

        if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
          logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
        }

        const visiblePosts = hydratedPosts.filter(
          (post) => !isProfileBlocked(blockedProfileIdsRef.current, post.authorId),
        );
        for (const post of [...visiblePosts, ...invalidationRows]) {
          const postId = post.id ?? post.post_id;
          if (postId) {
            locallyCreatedPostIdsRef.current.delete(postId);
          }
        }
        setSavedPosts((currentPosts) => reconcilePostSnapshots(currentPosts, visiblePosts));
        return true;
      } catch (error) {
        if (canApplyResponse()) {
          logSafeError(ERROR_OPERATION.POST_LOAD, error);
          setPostsError(getUserFacingError(error, ERROR_OPERATION.POST_LOAD));
        }
        return false;
      } finally {
        if (canFinishRequest()) {
          publicPostsRefreshInFlightRef.current = false;
          setPostsLoading(false);
          setTimelineRefreshing(false);
        }
      }
    }),
    [profileFrames],
  );

  useEffect(() => {
    publicTimelineKnownPostIdsRef.current = new Set(savedPosts.map((post) => post.id).filter(Boolean));
    publicTimelineTopPostRef.current = savedPosts[0] ?? null;
  }, [savedPosts]);

  useEffect(() => {
    void refreshPublicPosts({ initial: true });
  }, [refreshPublicPosts, authIdentityEpoch]);

  const isObserveTimelineActive = route.name === "home" && activeTab === "observe";
  isObserveTimelineActiveRef.current = isObserveTimelineActive;

  const refreshObserveTimeline = useCallback(
    async ({ scrollToTop = false } = {}) => {
      // Related card data must refresh even if the public-post request is already
      // in flight or fails. New post ids still trigger their own dependent reads.
      setServerDataRevision((current) => current + 1);
      const refreshed = await refreshPublicPosts();

      if (!refreshed) {
        return false;
      }

      setTimelineHasNewPosts(false);

      if (scrollToTop) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      return true;
    },
    [refreshPublicPosts],
  );

  useEffect(() => {
    const markHidden = () => {
      foregroundHiddenAtRef.current = Date.now();
      window.clearTimeout(foregroundRefreshTimerRef.current);
      foregroundRefreshTimerRef.current = null;
    };

    const scheduleForegroundRefresh = () => {
      if (document.visibilityState !== "visible" || foregroundHiddenAtRef.current === null) {
        return;
      }

      const hiddenAt = foregroundHiddenAtRef.current;
      foregroundHiddenAtRef.current = null;
      window.clearTimeout(foregroundRefreshTimerRef.current);
      foregroundRefreshTimerRef.current = window.setTimeout(() => {
        foregroundRefreshTimerRef.current = null;

        if (
          shouldRefreshAfterForeground({
            hiddenAt,
            now: Date.now(),
            visibilityState: document.visibilityState,
          })
        ) {
          void refreshObserveTimeline();
        }
      }, 180);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markHidden();
      } else {
        scheduleForegroundRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", markHidden);
    window.addEventListener("pageshow", scheduleForegroundRefresh);
    window.addEventListener("focus", scheduleForegroundRefresh);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", markHidden);
      window.removeEventListener("pageshow", scheduleForegroundRefresh);
      window.removeEventListener("focus", scheduleForegroundRefresh);
      window.clearTimeout(foregroundRefreshTimerRef.current);
      foregroundRefreshTimerRef.current = null;
    };
  }, [refreshObserveTimeline]);

  const checkForNewPublicPosts = useCallback(async () => {
    if (!isObserveTimelineActive || document.visibilityState !== "visible") {
      return false;
    }

    return runObserveTimelineSingleFlight(publicPostsFreshnessCheckInFlightRef, async () => {
      const { data: latestPost, error } = await readLatestPublicPost();

      if (
        error ||
        !latestPost ||
        !appMountedRef.current ||
        !isObserveTimelineActiveRef.current ||
        document.visibilityState !== "visible"
      ) {
        return false;
      }

      if (
        isUnseenPublicTimelinePost(latestPost, publicTimelineKnownPostIdsRef.current) &&
        !isProfileBlocked(blockedProfileIdsRef.current, latestPost.author_id) &&
        isPublicPostNewer(latestPost, publicTimelineTopPostRef.current)
      ) {
        setTimelineHasNewPosts(true);
        return true;
      }

      return false;
    });
  }, [isObserveTimelineActive]);

  useEffect(() => {
    if (!isObserveTimelineActive) {
      return undefined;
    }

    let disposed = false;
    let channel;

    try {
      channel = supabase
        .channel("observe-public-post-inserts")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
          const post = payload.new;

          if (
            !disposed &&
            isObserveTimelineActiveRef.current &&
            !isProfileBlocked(blockedProfileIdsRef.current, post.author_id) &&
            isUnseenPublicTimelinePost(post, publicTimelineKnownPostIdsRef.current)
          ) {
            setTimelineHasNewPosts(true);
          }
        })
        .subscribe();
    } catch (error) {
      logSafeError(ERROR_OPERATION.POST_LOAD, error);
    }

    return () => {
      disposed = true;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [isObserveTimelineActive]);

  useEffect(() => {
    if (!isObserveTimelineActive) {
      return undefined;
    }

    let pollTimer = null;
    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const ensurePollingStarted = () => {
      if (document.visibilityState === "visible" && pollTimer === null) {
        pollTimer = window.setInterval(checkForNewPublicPosts, OBSERVE_TIMELINE_POLL_INTERVAL_MS);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForNewPublicPosts();
        ensurePollingStarted();
      } else {
        stopPolling();
      }
    };
    const handleFocus = () => {
      void checkForNewPublicPosts();
      ensurePollingStarted();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    void checkForNewPublicPosts();
    ensurePollingStarted();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      stopPolling();
    };
  }, [checkForNewPublicPosts, isObserveTimelineActive]);

  useEffect(() => {
    if (!isObserveTimelineActive) {
      setTimelinePullDistance(0);
      return undefined;
    }

    let gesture = null;
    let triggered = false;

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1 || window.scrollY > 2 || isInteractiveObserveTimelineTarget(event.target)) {
        gesture = null;
        return;
      }

      const touch = event.touches[0];
      gesture = { startX: touch.clientX, startY: touch.clientY };
      triggered = false;
    };

    const handleTouchMove = (event) => {
      if (!gesture || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const nextGesture = getObservePullGesture({
        ...gesture,
        currentX: touch.clientX,
        currentY: touch.clientY,
        scrollY: window.scrollY,
      });
      gesture = { ...gesture, ...nextGesture };
      setTimelinePullDistance(nextGesture.distance);
    };

    const handleTouchEnd = () => {
      if (
        shouldTriggerObservePullRefresh({
          allowQueued: true,
          gesture,
          refreshing: publicPostsRefreshInFlightRef.current,
          triggered,
        })
      ) {
        triggered = true;
        void refreshObserveTimeline();
      }

      gesture = null;
      setTimelinePullDistance(0);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isObserveTimelineActive, refreshObserveTimeline]);

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

    const requestedSession = captureDataMutationSession();
    const isCurrentTargetRequest = () =>
      isMounted &&
      isCurrentDataMutationSession(requestedSession) &&
      onboardingProgressRef.current?.user_id === requestedSession.userId &&
      onboardingProgressRef.current?.target_post_id === targetPostId;

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

      if (!isCurrentTargetRequest()) {
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

      if (!isCurrentTargetRequest()) {
        return;
      }

      const basePost = mapSavedPost(post, authorProfile, profileFrames);
      const { posts: hydratedPosts, error: assetsError } = await hydratePostsWithAssets([basePost]);

      if (!isCurrentTargetRequest()) {
        return;
      }

      if (assetsError && !isMissingPostMediaError(assetsError) && !isMissingMeteorTagsError(assetsError)) {
        logSafeError(ERROR_OPERATION.MEDIA_LOAD, assetsError);
      }

      const targetPost = hydratedPosts[0] ?? basePost;
      setSavedPosts((currentPosts) => {
        // React may apply an updater after the originating Auth session ends.
        if (!isCurrentTargetRequest()) {
          return currentPosts;
        }
        const reconciledTarget = reconcilePostSnapshots(currentPosts, [targetPost])[0] ?? targetPost;
        return [
          reconciledTarget,
          ...currentPosts.filter((currentPost) => currentPost.id !== targetPost.id),
        ];
      });
    }

    void readOnboardingTargetPost().catch((error) => {
      if (!isCurrentTargetRequest()) {
        return;
      }
      logSafeError(ERROR_OPERATION.POST_LOAD, error);
      setOnboardingError("案内に使う流星便を読み込めませんでした。もう一度お試しください。");
    });

    return () => {
      isMounted = false;
    };
  }, [
    sessionOnboardingProgress?.current_step,
    sessionOnboardingProgress?.target_post_id,
    // After an Auth epoch reset the progress row may be reloaded with the same
    // step/target values; track its new object identity to restart hydration.
    sessionOnboardingProgress,
    profileFrames,
    authIdentityEpoch,
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

    if (!tryStartAuthAction(authActionInFlightRef)) {
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");
    setAuthConfirmation(null);
    const normalizedEmail = email.trim();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            legal_age_confirmed: true,
            legal_privacy_version: LEGAL_PRIVACY_VERSION,
            legal_terms_version: LEGAL_TERMS_VERSION,
          },
        },
      });

      if (error) {
        if (isAuthEmailRateLimitError(error)) {
          setAuthStatus("未ログイン");
          setAuthError("会員登録を完了できませんでした。少し待ってから、もう一度お試しください。");
          return;
        }

        setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SIGN_UP));
        return;
      }

      if (data.session?.user?.id) {
        const consentError = await recordLegalConsentForSession(data.session);

        if (consentError) {
          await supabase.auth.signOut();
          setSession(null);
          setAuthStatus("未ログイン");
          setAuthError("会員登録は完了しましたが、同意記録の保存に失敗しました。利用開始前にもう一度ログインして同意を記録してください。");
          return;
        }
      }

      setSession(data.session);
      setAuthStatus(data.session ? "ログイン中" : "メール確認待ち");

      if (data.session) {
        setAuthMessage("会員登録してログインしました。");
        return;
      }

      setAuthConfirmation({
        email: normalizedEmail,
        kind: AUTH_CONFIRMATION_KIND.PENDING,
        resendAvailableAt: Date.now() + AUTH_CONFIRMATION_RESEND_COOLDOWN_MS,
      });
    } catch (error) {
      logSafeError(ERROR_OPERATION.AUTH_SIGN_UP, error);
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SIGN_UP));
    } finally {
      finishAuthAction(authActionInFlightRef);
      setAuthLoading(false);
    }
  }

  async function handleLogin(email, password) {
    if (!tryStartAuthAction(authActionInFlightRef)) {
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");
    setAuthConfirmation(null);
    const normalizedEmail = email.trim();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        if (isEmailNotConfirmedError(error)) {
          setAuthConfirmation({
            email: normalizedEmail,
            kind: AUTH_CONFIRMATION_KIND.EMAIL_NOT_CONFIRMED,
            resendAvailableAt: 0,
          });
          setAuthStatus("メール確認待ち");
          return;
        }

        setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SIGN_IN));
        return;
      }

      const consentError = await recordLegalConsentForSession(data.session);

      if (consentError) {
        await supabase.auth.signOut();
        setSession(null);
        setAuthStatus("未ログイン");
        setAuthError("同意記録の保存に失敗しました。時間をおいてもう一度ログインしてください。");
        return;
      }

      setSession(data.session);
      setAuthStatus("ログイン中");
      setAuthMessage("ログインしました。");
    } catch (error) {
      logSafeError(ERROR_OPERATION.AUTH_SIGN_IN, error);
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SIGN_IN));
    } finally {
      finishAuthAction(authActionInFlightRef);
      setAuthLoading(false);
    }
  }

  function handleOpenPasswordRecovery(email = "") {
    passwordRecoveryVerifiedUserIdRef.current = null;
    setAuthConfirmation(null);
    setPasswordRecovery({
      email: email.trim(),
      kind: AUTH_PASSWORD_RECOVERY_KIND.REQUEST,
      resendAvailableAt: 0,
    });
    setAuthStatus("パスワード再設定");
    setAuthMessage("");
    setAuthError("");
  }

  async function handlePasswordRecoveryRequest(email) {
    const normalizedEmail = email.trim();

    if (
      !normalizedEmail ||
      authActionInFlightRef.current ||
      getAuthConfirmationCooldownSeconds(passwordRecovery?.resendAvailableAt) > 0
    ) {
      return;
    }

    if (!tryStartAuthAction(authActionInFlightRef)) {
      return;
    }

    setAuthLoading(true);
    passwordRecoveryVerifiedUserIdRef.current = null;
    setAuthMessage("");
    setAuthError("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getPasswordRecoveryRedirectUrl(window.location),
      });

      if (error && !isPasswordRecoveryAccountLookupError(error)) {
        if (isAuthEmailRateLimitError(error)) {
          setPasswordRecovery((current) => ({
            email: normalizedEmail,
            kind: current?.kind ?? AUTH_PASSWORD_RECOVERY_KIND.REQUEST,
            resendAvailableAt: Date.now() + AUTH_PASSWORD_RECOVERY_COOLDOWN_MS,
          }));
          setAuthError("送信回数が上限に達しました。少し待ってからもう一度お試しください。");
          return;
        }

        setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_PASSWORD_RECOVERY_REQUEST));
        return;
      }

      setPasswordRecovery({
        email: normalizedEmail,
        kind: AUTH_PASSWORD_RECOVERY_KIND.SENT,
        resendAvailableAt: Date.now() + AUTH_PASSWORD_RECOVERY_COOLDOWN_MS,
      });
      setAuthStatus("再設定メール送信済み");
      setAuthMessage("");
    } catch (error) {
      logSafeError(ERROR_OPERATION.AUTH_PASSWORD_RECOVERY_REQUEST, error);
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_PASSWORD_RECOVERY_REQUEST));
    } finally {
      finishAuthAction(authActionInFlightRef);
      setAuthLoading(false);
    }
  }

  async function handlePasswordRecoveryUpdate(password, confirmation = password) {
    const validationError = validatePasswordRecoveryPasswords(password, confirmation);
    const recoveryUserId = passwordRecoveryVerifiedUserIdRef.current;

    if (validationError) {
      setAuthMessage("");
      setAuthError(validationError);
      return;
    }

    if (
      passwordRecovery?.kind !== AUTH_PASSWORD_RECOVERY_KIND.ACTIVE ||
      !isVerifiedPasswordRecoveryUser(
        recoveryUserId,
        passwordRecovery.userId,
        session?.user?.id,
      )
    ) {
      passwordRecoveryVerifiedUserIdRef.current = null;
      setPasswordRecovery({
        email: "",
        kind: AUTH_PASSWORD_RECOVERY_KIND.INVALID,
        resendAvailableAt: 0,
      });
      setAuthStatus("再設定リンクエラー");
      setAuthMessage("");
      setAuthError("");
      return;
    }

    if (!tryStartAuthAction(authActionInFlightRef)) {
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        if (isPasswordRecoverySessionError(error)) {
          passwordRecoveryVerifiedUserIdRef.current = null;
          setPasswordRecovery({
            email: session?.user?.email ?? "",
            kind: AUTH_PASSWORD_RECOVERY_KIND.INVALID,
            resendAvailableAt: 0,
          });
          setAuthStatus("再設定リンクエラー");
          setAuthError("");
          return;
        }

        setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_PASSWORD_RECOVERY_UPDATE));
        return;
      }

      setPasswordRecovery({
        email: session?.user?.email ?? "",
        kind: AUTH_PASSWORD_RECOVERY_KIND.UPDATED,
        resendAvailableAt: 0,
        userId: recoveryUserId,
      });
      setAuthStatus("パスワード変更完了");
    } catch (error) {
      logSafeError(ERROR_OPERATION.AUTH_PASSWORD_RECOVERY_UPDATE, error);
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_PASSWORD_RECOVERY_UPDATE));
    } finally {
      finishAuthAction(authActionInFlightRef);
      setAuthLoading(false);
    }
  }

  function handleClosePasswordRecovery() {
    passwordRecoveryVerifiedUserIdRef.current = null;
    if (window.location.pathname === AUTH_PASSWORD_RECOVERY_PATH) {
      window.history.replaceState(window.history.state, "", "/");
      setRoute(getRouteFromLocation());
    }

    setPasswordRecovery(null);
    setAuthError("");
    setAuthMessage("");
    setAuthStatus(session ? "ログイン中" : "未ログイン");
  }

  async function handleResendConfirmation(email) {
    const normalizedEmail = email.trim();

    if (
      !normalizedEmail ||
      authActionInFlightRef.current ||
      getAuthConfirmationCooldownSeconds(authConfirmation?.resendAvailableAt) > 0
    ) {
      return;
    }

    if (!tryStartAuthAction(authActionInFlightRef)) {
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
      });

      if (error) {
        if (isAuthEmailRateLimitError(error)) {
          setAuthConfirmation((current) => ({
            email: normalizedEmail,
            kind: current?.kind ?? AUTH_CONFIRMATION_KIND.EMAIL_NOT_CONFIRMED,
            resendAvailableAt: Date.now() + AUTH_CONFIRMATION_RESEND_COOLDOWN_MS,
          }));
          setAuthError("確認メールの再送回数が上限に達しました。少し待ってからもう一度お試しください。");
          return;
        }

        setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_CONFIRMATION_RESEND));
        return;
      }

      setAuthConfirmation({
        email: normalizedEmail,
        kind: AUTH_CONFIRMATION_KIND.PENDING,
        resendAvailableAt: Date.now() + AUTH_CONFIRMATION_RESEND_COOLDOWN_MS,
      });
      setAuthStatus("メール確認待ち");
      setAuthMessage("確認メールを再送しました。");
    } catch (error) {
      logSafeError(ERROR_OPERATION.AUTH_CONFIRMATION_RESEND, error);
      setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_CONFIRMATION_RESEND));
    } finally {
      finishAuthAction(authActionInFlightRef);
      setAuthLoading(false);
    }
  }

  function handleCloseAuthConfirmation() {
    setAuthConfirmation(null);
    setAuthError("");
    setAuthMessage("");
    setAuthStatus(session ? "ログイン中" : "未ログイン");
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
    setObservationStationInitialReportId(null);
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("settings");
  }

  function removeBlockedProfileFromVisibleState(targetProfileId) {
    const keepPost = (post) => post?.authorId !== targetProfileId;
    const keepLetter = (letter) =>
      letter?.authorId !== targetProfileId && letter?.sourcePost?.authorId !== targetProfileId;

    for (const [postId, post] of canonicalPostsByIdRef.current) {
      if (!keepPost(post)) {
        canonicalPostsByIdRef.current.delete(postId);
      }
    }

    setSavedPosts((items) => items.filter(keepPost));
    setOwnPosts((items) => items.filter(keepPost));
    setResonatedPosts((items) => items.filter(keepPost));
    setArchivedPosts((items) => items.filter(keepPost));
    setPublicProfilePosts((items) => items.filter(keepPost));
    setMeteorTagPosts((items) => items.filter(keepPost));
    setSentStarLetters((items) => items.filter(keepLetter));
    setArchivedStarLetters((items) => items.filter(keepLetter));
    setNotifications((items) => items.filter((item) => item.actor_id !== targetProfileId));
    setStarLettersByPostId((itemsByPostId) =>
      Object.fromEntries(
        Object.entries(itemsByPostId).map(([postId, letters]) => [
          postId,
          (letters ?? []).filter(keepLetter),
        ]),
      ),
    );
    setDetailPost((currentPost) => (keepPost(currentPost) ? currentPost : null));
    setTimelineHasNewPosts(false);
  }

  function handleRequestBlackHole(targetProfile) {
    if (
      !profileBlockingAvailable ||
      !session?.user?.id ||
      !targetProfile?.id ||
      targetProfile.id === session.user.id ||
      isTrustedProtectedProfile(targetProfile)
    ) {
      return;
    }

    setBlackHoleMessage("");
    setBlackHoleError("");
    setBlackHoleDialog({
      action: "block",
      target: targetProfile,
    });
  }

  function handleRequestBlackHoleRestore(targetProfile) {
    if (!profileBlockingAvailable || !session?.user?.id || !targetProfile?.id) {
      return;
    }

    setBlackHoleMessage("");
    setBlackHoleError("");
    setBlackHoleDialog({
      action: "restore",
      target: targetProfile,
    });
  }

  function handleCloseBlackHoleDialog() {
    if (!blackHoleSaving) {
      setBlackHoleDialog(null);
    }
  }

  async function refreshBlackHoleItems() {
    if (!session?.user?.id || !profileBlockingAvailable) {
      setBlackHoleItems([]);
      return;
    }

    const requestSession = captureDataMutationSession();
    const requestVersion = ++blackHoleItemsRequestVersionRef.current;
    const isCurrentRequest = () =>
      isCurrentDataMutationSession(requestSession) &&
      blackHoleItemsRequestVersionRef.current === requestVersion;

    setBlackHoleItemsLoading(true);
    setBlackHoleError("");

    try {
      const items = await readMyProfileBlocks(supabase);
      if (!isCurrentRequest()) {
        return;
      }
      setBlackHoleItems(items);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      if (isMissingProfileBlocksSchemaError(error)) {
        setProfileBlockingAvailable(false);
        setBlackHoleItems([]);
      } else {
        logSafeError("black_hole_load", error);
        setBlackHoleError("ブラックホール管理を読み込めませんでした。");
      }
    } finally {
      if (isCurrentRequest()) {
        setBlackHoleItemsLoading(false);
      }
    }
  }

  function handleOpenBlackHoleManagement() {
    if (!profileBlockingAvailable) {
      return;
    }

    setBlackHoleMessage("");
    setBlackHoleError("");
    setProfileScreenMode("black-hole");
    void refreshBlackHoleItems();
  }

  async function handleConfirmBlackHole() {
    const action = blackHoleDialog?.action;
    const target = blackHoleDialog?.target;

    if (blackHoleSaving || !target?.id || !session?.user?.id) {
      return;
    }

    setBlackHoleSaving(true);
    setBlackHoleMessage("");
    setBlackHoleError("");
    const mutationSession = captureDataMutationSession();

    try {
      const result = action === "restore"
        ? await unblockProfile(supabase, target.id)
        : await blockProfile(supabase, target.id);

      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      if (!advanceViewerContextEverywhere(result, mutationSession)) {
        throw new Error("VIEWER_CONTEXT_REVISION_NOT_APPLIED");
      }

      if (action === "restore") {
        const nextIds = new Set(blockedProfileIdsRef.current);
        nextIds.delete(target.id);
        blockedProfileIdsRef.current = nextIds;
        setBlockedProfileIds(nextIds);
        setBlackHoleItems((items) => items.filter((item) => item.blockedId !== target.id));
        setBlackHoleMessage("ブラックホールから戻しました。");
      } else {
        const nextIds = new Set(blockedProfileIdsRef.current);
        nextIds.add(target.id);
        blockedProfileIdsRef.current = nextIds;
        setBlockedProfileIds(nextIds);
        removeBlockedProfileFromVisibleState(target.id);
        setBlackHoleMessage(BLACK_HOLE_SUCCESS_MESSAGE);

        if (
          detailPostForScreen?.authorId === target.id ||
          publicProfile?.id === target.id
        ) {
          handleTabChange("observe");
        }
      }

      setBlackHoleDialog(null);
      setServerDataRevision((current) => current + 1);
    } catch (error) {
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      logSafeError(action === "restore" ? "black_hole_restore" : "black_hole_save", error);
      setBlackHoleError(
        action === "restore" ? BLACK_HOLE_RESTORE_ERROR_MESSAGE : BLACK_HOLE_ERROR_MESSAGE,
      );
    } finally {
      if (isCurrentDataMutationSession(mutationSession)) {
        setBlackHoleSaving(false);
      }
    }
  }

  function handleRequestContentReport(target) {
    if (
      !contentReportsAvailable ||
      !canReportContent({
        currentUserId: session?.user?.id,
        targetId: target?.targetId,
        targetOwnerId: target?.targetOwnerId,
      }) ||
      !["post", "profile"].includes(target?.targetType)
    ) {
      return;
    }

    setContentReportDialog({
      details: "",
      error: "",
      reason: "",
      result: "",
      targetId: target.targetId,
      targetLabel: target.targetLabel || "この内容",
      targetOwnerId: target.targetOwnerId,
      targetType: target.targetType,
      triggerElement: target.triggerElement ?? null,
    });
  }

  function handleCloseContentReportDialog() {
    if (!contentReportSaving) {
      setContentReportDialog(null);
    }
  }

  function handleContentReportChange(field, value) {
    if (!["reason", "details"].includes(field)) {
      return;
    }

    setContentReportDialog((current) =>
      current
        ? {
            ...current,
            [field]: value,
            error: "",
          }
        : current,
    );
  }

  async function handleSubmitContentReport(event) {
    event.preventDefault();

    if (!contentReportDialog || contentReportSaving) {
      return;
    }

    const validation = validateContentReportInput(contentReportDialog);

    if (!validation.valid) {
      setContentReportDialog((current) =>
        current ? { ...current, error: validation.error } : current,
      );
      return;
    }

    const requestSession = captureDataMutationSession();
    const requestFlight = contentReportSingleFlightRef.current;
    const isCurrentRequest = () =>
      isCurrentDataMutationSession(requestSession) &&
      contentReportSingleFlightRef.current === requestFlight;

    setContentReportSaving(true);

    try {
      const result = await requestFlight.run(() =>
        createContentReport(supabase, contentReportDialog),
      );
      if (!isCurrentRequest()) {
        return;
      }
      setContentReportDialog((current) =>
        current
          ? {
              ...current,
              error: "",
              result:
                result.outcome === "already_reported"
                  ? CONTENT_REPORT_DUPLICATE_MESSAGE
                  : CONTENT_REPORT_SUCCESS_MESSAGE,
            }
          : current,
      );
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      if (isMissingContentReportsSchemaError(error)) {
        setContentReportsAvailable(false);
      }

      logSafeError(ERROR_OPERATION.REPORT_SAVE, error);
      setContentReportDialog((current) =>
        current
          ? {
              ...current,
              error: error?.safeMessage || CONTENT_REPORT_ERROR_MESSAGE,
            }
          : current,
      );
    } finally {
      if (isCurrentRequest()) {
        setContentReportSaving(false);
      }
    }
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

  function handleOpenObservationStation(reportId = null) {
    if (!guideIsAdmin) {
      return;
    }

    setObservationStationInitialReportId(typeof reportId === "string" ? reportId : null);
    setProfileMessage("");
    setProfileError("");
    handleTabChange("profile");
    setProfileScreenMode("observation-station");
  }

  function handleBackToProfile() {
    setObservationStationInitialReportId(null);
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

    const mutationSession = captureDataMutationSession();

    const displayName = profileForm.display_name.trim();

    if (!displayName) {
      setProfileError("表示名を入力してください。");
      return;
    }

    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");

    const profileExists = profile?.id === mutationSession.userId;
    const previousAvatarUrl = profileExists ? optionalText(profile.avatar_url ?? "") : null;
    const requestedAvatarUrl = optionalText(profileForm.avatar_url);
    const hasAvatarUpload = Boolean(avatarFile);
    const avatarStorage = supabase.storage.from(AVATAR_BUCKET);
    const { data: avatarReferenceUrlData } = avatarStorage.getPublicUrl(
      `${mutationSession.userId}/avatar-cropped-0.${AVATAR_CROP_OUTPUT_EXTENSION}`,
    );
    const previousAvatarPath = getOwnedAvatarStoragePath({
      avatarUrl: previousAvatarUrl,
      referenceUrl: avatarReferenceUrlData.publicUrl,
      userId: mutationSession.userId,
    });
    let uploadAvatar = null;

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
          assertCurrentDataMutationSession(mutationSession);
        } catch (cropError) {
          if (!isCurrentDataMutationSession(mutationSession)) {
            return;
          }
          setAvatarUploading(false);
          setProfileSaving(false);
          setProfileError(getUserFacingError(cropError, ERROR_OPERATION.PROFILE_SAVE));
          return;
        }
      }

      uploadAvatar = async () => {
        const reservation = await reserveStorageUploadPath(
          AVATAR_BUCKET,
          AVATAR_CROP_OUTPUT_EXTENSION,
        );
        assertCurrentDataMutationSession(mutationSession);

        if (reservation.error) {
          return { error: reservation.error };
        }

        const filePath = reservation.path;
        const { error } = await avatarStorage.upload(filePath, nextCroppedAvatarBlob, {
          cacheControl: "3600",
          contentType: AVATAR_CROP_OUTPUT_TYPE,
          upsert: false,
        });

        if (isCurrentDataMutationSession(mutationSession)) {
          setAvatarUploading(false);
        }

        if (error) {
          return { error };
        }

        const { data: publicUrlData } = avatarStorage.getPublicUrl(filePath);
        return { error: null, path: filePath, publicUrl: publicUrlData.publicUrl };
      };
    }

    const profileSaveResult = await runProfileSaveWithAvatarLifecycle({
      previousAvatarPath,
      removeAvatar: (path) => avatarStorage.remove([path]),
      removePreviousAvatar: hasAvatarUpload || previousAvatarUrl !== requestedAvatarUrl,
      saveProfile: async (uploadedAvatarUrl) => {
        assertCurrentDataMutationSession(mutationSession);

        const profilePayload = {
          id: mutationSession.userId,
          display_name: displayName,
          username: optionalUsername(profileForm.username),
          avatar_url: uploadedAvatarUrl ?? requestedAvatarUrl,
          bio: optionalText(profileForm.bio),
          constellation_note: optionalText(profileForm.constellation_note),
        };

        if (profileFramesAvailable) {
          profilePayload.active_frame_id = profileForm.active_frame_id || null;
        }

        let result = await saveProfileWithAvatarGuard({
          expectedAvatarUrl: previousAvatarUrl,
          profileExists,
          profilePayload,
          selectColumns: profileFramesAvailable ? PROFILE_DETAIL_SELECT_COLUMNS_WITH_FRAME : PROFILE_DETAIL_SELECT_COLUMNS,
          supabase,
        });

        assertCurrentDataMutationSession(mutationSession);

        if (result.error && isMissingProfileFrameSchemaError(result.error) && profileFramesAvailable) {
          const fallbackProfilePayload = { ...profilePayload };
          delete fallbackProfilePayload.active_frame_id;
          result = await saveProfileWithAvatarGuard({
            expectedAvatarUrl: previousAvatarUrl,
            profileExists,
            profilePayload: fallbackProfilePayload,
            selectColumns: PROFILE_DETAIL_SELECT_COLUMNS,
            supabase,
          });
          assertCurrentDataMutationSession(mutationSession);
          setProfileFramesAvailable(false);
        }

        return result;
      },
      uploadAvatar,
    });

    if (profileSaveResult.cleanupError) {
      logSafeError(ERROR_OPERATION.MEDIA_CLEANUP, profileSaveResult.cleanupError);
    }

    if (!isCurrentDataMutationSession(mutationSession)) {
      return;
    }

    setAvatarUploading(false);
    setProfileSaving(false);

    if (profileSaveResult.error) {
      setProfileError(
        isUnownedProfileFrameError(profileSaveResult.error)
          ? "所持していないアイコンフレームは装着できません。"
          : getUserFacingError(
              profileSaveResult.error,
              profileSaveResult.stage === "upload" ? ERROR_OPERATION.STORAGE_UPLOAD : ERROR_OPERATION.PROFILE_SAVE,
            ),
      );
      return;
    }

    const nextProfile = {
      ...profileSaveResult.data,
      profile_titles: profile?.profile_titles ?? [],
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
    setProfileMessage(hasAvatarUpload ? "星影を更新しました。" : "プロフィールを保存しました。");
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

    const userId = session.user.id;
    const requestSession = captureDataMutationSession();
    // The settings controls are disabled while saving. Guard the handler as
    // well so duplicate programmatic submits cannot race at the DB boundary.
    if (profileNotificationSettingPendingRef.current.has(field)) {
      return;
    }
    const isCurrentRequest = () => isCurrentDataMutationSession(requestSession);
    profileNotificationSettingPendingRef.current.add(field);
    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ [field]: nextSetting })
        .eq("id", userId);

      if (!isCurrentRequest()) {
        return;
      }

      if (error) {
        setProfileForm((currentForm) => ({
          ...currentForm,
          [field]: profile?.[field] ?? true,
        }));
        setProfileError(`${label}設定の保存に失敗しました。時間をおいてもう一度お試しください。`);
        return;
      }

      setProfile((currentProfile) =>
        currentProfile?.id === userId
          ? {
              ...currentProfile,
              [field]: nextSetting,
            }
          : currentProfile,
      );
      setProfileForm((currentForm) => ({
        ...currentForm,
        [field]: nextSetting,
      }));
      setProfileMessage(`${label}設定を保存しました。`);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      logSafeError("profile_notification_setting_save", error);
      setProfileForm((currentForm) => ({
        ...currentForm,
        [field]: profile?.[field] ?? true,
      }));
      setProfileError(`${label}設定の保存に失敗しました。時間をおいてもう一度お試しください。`);
    } finally {
      if (isCurrentRequest()) {
        profileNotificationSettingPendingRef.current.delete(field);
        setProfileSaving(profileNotificationSettingPendingRef.current.size > 0);
      }
    }
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

    const requestSession = captureDataMutationSession();
    setFeedbackSaving(true);

    try {
      const { error } = await supabase.from("feedbacks").insert({
        user_id: session.user.id,
        type: feedbackType,
        body,
        status: "new",
      });

      if (!isCurrentDataMutationSession(requestSession)) {
        return;
      }
      if (error) {
        setFeedbackError(getUserFacingError(error, ERROR_OPERATION.FEEDBACK_SAVE));
        return;
      }

      setFeedbackBody("");
      setFeedbackMessage("フィードバックを送信しました。ありがとうございます。");
    } catch (error) {
      if (!isCurrentDataMutationSession(requestSession)) {
        return;
      }
      logSafeError(ERROR_OPERATION.FEEDBACK_SAVE, error);
      setFeedbackError(getUserFacingError(error, ERROR_OPERATION.FEEDBACK_SAVE));
    } finally {
      if (isCurrentDataMutationSession(requestSession)) {
        setFeedbackSaving(false);
      }
    }
  }

  function currentPostMediaSessionKey() {
    // Auth callbacks update activeSessionUserIdRef synchronously, before the reset effect.
    return `${dataSessionKeyRef.current}:${activeSessionUserIdRef.current ?? "anonymous"}`;
  }

  function capturePostMediaTask() {
    return postMediaTaskGateRef.current.capture(currentPostMediaSessionKey());
  }

  function isCurrentPostMediaTask(ticket) {
    return appMountedRef.current && postMediaTaskGateRef.current.isCurrent(ticket, currentPostMediaSessionKey());
  }

  function cancelPostMediaConversionSafely(conversion) {
    try {
      // Request cancellation synchronously; the conversion may execute right
      // after its onConversionReady callback returns.
      void Promise.resolve(conversion.cancel()).catch((error) => {
        logSafeError(ERROR_OPERATION.VIDEO_TRIM, error);
      });
    } catch (error) {
      logSafeError(ERROR_OPERATION.VIDEO_TRIM, error);
    }
  }

  function invalidatePendingPostMediaWork() {
    postMediaTaskGateRef.current.invalidate();
    automaticCoverGenerationRef.current += 1;
    postVideoTrimCancelRequestedRef.current = true;
    const conversion = postVideoTrimConversionRef.current;
    postVideoTrimConversionRef.current = null;
    if (conversion) {
      cancelPostMediaConversionSafely(conversion);
    }
  }

  function clearPostImageDrafts() {
    const currentDrafts = postImageDraftsRef.current;

    postImageDraftsRef.current = [];
    setPostImageDrafts([]);
    for (const draft of currentDrafts) {
      revokePostImageDraft(draft);
    }
  }

  function clearPostVideoDraft() {
    const currentDraft = postVideoDraftRef.current;

    postVideoDraftRef.current = null;
    setPostVideoDraft(null);
    revokePostVideoDraft(currentDraft);
  }

  function clearPostThumbnailDraft() {
    automaticCoverGenerationRef.current += 1;
    const currentDraft = postThumbnailDraftRef.current;

    postThumbnailDraftRef.current = null;
    setPostThumbnailDraft(null);
    revokePostThumbnailDraft(currentDraft);
  }

  function resetPostCoverCrop() {
    setPostCoverCropZoom(AVATAR_CROP_MIN_ZOOM);
    setPostCoverCropOffset({ x: 0, y: 0 });
    setPostCoverImageSize(null);
  }

  function clearPostCoverCropDraft() {
    automaticCoverGenerationRef.current += 1;
    setPostCoverCropFile(null);
    setPostCoverCropPreviewUrl("");
    setPostCoverCropModalOpen(false);
    setPostCoverCropPreparing(false);
    resetPostCoverCrop();
  }

  function openPostCoverCrop(file) {
    automaticCoverGenerationRef.current += 1;
    setPostCoverCropFile(file);
    setPostCoverCropPreviewUrl(URL.createObjectURL(file));
    resetPostCoverCrop();
    setPostCoverCropModalOpen(true);
  }

  function clearPostVideoTrimDraft() {
    const currentDraft = postVideoTrimDraftRef.current;

    postVideoTrimDraftRef.current = null;
    setPostVideoTrimDraft(null);
    revokePostVideoTrimDraft(currentDraft);
    setPostVideoTrimStart(0);
    setPostVideoTrimLength(METEOR_VIDEO_MAX_DURATION_SECONDS);
    setPostVideoTrimProgress(0);
    setPostVideoTrimProcessing(false);
    setPostVideoTrimError("");
    postVideoTrimConversionRef.current = null;
    postVideoTrimCancelRequestedRef.current = false;
  }

  async function prepareAutomaticVideoCoverDraft(file, durationSeconds, videoDraft, task) {
    const coverGeneration = automaticCoverGenerationRef.current;
    try {
      const generatedCoverDraft = await createVideoCoverFile(file, durationSeconds);

      // Discard late results from another account, another selected video,
      // or a manual thumbnail/crop selected while cover generation was running.
      if (!isCurrentPostMediaTask(task) || postVideoDraftRef.current !== videoDraft ||
          automaticCoverGenerationRef.current !== coverGeneration) {
        revokePostThumbnailDraft(generatedCoverDraft);
        return;
      }

      const currentDraft = postThumbnailDraftRef.current;
      postThumbnailDraftRef.current = generatedCoverDraft;
      setPostThumbnailDraft(generatedCoverDraft);
      revokePostThumbnailDraft(currentDraft);
    } catch (thumbnailError) {
      if (isCurrentPostMediaTask(task)) {
        logSafeError(ERROR_OPERATION.VIDEO_THUMBNAIL, thumbnailError);
      }
    }
  }

  async function applySelectedPostVideo(file, metadata, task) {
    if (!isCurrentPostMediaTask(task)) {
      return;
    }
    const nextDraft = createPostVideoDraft(file, metadata);
    const currentDraft = postVideoDraftRef.current;

    postVideoDraftRef.current = nextDraft;
    setPostVideoDraft(nextDraft);
    revokePostVideoDraft(currentDraft);
    clearPostThumbnailDraft();
    await prepareAutomaticVideoCoverDraft(file, metadata.durationSeconds, nextDraft, task);
  }

  function openPostVideoTrimDraft(file, metadata) {
    const initialLengthSeconds = Math.min(
      METEOR_VIDEO_MAX_DURATION_SECONDS,
      Math.max(0.5, Number(metadata.durationSeconds) || METEOR_VIDEO_MAX_DURATION_SECONDS),
    );
    const nextDraft = {
      durationSeconds: metadata.durationSeconds,
      file,
      name: getSafeDisplayFileName(file.name, "選択した星映"),
      previewUrl: URL.createObjectURL(file),
    };
    const currentDraft = postVideoTrimDraftRef.current;

    postVideoTrimDraftRef.current = nextDraft;
    setPostVideoTrimDraft(nextDraft);
    revokePostVideoTrimDraft(currentDraft);
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

    const task = capturePostMediaTask();
    const coverGeneration = automaticCoverGenerationRef.current;
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
      if (!isCurrentPostMediaTask(task) || coverGeneration !== automaticCoverGenerationRef.current ||
          !postVideoDraftRef.current) {
        return;
      }

      const nextDraft = createPostThumbnailDraft(coverFile, { displayName: "星映の表紙" });
      const currentDraft = postThumbnailDraftRef.current;

      postThumbnailDraftRef.current = nextDraft;
      setPostThumbnailDraft(nextDraft);
      revokePostThumbnailDraft(currentDraft);
      setPostMessage("星映の表紙を選びました。");
      clearPostCoverCropDraft();
    } catch (cropError) {
      if (isCurrentPostMediaTask(task) && coverGeneration === automaticCoverGenerationRef.current) {
        setPostError(getUserFacingError(cropError, ERROR_OPERATION.VIDEO_THUMBNAIL));
        setPostCoverCropPreparing(false);
      }
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

    const task = capturePostMediaTask();
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
          if (!isCurrentPostMediaTask(task) || postVideoTrimCancelRequestedRef.current) {
            cancelPostMediaConversionSafely(conversion);
            return;
          }
          postVideoTrimConversionRef.current = conversion;
        },
        onProgress: (value) => {
          if (isCurrentPostMediaTask(task) && !postVideoTrimCancelRequestedRef.current) {
            setPostVideoTrimProgress(value);
          }
        },
        startSeconds: trimStart,
      });
      if (!isCurrentPostMediaTask(task) || postVideoTrimCancelRequestedRef.current) {
        return;
      }
      const metadata = await loadVideoMetadataFromFile(trimmedFile);
      if (!isCurrentPostMediaTask(task) || postVideoTrimCancelRequestedRef.current) {
        return;
      }

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
      }, task);
      if (!isCurrentPostMediaTask(task) || postVideoTrimCancelRequestedRef.current) {
        return;
      }
      setPostMessage("星映を切り取りました。投稿前に再生確認できます。");
      clearPostVideoTrimDraft();
    } catch (trimError) {
      if (!isCurrentPostMediaTask(task)) {
        return;
      }
      if (trimError?.name === "ConversionCanceledError") {
        setPostVideoTrimError("星映の切り取りをキャンセルしました。");
      } else if (isSafeUserFacingError(trimError)) {
        setPostVideoTrimError(getUserFacingError(trimError, ERROR_OPERATION.VIDEO_TRIM));
      } else {
        logSafeError(ERROR_OPERATION.VIDEO_TRIM, trimError);
        setPostVideoTrimError(METEOR_VIDEO_TRIM_ERROR_MESSAGE);
      }
    } finally {
      // A same-session cancel can race a successfully resolved conversion.
      // Always release the busy state, including early returns after await.
      if (isCurrentPostMediaTask(task)) {
        setPostVideoTrimProcessing(false);
        postVideoTrimConversionRef.current = null;
        postVideoTrimCancelRequestedRef.current = false;
      }
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

    const currentDrafts = postImageDraftsRef.current;
    const remainingSlots = METEOR_IMAGE_MAX_COUNT - currentDrafts.length;
    const nextDrafts = [...currentDrafts];
    const errors = [];

    if (remainingSlots <= 0) {
      setPostError("星影は4枚まで放流できます。");
      return;
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

    postImageDraftsRef.current = nextDrafts;
    setPostImageDrafts(nextDrafts);
    setPostError([...new Set(errors)].join(" "));
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

    invalidatePendingPostMediaWork();
    const task = capturePostMediaTask();
    setPostVideoPreparing(true);

    try {
      const metadata = await loadVideoMetadataFromFile(file);
      if (!isCurrentPostMediaTask(task)) {
        return;
      }

      if (metadata.durationSeconds > METEOR_VIDEO_MAX_DURATION_SECONDS || file.size > METEOR_VIDEO_MAX_SIZE_BYTES) {
        openPostVideoTrimDraft(file, metadata);
        setPostMessage("使いたい部分だけ切り取ってください。完成した星映だけを投稿に使います。");
        return;
      }

      await applySelectedPostVideo(file, {
        ...metadata,
        displayName: file.name,
        originalName: file.name,
      }, task);
    } catch (metadataError) {
      if (!isCurrentPostMediaTask(task)) {
        return;
      }
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
      if (isCurrentPostMediaTask(task)) {
        setPostVideoPreparing(false);
      }
    }
  }

  function handleRemovePostVideoDraft() {
    if (postSaving) {
      return;
    }

    invalidatePendingPostMediaWork();
    clearPostVideoDraft();
    clearPostThumbnailDraft();
    clearPostVideoTrimDraft();
    clearPostCoverCropDraft();
    setPostVideoPreparing(false);
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

    const currentDrafts = postImageDraftsRef.current;
    const targetDraft = currentDrafts.find((draft) => draft.id === draftId);
    const nextDrafts = currentDrafts.filter((draft) => draft.id !== draftId);

    postImageDraftsRef.current = nextDrafts;
    setPostImageDrafts(nextDrafts);
    revokePostImageDraft(targetDraft);
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

  function captureDataMutationSession() {
    return {
      sessionKey: dataSessionKeyRef.current,
      userId: session?.user?.id ?? null,
    };
  }

  function isCurrentDataMutationSession(context) {
    return Boolean(
      context?.userId &&
      context.sessionKey === dataSessionKeyRef.current &&
      context.userId === activeSessionUserIdRef.current,
    );
  }

  function assertCurrentDataMutationSession(context) {
    if (isCurrentDataMutationSession(context)) {
      return;
    }

    const error = new Error("The data session changed while the mutation was running.");
    error.code = "STALE_DATA_SESSION";
    throw error;
  }

  function advanceViewerContextEverywhere(result, mutationSession) {
    if (!isCurrentDataMutationSession(mutationSession)) {
      return false;
    }

    const version = {
      epoch: result?.revision_epoch,
      viewerContextRevision: result?.viewer_context_revision,
    };
    const advances = [
      postContentRevisionsRef.current,
      postAssetsRevisionsRef.current,
      resonanceRevisionsRef.current,
      archiveRevisionsRef.current,
      starThreadRevisionsRef.current,
    ].map((store) =>
      store.advanceViewerContext(version, mutationSession.sessionKey),
    );

    return advances.every(Boolean);
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

    const mutationSession = captureDataMutationSession();

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
      let videoMediaRow = null;

      if (hasVideo) {
        setPostUploadProgress("星映を送信中");
        const videoReservation = await reserveStorageUploadPath(
          METEOR_VIDEO_BUCKET,
          getMeteorVideoExtension(videoDraft.file) || "mp4",
        );

        if (videoReservation.error) {
          logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, videoReservation.error);
          throw createUserFacingError("星映の送信に失敗しました。時間をおいてもう一度試してください。");
        }

        const videoStoragePath = videoReservation.path;
        const { error: videoUploadError } = await supabase.storage.from(METEOR_VIDEO_BUCKET).upload(videoStoragePath, videoDraft.file, {
          cacheControl: "3600",
          contentType: videoDraft.file.type,
          upsert: false,
        });

        if (videoUploadError) {
          logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, videoUploadError);
          throw createUserFacingError("星映の送信に失敗しました。時間をおいてもう一度試してください。");
        }

        assertCurrentDataMutationSession(mutationSession);

        uploadedVideoPaths.push(videoStoragePath);

        let thumbnailStoragePath = null;
        setPostUploadProgress("星映の表紙を送信中");

        if (thumbnailDraft) {
          const thumbnailExtension = getMeteorImageExtension(thumbnailDraft.file) || "jpg";
          const thumbnailReservation = await reserveStorageUploadPath(
            METEOR_MEDIA_BUCKET,
            thumbnailExtension,
          );

          if (thumbnailReservation.error) {
            logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, thumbnailReservation.error);
            throw createUserFacingError("星映の表紙の送信に失敗しました。時間をおいてもう一度試してください。");
          }

          thumbnailStoragePath = thumbnailReservation.path;
          const { error: thumbnailUploadError } = await supabase.storage.from(METEOR_MEDIA_BUCKET).upload(thumbnailStoragePath, thumbnailDraft.file, {
            cacheControl: "3600",
            contentType: thumbnailDraft.file.type,
            upsert: false,
          });

          if (thumbnailUploadError) {
            logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, thumbnailUploadError);
            throw createUserFacingError("星映の表紙の送信に失敗しました。時間をおいてもう一度試してください。");
          }

          assertCurrentDataMutationSession(mutationSession);

          uploadedThumbnailPaths.push(thumbnailStoragePath);
        } else {
          try {
            const thumbnailBlob = await createVideoCoverBlob(videoDraft.file, videoDraft.durationSeconds);
            const thumbnailReservation = await reserveStorageUploadPath(
              METEOR_MEDIA_BUCKET,
              METEOR_VIDEO_THUMBNAIL_EXTENSION,
            );

            if (thumbnailReservation.error) {
              throw thumbnailReservation.error;
            }

            thumbnailStoragePath = thumbnailReservation.path;
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
            assertCurrentDataMutationSession(mutationSession);
          } catch (thumbnailError) {
            if (!isCurrentDataMutationSession(mutationSession)) {
              throw thumbnailError;
            }
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

          const imageReservation = await reserveStorageUploadPath(
            METEOR_MEDIA_BUCKET,
            getMeteorImageExtension(draft.file) || "jpg",
          );

          if (imageReservation.error) {
            logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, imageReservation.error);
            throw createUserFacingError("星影の送信に失敗しました。時間をおいてもう一度試してください。");
          }

          const storagePath = imageReservation.path;
          const { error: uploadError } = await supabase.storage.from(METEOR_MEDIA_BUCKET).upload(storagePath, draft.file, {
            cacheControl: "3600",
            contentType: draft.file.type,
            upsert: false,
          });

          if (uploadError) {
            logSafeError(ERROR_OPERATION.STORAGE_UPLOAD, uploadError);
            throw createUserFacingError("星影の送信に失敗しました。時間をおいてもう一度試してください。");
          }

          assertCurrentDataMutationSession(mutationSession);

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
      let data;

      try {
        data = await createPostMutation(supabase, {
          body,
          type: postType,
          visibility: "public",
        });
        assertCurrentDataMutationSession(mutationSession);
      } catch (error) {
        logSafeError(ERROR_OPERATION.POST_CREATE, error);
        throw createUserFacingError("流星便の保存に失敗しました。時間をおいてもう一度試してください。");
      }

      createdPostId = data.id;

      let media = [];
      let meteorTags = [];

      if (videoMediaRow) {
        let assetResult;

        try {
          assetResult = await insertPostAssets(supabase, {
            postId: data.id,
            mediaRows: [videoMediaRow],
          });
          assertCurrentDataMutationSession(mutationSession);
        } catch (mediaError) {
          logSafeError(ERROR_OPERATION.POST_MEDIA_SAVE, mediaError);
          throw createUserFacingError("星映メタデータの保存に失敗しました。時間をおいてもう一度試してください。");
        }

        data = { ...data, assets_revision: assetResult.assets_revision };
        media = await mapPostMediaRows(assetResult.media_rows);
      } else if (uploadedImageMedia.length > 0) {
        const mediaRows = uploadedImageMedia.map((item) => ({
          media_type: "image",
          storage_path: item.storage_path,
          sort_order: item.sort_order,
          mime_type: item.mime_type,
          size_bytes: item.size_bytes,
        }));
        let assetResult;

        try {
          assetResult = await insertPostAssets(supabase, {
            postId: data.id,
            mediaRows,
          });
          assertCurrentDataMutationSession(mutationSession);
        } catch (mediaError) {
          logSafeError(ERROR_OPERATION.POST_MEDIA_SAVE, mediaError);
          throw createUserFacingError("星影メタデータの保存に失敗しました。時間をおいてもう一度試してください。");
        }

        data = { ...data, assets_revision: assetResult.assets_revision };
        media = await mapPostMediaRows(assetResult.media_rows);
      }

      if (meteorTagValidation.tags.length > 0) {
        const { error: meteorTagsError, result: tagResult, tags } = await replacePostMeteorTags(
          data.id,
          meteorTagValidation.tags,
          session.user.id,
        );
        assertCurrentDataMutationSession(mutationSession);

        if (meteorTagsError) {
          logSafeError(ERROR_OPERATION.METEOR_TAG_SAVE, meteorTagsError);
          throw createUserFacingError(
            isMissingMeteorTagsError(meteorTagsError)
              ? "流星タグ機能の準備がまだ完了していません。"
              : "流星タグの保存に失敗しました。時間をおいてもう一度試してください。",
          );
        }

        meteorTags = tags;
        data = { ...data, assets_revision: tagResult.assets_revision };
      }

      const newPost = {
        ...mapSavedPost(data, profile, profileFrames),
        media,
        mediaLoaded: true,
        tags: meteorTags,
        tagsLoaded: true,
      };
      const completesOnboardingFirstPost =
        onboardingProgressRef.current?.current_step === "first_post";

      if (completesOnboardingFirstPost) {
        onboardingPostCompletionRef.current = true;
        await advanceInitialOnboarding("first_post_saved", {
          targetId: data.id,
        });
        assertCurrentDataMutationSession(mutationSession);
        onboardingPostCompletionRef.current = false;
      }

      postContentRevisionsRef.current.applyMutation(
        newPost.id,
        getPostContentVersion(newPost),
        ["domainRevision"],
        dataSessionKeyRef.current,
      );
      postAssetsRevisionsRef.current.applyMutation(
        newPost.id,
        {
          epoch: newPost.revisionEpoch,
          domainRevision: newPost.assetsRevision,
          viewerContextRevision: newPost.viewerContextRevision,
        },
        ["domainRevision"],
        dataSessionKeyRef.current,
      );
      locallyCreatedPostIdsRef.current.add(newPost.id);
      publicTimelineKnownPostIdsRef.current.add(newPost.id);
      publicTimelineTopPostRef.current = newPost;
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
      if (isCurrentDataMutationSession(mutationSession)) {
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
            .eq("uploader_id", mutationSession.userId);

          if (postMediaCleanupError) {
            logSafeError(ERROR_OPERATION.MEDIA_CLEANUP, postMediaCleanupError);
          }

          try {
            await deletePostMutation(supabase, createdPostId);
          } catch (softDeleteError) {
            logSafeError(ERROR_OPERATION.MEDIA_CLEANUP, softDeleteError);
          }
        }

        setPostError(getUserFacingError(error, ERROR_OPERATION.POST_CREATE));
      }
    }

    if (isCurrentDataMutationSession(mutationSession)) {
      setPostSaving(false);
      setPostUploadProgress("");
    }
  }

  function reconcilePostSnapshots(currentPosts, refreshedPosts) {
    return reconcileRefreshedPosts(
      currentPosts,
      refreshedPosts,
      resonanceCountsByPostRef.current,
      {
        assetsRevisionStore: postAssetsRevisionsRef.current,
        contentRevisionStore: postContentRevisionsRef.current,
        expectedSessionKey: dataSessionKeyRef.current,
        locallyCreatedPostIds: locallyCreatedPostIdsRef.current,
      },
    );
  }

  function applyResonanceCountsEverywhere(
    postIds,
    countsByPost,
    viewerResonatedPostIdsFromSnapshot,
    requestTokens,
  ) {
    const requestedPostIds = new Set(postIds);
    const currentPostIds = postIds.filter((postId) =>
      resonanceRequestVersionsRef.current.isCurrent(requestTokens, postId),
    );

    for (const postId of currentPostIds) {
      resonanceCountsByPostRef.current.set(postId, countsByPost.get(postId) ?? 0);
    }

    setViewerResonatedPostIds((currentIds) => {
      const nextIds = new Set(currentIds);

      for (const postId of currentPostIds) {
        if (viewerResonatedPostIdsFromSnapshot.has(postId)) {
          nextIds.add(postId);
        } else {
          nextIds.delete(postId);
        }
      }

      return nextIds;
    });

    const applyCounts = (posts) =>
      posts.map((post) =>
        requestedPostIds.has(post.id) &&
        resonanceRequestVersionsRef.current.isCurrent(requestTokens, post.id)
          ? {
              ...post,
              resonanceCount: countsByPost.get(post.id) ?? 0,
            }
          : post,
      );

    setSavedPosts(applyCounts);
    setOwnPosts(applyCounts);
    setResonatedPosts(applyCounts);
    setArchivedPosts(applyCounts);
    setPublicProfilePosts(applyCounts);
    setMeteorTagPosts(applyCounts);
    setSentStarLetters((currentLetters) =>
      currentLetters.map((letter) =>
        letter.sourcePost
          ? {
              ...letter,
              sourcePost: applyCounts([letter.sourcePost])[0],
            }
          : letter,
      ),
    );
    setArchivedStarLetters((currentLetters) =>
      currentLetters.map((letter) =>
        letter.sourcePost
          ? {
              ...letter,
              sourcePost: applyCounts([letter.sourcePost])[0],
            }
          : letter,
      ),
    );
    setDetailPost((currentPost) => (currentPost ? applyCounts([currentPost])[0] : currentPost));
  }

  function updatePostEverywhere(postId, updater) {
    const canonicalPost = canonicalPostsByIdRef.current.get(postId);

    if (canonicalPost) {
      canonicalPostsByIdRef.current.set(postId, updater(canonicalPost));
    }

    setSavedPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setOwnPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setResonatedPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setSentStarLetters((currentLetters) =>
      currentLetters.map((letter) =>
        letter.sourcePost?.id === postId ? { ...letter, sourcePost: updater(letter.sourcePost) } : letter,
      ),
    );
    setArchivedStarLetters((currentLetters) =>
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
    canonicalPostsByIdRef.current.delete(postId);
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

    const mutationSession = captureDataMutationSession();
    setPostUpdatingId(post.id);
    const { error: meteorTagsError, tags } = await ensureMeteorTags(
      meteorTagValidation.tags,
      session.user.id,
    );

    if (!isCurrentDataMutationSession(mutationSession)) {
      return;
    }

    if (meteorTagsError) {
      setPostUpdatingId(null);
      setPostActionError(
        isMissingMeteorTagsError(meteorTagsError)
          ? "流星タグ機能の準備がまだ完了していません。"
          : "流星タグの保存に失敗しました。時間をおいてもう一度試してください。",
      );
      return;
    }

    let data;

    try {
      data = await updatePostMutation(supabase, {
        body,
        postId: post.id,
        tagIds: tags.map((tag) => tag.id),
      });
    } catch (error) {
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      setPostUpdatingId(null);
      setPostActionError(getUserFacingError(error, ERROR_OPERATION.POST_UPDATE));
      return;
    }

    if (!isCurrentDataMutationSession(mutationSession)) {
      return;
    }

    const contentAccepted = postContentRevisionsRef.current.applyMutation(
      post.id,
      getPostContentVersion(data),
      ["domainRevision"],
      dataSessionKeyRef.current,
    );
    const assetsAccepted = postAssetsRevisionsRef.current.applyMutation(
      post.id,
      {
        epoch: data.revision_epoch,
        domainRevision: data.assets_revision,
        viewerContextRevision: data.viewer_context_revision,
      },
      ["domainRevision"],
      dataSessionKeyRef.current,
    );
    const appliedContentVersion = postContentRevisionsRef.current.get(post.id);
    const appliedAssetsVersion = postAssetsRevisionsRef.current.get(post.id);
    if (contentAccepted || assetsAccepted) {
      updatePostEverywhere(post.id, (currentPost) => ({
        ...currentPost,
        ...(assetsAccepted
          ? {
              assetsRevision: appliedAssetsVersion?.domainRevision ?? data.assets_revision,
              tags,
              tagsLoaded: true,
            }
          : {}),
        ...(contentAccepted
          ? {
              contentRevision: appliedContentVersion?.domainRevision ?? data.content_revision,
              text: data.body ?? body,
            }
          : {}),
        revisionEpoch: data.revision_epoch,
        viewerContextRevision:
          appliedContentVersion?.viewerContextRevision ??
          appliedAssetsVersion?.viewerContextRevision ??
          data.viewer_context_revision,
      }));
    }
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

    const mutationSession = captureDataMutationSession();
    setPostDeletingId(post.id);
    let data;

    try {
      data = await deletePostMutation(supabase, post.id);
    } catch (error) {
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      setPostDeletingId(null);

      if (isMissingDeletedAtError(error)) {
        setPostActionError("流星便削除機能の準備がまだ完了していません。");
        return;
      }

      setPostActionError(getUserFacingError(error, ERROR_OPERATION.POST_DELETE));
      return;
    }

    if (!isCurrentDataMutationSession(mutationSession)) {
      return;
    }

    setPostDeletingId(null);
    postContentRevisionsRef.current.applyMutation(
      post.id,
      getPostContentVersion(data),
      ["domainRevision"],
      dataSessionKeyRef.current,
    );
    const appliedContentVersion = postContentRevisionsRef.current.get(post.id);
    locallyCreatedPostIdsRef.current.delete(post.id);
    resonanceCountsByPostRef.current.delete(post.id);
    removePostFromVisibleLists(post.id);
    setDetailPost((currentPost) =>
      currentPost?.id === post.id
        ? {
            ...currentPost,
            contentRevision: appliedContentVersion?.domainRevision ?? data.content_revision,
            deletedAt: data.deleted_at,
            revisionEpoch: data.revision_epoch,
            tombstoned: true,
            viewerContextRevision:
              appliedContentVersion?.viewerContextRevision ?? data.viewer_context_revision,
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

    const mutationSession = captureDataMutationSession();
    setResonanceSavingPostId(postId);
    let result;

    try {
      result = await addPostResonance(supabase, postId);
    } catch (error) {
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      setResonanceSavingPostId(null);
      setResonanceError(getUserFacingError(error, ERROR_OPERATION.RESONANCE_SAVE));
      return;
    }

    if (!isCurrentDataMutationSession(mutationSession)) {
      return;
    }

    setResonanceSavingPostId(null);
    if (Number(result.viewer_resonance_count ?? 0) > 0 || result.outcome === "created") {
      setViewerResonatedPostIds((currentIds) => new Set(currentIds).add(postId));
    }
    resonanceRequestVersionsRef.current.invalidate(postId);
    const incomingVersion = getEngagementVersion(result, "resonance");
    const viewerContextIsBehind = isRevisionComponentBehind(
      resonanceRevisionsRef.current.get(postId),
      incomingVersion,
      "viewerContextRevision",
    );
    const accepted = resonanceRevisionsRef.current.applyMutation(
      postId,
      incomingVersion,
      ["domainRevision"],
      dataSessionKeyRef.current,
    );

    if (accepted) {
      const currentCount = Number(
        resonanceCountsByPostRef.current.get(postId) ?? targetPost.resonanceCount,
      );
      const serverCount = Number(result.resonance_count ?? 0);
      const nextCount = viewerContextIsBehind && Number.isFinite(currentCount)
        ? currentCount + (result.outcome === "created" ? 1 : 0)
        : serverCount;
      resonanceCountsByPostRef.current.set(postId, nextCount);
      updatePostEverywhere(postId, (post) => ({
        ...post,
        resonanceCount: nextCount,
      }));
    }
    setResonanceDataRevision((current) => current + 1);
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
    const targetPost = canonicalPostsByIdRef.current.get(postId);

    if (!targetPost) {
      setArchiveSavingPostId(null);
      setArchivesError("Archiveする流星便が見つかりませんでした。");
      return;
    }

    const mutationSession = captureDataMutationSession();

    let data;

    try {
      data = await setPostArchived(supabase, postId, !archivedPost?.archiveId);
    } catch (error) {
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      setArchiveSavingPostId(null);
      setArchivesError(getUserFacingError(error, ERROR_OPERATION.ARCHIVE_SAVE));
      return;
    }

    if (!isCurrentDataMutationSession(mutationSession)) {
      return;
    }

    setArchiveSavingPostId(null);
    archiveRequestVersionRef.current += 1;
    setArchivesLoading(false);
    const contentAccepted = postContentRevisionsRef.current.apply(
      postId,
      getPostContentVersion(data),
      dataSessionKeyRef.current,
    );
    const latestPost = canonicalPostsByIdRef.current.get(postId) ?? null;
    const canonicalPost = contentAccepted
      ? {
          ...(latestPost ?? targetPost),
          available: data.available,
          contentRevision: data.content_revision,
          deletedAt: data.deleted_at,
          revisionEpoch: data.revision_epoch,
          text: data.body,
          tombstoned: Boolean(data.tombstoned),
          viewerContextRevision: data.viewer_context_revision,
        }
      : latestPost;

    if (contentAccepted) {
      updatePostEverywhere(postId, () => canonicalPost);
    }

    const archiveVersion = getEngagementVersion(data, "archive");
    const archiveViewerContextIsBehind = isRevisionComponentBehind(
      archiveRevisionsRef.current.get(postId),
      archiveVersion,
      "viewerContextRevision",
    );
    const archiveAccepted = archiveRevisionsRef.current.applyMutation(
      postId,
      archiveVersion,
      ["domainRevision"],
      dataSessionKeyRef.current,
    );
    const archiveProjectionAccepted = archiveAccepted && !archiveViewerContextIsBehind;

    if (
      archiveProjectionAccepted &&
      canonicalPost &&
      data.is_archived &&
      data.available !== false &&
      !data.tombstoned
    ) {
      const archivedTargetPost = {
        ...canonicalPost,
        archiveId: data.archive_id,
        archivedAt: data.archived_at,
        archivedTime: formatNotificationTime(data.archived_at),
      };
      setArchivedPosts((currentPosts) => [
        archivedTargetPost,
        ...currentPosts.filter((post) => post.id !== postId),
      ]);
      setArchivesMessage("流星便をArchiveしました。");
    } else if (archiveProjectionAccepted) {
      setArchivedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
      setArchivesMessage("Archiveから外しました。");
    } else if (archiveAccepted) {
      setArchivesMessage("Archive状態を保存しました。最新状態を再同期しています。");
      setServerDataRevision((current) => current + 1);
    }

    if (isOnboardingArchiveTarget && data.is_archived) {
      void advanceInitialOnboarding("archive_saved", { targetId: postId });
    }
  }

  async function handleMarkNotificationRead(notificationId) {
    setNotificationsMessage("");
    setNotificationsError("");

    if (!session?.user?.id) {
      setNotificationsError("ログインするとRe:Connectを確認できます。");
      return;
    }

    const requestSession = captureDataMutationSession();
    setNotificationUpdatingId(notificationId);

    try {
      const { data, error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("recipient_id", session.user.id)
        .select("id, is_read")
        .single();

      if (!isCurrentDataMutationSession(requestSession)) {
        return;
      }

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
    } catch (error) {
      if (!isCurrentDataMutationSession(requestSession)) {
        return;
      }
      logSafeError(ERROR_OPERATION.NOTIFICATION_SAVE, error);
      setNotificationsError(getUserFacingError(error, ERROR_OPERATION.NOTIFICATION_SAVE));
    } finally {
      if (isCurrentDataMutationSession(requestSession)) {
        setNotificationUpdatingId((currentId) => currentId === notificationId ? null : currentId);
      }
    }
  }

  async function refreshStarLettersForPost(postId) {
    setStarLettersLoading(true);
    const requestTokens = starLetterRequestVersionsRef.current.begin([postId]);
    const requestedSessionKey = dataSessionKeyRef.current;
    const isCurrentRequest = () =>
      dataSessionKeyRef.current === requestedSessionKey &&
      starLetterRequestVersionsRef.current.isCurrent(requestTokens, postId);
    const finish = (value) => {
      if (isCurrentRequest()) {
        setStarLettersLoading(false);
      }
      return value;
    };
    let snapshot;

    try {
      snapshot = await getStarLetterThreadSnapshot(supabase, postId);

      if (!isCurrentRequest()) {
        return finish(false);
      }
    } catch (error) {
      if (!isCurrentRequest()) {
        return finish(false);
      }

      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_LOAD));
      return finish(false);
    }

    if (
      !starThreadRevisionsRef.current.apply(
        postId,
        getStarThreadVersion(snapshot),
        requestedSessionKey,
      )
    ) {
      return finish(false);
    }

    const data = snapshot.letters;
    const authorIds = [...new Set((data ?? []).map((letter) => letter.author_id).filter(Boolean))];
    const profilesById = new Map();

    if (authorIds.length > 0) {
      const { data: profileRows, error: profileError } = await runProfileQuery(
        (columns) => supabase.from("profiles").select(columns).in("id", authorIds),
        PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME,
        PROFILE_BASIC_SELECT_COLUMNS,
      );

      if (!isCurrentRequest()) {
        return finish(false);
      }

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
        { ...letter, conversationAvailable: true },
        profilesById.get(letter.author_id),
        profileFrames,
      ),
    );

    if (!isCurrentRequest()) {
      return finish(false);
    }

    setStarLettersByPostId((currentLetters) => ({
      ...currentLetters,
      [postId]: mappedLetters,
    }));
    setStarLettersError("");
    return finish(true);
  }

  function applyStarLetterMutationResult(
    postId,
    result,
    {
      preserveViewerProjection = false,
      preserveViewerContextProjection = false,
    } = {},
  ) {
    if (!postId || !result) {
      return;
    }

    const canonicalKnownLetter = [
      ...(starLettersByPostIdRef.current[postId] ?? []),
      ...sentStarLetters,
      ...archivedStarLetters,
    ].find((letter) => letter.id === (result.letter?.id ?? result.star_letter_id));

    const applyResult = (currentLetters, { addIfMissing = true, removeDeleted = false } = {}) => {
      if (result.removed) {
        return currentLetters.filter((letter) => letter.id !== result.star_letter_id);
      }

      if (result.letter) {
        const existingInView = currentLetters.find((letter) => letter.id === result.letter.id);
        const existing = existingInView ?? canonicalKnownLetter;
        const authorProfile = result.letter.author_id === profile?.id ? profile : null;
        const mappedLetter = {
          ...existing,
          ...mapStarLetter(
            { ...result.letter, conversationAvailable: true },
            authorProfile,
            profileFrames,
          ),
        };

        if (existing && preserveViewerProjection) {
          mappedLetter.isArchived = existing.isArchived;
          mappedLetter.viewerResonanceCount = existing.viewerResonanceCount;
        }

        if (existing && preserveViewerContextProjection) {
          mappedLetter.totalResonanceCount = existing.totalResonanceCount;
        }
        const found = Boolean(existingInView);

        if (removeDeleted && mappedLetter.isDeleted) {
          return currentLetters.filter((letter) => letter.id !== mappedLetter.id);
        }

        if (!found && (!addIfMissing || preserveViewerContextProjection)) {
          return currentLetters;
        }

        return found
          ? currentLetters.map((letter) => (letter.id === mappedLetter.id ? mappedLetter : letter))
          : [...currentLetters, mappedLetter];
      }

      return currentLetters.map((letter) => {
        if (letter.id !== result.star_letter_id) {
          return letter;
        }

        const serverTotal = Number(
          result.total_resonance_count ?? letter.totalResonanceCount,
        );
        const totalResonanceCount = preserveViewerContextProjection
          ? Number(letter.totalResonanceCount ?? 0) + (result.outcome === "created" ? 1 : 0)
          : serverTotal;

        return {
          ...letter,
          isArchived: result.is_archived ?? letter.isArchived,
          totalResonanceCount,
          viewerResonanceCount: Number(
            result.viewer_resonance_count ?? letter.viewerResonanceCount,
          ),
        };
      });
    };

    setStarLettersByPostId((currentByPostId) => ({
      ...currentByPostId,
      [postId]: applyResult(currentByPostId[postId] ?? []),
    }));
    setSentStarLetters((currentLetters) =>
      applyResult(currentLetters, {
        addIfMissing: result.letter?.author_id === session?.user?.id,
        removeDeleted: true,
      }).map((letter) =>
        letter.postId === postId && !letter.sourcePost
          ? { ...letter, sourcePost: canonicalPostsByIdRef.current.get(postId) ?? null }
          : letter,
      ),
    );
    setArchivedStarLetters((currentLetters) =>
      applyResult(currentLetters, { addIfMissing: false }),
    );
  }

  function markStarLetterMutationCommitted(
    postId,
    result,
    ownedComponents = ["domainRevision"],
  ) {
    let accepted = false;
    let preserveViewerProjection = false;
    let preserveViewerContextProjection = false;

    if (postId) {
      starLetterRequestVersionsRef.current.invalidate(postId);

      if (result) {
        const incomingVersion = getStarThreadVersion(result);
        const currentVersion = starThreadRevisionsRef.current.get(postId);
        preserveViewerProjection = isRevisionComponentBehind(
          currentVersion,
          incomingVersion,
          "viewerRevision",
        );
        preserveViewerContextProjection = isRevisionComponentBehind(
          currentVersion,
          incomingVersion,
          "viewerContextRevision",
        );
        accepted = starThreadRevisionsRef.current.applyMutation(
          postId,
          incomingVersion,
          ownedComponents,
          dataSessionKeyRef.current,
        );
      }
    }
    setStarLetterDataRevision((current) => current + 1);
    return {
      accepted,
      preserveViewerContextProjection,
      preserveViewerProjection,
    };
  }

  function reportStarLetterMutationSync(synchronized, successMessage) {
    if (synchronized) {
      setStarLettersMessage(successMessage);
      return;
    }

    setStarLettersMessage("");
    setStarLettersError(`${successMessage} 保存済みですが、再同期に失敗しました。再試行できます。`);
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

    const mutationSession = captureDataMutationSession();
    setStarLetterReplySavingId(composer.parentStarLetterId);

    try {
      const result = await createStarLetterReply(supabase, {
        parentStarLetterId: composer.parentStarLetterId,
        body,
        clientRequestId: composer.clientRequestId,
      });
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      const mutation = markStarLetterMutationCommitted(composer.postId, result, ["domainRevision"]);
      if (mutation.accepted) {
        applyStarLetterMutationResult(composer.postId, result, mutation);
      }
      starLetterRequestIdsRef.current.clear(`reply:${composer.parentStarLetterId}`);
      setStarLetterReplyComposer(null);
      const synchronized = await refreshStarLettersForPost(composer.postId);
      if (isCurrentDataMutationSession(mutationSession)) {
        reportStarLetterMutationSync(synchronized, "星文を返しました。");
      }
    } catch (error) {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
        await refreshStarLettersForPost(composer.postId);
      }
    } finally {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLetterReplySavingId(null);
      }
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
    const mutationSession = captureDataMutationSession();
    setStarLetterResonatingIds((currentIds) => new Set(currentIds).add(letter.id));

    try {
      const result = await addStarLetterResonance(supabase, { starLetterId: letter.id, clientRequestId });
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      const mutation = markStarLetterMutationCommitted(
        letter.postId,
        result,
        ["domainRevision", "viewerRevision"],
      );
      if (mutation.accepted) {
        applyStarLetterMutationResult(letter.postId, result, mutation);
      }
      starLetterRequestIdsRef.current.clear(requestKey);
      await refreshStarLettersForPost(letter.postId);
    } catch (error) {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.RESONANCE_SAVE));
        await refreshStarLettersForPost(letter.postId);
      }
    } finally {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLetterResonatingIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(letter.id);
          return nextIds;
        });
      }
    }
  }

  async function refreshArchivedStarLetters() {
    const requestVersion = archivedStarLettersRequestVersionRef.current + 1;
    archivedStarLettersRequestVersionRef.current = requestVersion;
    const userId = session?.user?.id;
    const requestedSessionKey = dataSessionKeyRef.current;
    const isCurrentRequest = () =>
      requestVersion === archivedStarLettersRequestVersionRef.current &&
      requestedSessionKey === dataSessionKeyRef.current &&
      activeSessionUserIdRef.current === userId;

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

    if (!isCurrentRequest()) {
      return false;
    }

    if (archiveError) {
      setArchivedStarLettersLoading(false);
      setArchivedStarLettersError(getUserFacingError(archiveError, ERROR_OPERATION.ARCHIVE_LOAD));
      return false;
    }

    const archiveItems = archiveRows ?? [];
    const postIds = [
      ...new Set([
        ...archiveItems.map((item) => item.post_id),
        ...archivedStarLetters.map((item) => item.postId),
      ].filter(Boolean)),
    ];

    if (postIds.length === 0) {
      setArchivedStarLetters([]);
      setArchivedStarLettersLoading(false);
      return true;
    }

    let threadSnapshots;

    try {
      threadSnapshots = await readStarThreadSnapshots(supabase, postIds);
    } catch (letterError) {
      if (!isCurrentRequest()) {
        return false;
      }

      setArchivedStarLettersLoading(false);
      setArchivedStarLettersError(getUserFacingError(letterError, ERROR_OPERATION.STAR_LETTER_LOAD));
      return false;
    }

    if (!isCurrentRequest()) {
      return false;
    }

    const acceptedSnapshots = (threadSnapshots ?? []).filter((snapshot) =>
      starThreadRevisionsRef.current.apply(
        snapshot.post_id,
        getStarThreadVersion(snapshot),
        requestedSessionKey,
      ),
    );
    const acceptedPostIds = new Set(acceptedSnapshots.map((snapshot) => snapshot.post_id));
    const letterRows = acceptedSnapshots
      .flatMap((snapshot) => snapshot.letters ?? [])
      .filter((letter) => letter.is_archived);

    const { data: postRows, error: postsError } = await runPostQuery((columns, supportsSoftDelete) => {
      let query = applyVisiblePostTypeFilter(supabase.from("posts").select(columns).in("id", postIds));

      if (supportsSoftDelete) {
        query = query.is("deleted_at", null);
      }

      return query;
    });

    if (!isCurrentRequest()) {
      return false;
    }

    if (postsError) {
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

      if (!isCurrentRequest()) {
        return false;
      }

      if (profileRowsError) {
        setArchivedStarLettersLoading(false);
        setArchivedStarLettersError(getUserFacingError(profileRowsError, ERROR_OPERATION.PROFILE_LOAD));
        return false;
      }

      for (const profileRow of profileRows ?? []) {
        profilesById.set(profileRow.id, profileRow);
      }
    }

    const archiveByLetterId = new Map(archiveItems.map((item) => [item.star_letter_id, item]));
    const currentByLetterId = new Map(archivedStarLetters.map((item) => [item.id, item]));
    const postsById = new Map((postRows ?? []).map((post) => [post.id, post]));
    const nextItems = (letterRows ?? [])
      .map((letter) => {
        const archiveItem = archiveByLetterId.get(letter.id);
        const currentItem = currentByLetterId.get(letter.id);
        const sourcePost = postsById.get(letter.post_id);
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
          archiveId: archiveItem?.id ?? currentItem?.archiveId ?? null,
          archivedAt: archiveItem?.created_at ?? currentItem?.archivedAt ?? null,
          archiveTime: formatNotificationTime(
            archiveItem?.created_at ?? currentItem?.archivedAt,
          ),
          sourcePost: sourcePost
            ? mapSavedPost(sourcePost, profilesById.get(sourcePost.author_id), profileFrames)
            : null,
        };
      })
      .filter(Boolean);

    if (!isCurrentRequest()) {
      return false;
    }

    setArchivedStarLetters((currentItems) => {
      const currentSourcePosts = [
        ...currentItems.map((item) => item.sourcePost),
        ...postIds.map((postId) => canonicalPostsByIdRef.current.get(postId)),
      ].filter(Boolean);
      const refreshedSourcePosts = nextItems.map((item) => item.sourcePost).filter(Boolean);
      const reconciledSourcesById = new Map(
        reconcilePostSnapshots(currentSourcePosts, refreshedSourcePosts).map((post) => [post.id, post]),
      );
      const preservedItems = currentItems.filter(
        (item) => !acceptedPostIds.has(item.postId),
      );

      return [
        ...nextItems.map((item) => ({
          ...item,
          sourcePost: item.sourcePost
            ? reconciledSourcesById.get(item.sourcePost.id) ?? item.sourcePost
            : null,
        })),
        ...preservedItems,
      ];
    });
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

    const mutationSession = captureDataMutationSession();
    setStarLetterArchivingIds((currentIds) => new Set(currentIds).add(letter.id));

    try {
      const result = await setStarLetterArchived(supabase, {
        starLetterId: letter.id,
        archived: !letter.isArchived,
      });
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      const mutation = markStarLetterMutationCommitted(
        letter.postId,
        result,
        ["viewerRevision"],
      );
      if (mutation.accepted) {
        applyStarLetterMutationResult(letter.postId, result, mutation);
      }
      archivedStarLettersRequestVersionRef.current += 1;
      setArchivedStarLettersLoading(false);

      if (!mutation.accepted) {
        setStarLettersMessage("星文のArchive状態を保存しました。");
      } else if (!result.is_archived) {
        setArchivedStarLetters((currentItems) => currentItems.filter((item) => item.id !== letter.id));
        setStarLettersMessage("星文のArchiveを解除しました。");
      } else {
        const sourcePost = canonicalPostsByIdRef.current.get(letter.postId) ?? null;
        const archivedAt = result.archived_at ?? new Date().toISOString();
        const latestLetter =
          starLettersByPostIdRef.current[letter.postId]?.find(
            (currentLetter) => currentLetter.id === letter.id,
          ) ?? letter;
        setArchivedStarLetters((currentItems) => {
          const archivedLetter = {
            ...latestLetter,
            archiveId: result.archive_id ?? null,
            archivedAt,
            archiveTime: formatNotificationTime(archivedAt),
            isArchived: true,
            sourcePost,
          };

          return [archivedLetter, ...currentItems.filter((item) => item.id !== letter.id)];
        });
        setStarLettersMessage("星文をArchiveしました。");
      }

      await refreshStarLettersForPost(letter.postId);
    } catch (error) {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.ARCHIVE_SAVE));
        await refreshStarLettersForPost(letter.postId);
      }
    } finally {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLetterArchivingIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(letter.id);
          return nextIds;
        });
      }
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

    const mutationSession = captureDataMutationSession();
    setStarLetterSavingPostId(postId);

    let data;

    try {
      data = await createRootStarLetter(supabase, { postId, body });
    } catch (error) {
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      setStarLetterSavingPostId(null);
      setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
      return;
    }

    if (!isCurrentDataMutationSession(mutationSession)) {
      return;
    }

    setStarLetterSavingPostId(null);
    const mutation = markStarLetterMutationCommitted(postId, data, ["domainRevision"]);
    if (mutation.accepted) {
      applyStarLetterMutationResult(postId, data, mutation);
    }
    setStarLetterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [postId]: "",
    }));
    setOpenStarLetterPostId(postId);
    const synchronized = await refreshStarLettersForPost(postId);
    if (isCurrentDataMutationSession(mutationSession)) {
      reportStarLetterMutationSync(synchronized, "星文を送りました。");
    }
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

    const mutationSession = captureDataMutationSession();
    setStarLetterUpdatingId(letter.id);

    try {
      const result = await updateStarLetter(supabase, { starLetterId: letter.id, body });
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      const mutation = markStarLetterMutationCommitted(letter.postId, result, ["domainRevision"]);
      if (mutation.accepted) {
        applyStarLetterMutationResult(letter.postId, result, mutation);
      }
      const synchronized = await refreshStarLettersForPost(letter.postId);
      if (isCurrentDataMutationSession(mutationSession)) {
        handleCancelStarLetterEdit(letter.id);
        reportStarLetterMutationSync(synchronized, "星文を保存しました。");
      }
    } catch (error) {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
        await refreshStarLettersForPost(letter.postId);
      }
    } finally {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLetterUpdatingId(null);
      }
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

    const mutationSession = captureDataMutationSession();
    setStarLetterDeletingId(letter.id);

    try {
      const result = await deleteStarLetter(supabase, letter.id);
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      const mutation = markStarLetterMutationCommitted(letter.postId, result, ["domainRevision"]);
      if (mutation.accepted) {
        applyStarLetterMutationResult(letter.postId, result, mutation);
      }
      const synchronized = await refreshStarLettersForPost(letter.postId);
      if (!isCurrentDataMutationSession(mutationSession)) {
        return;
      }
      setStarLetterEditDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[letter.id];
        return nextDrafts;
      });
      setEditingStarLetterId((currentId) => (currentId === letter.id ? null : currentId));
      reportStarLetterMutationSync(synchronized, "星文を削除しました。");
    } catch (error) {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLettersError(getUserFacingError(error, ERROR_OPERATION.STAR_LETTER_SAVE));
        await refreshStarLettersForPost(letter.postId);
      }
    } finally {
      if (isCurrentDataMutationSession(mutationSession)) {
        setStarLetterDeletingId(null);
      }
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
      setProfileShareError("My Universeの共有にはusernameが必要です。");
      return;
    }

    const starProfileUrl = `${window.location.origin}${buildStarProfilePath(username)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "星空VillageのMy Universe",
          text: "星空VillageのMy Universeです。",
          url: starProfileUrl,
        });
        setProfileShareMessage("My UniverseのURLを共有できます");
        return;
      }

      await navigator.clipboard.writeText(starProfileUrl);
      setProfileShareMessage("My UniverseのURLをコピーしました");
    } catch (_error) {
      setProfileShareError("My UniverseのURLのコピーに失敗しました。");
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

    const mutationSession = captureDataMutationSession();
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
      if (isCurrentDataMutationSession(mutationSession)) {
        onboardingAdvanceInFlightRef.current = false;
        setOnboardingBusy(false);
        logSafeError(ERROR_OPERATION.ONBOARDING_SAVE, requestError);
        setOnboardingError(getUserFacingError(requestError, ERROR_OPERATION.ONBOARDING_SAVE));
      }
      return null;
    }

    if (!isCurrentDataMutationSession(mutationSession)) {
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

    // New progress must not be rewound by an earlier same-session fetch.
    onboardingProgressReadVersionRef.current += 1;
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

    const requestSession = captureDataMutationSession();
    const requestVersion = ++onboardingProgressReadVersionRef.current;
    const isCurrentRequest = () =>
      isCurrentDataMutationSession(requestSession) &&
      onboardingProgressReadVersionRef.current === requestVersion;
    try {
      const { data, error } = await supabase
        .from("user_onboarding_progress")
        .select(ONBOARDING_PROGRESS_SELECT_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();

      if (
        !isCurrentRequest() ||
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
    } catch (error) {
      if (isCurrentRequest()) {
        logSafeError(ERROR_OPERATION.ONBOARDING_LOAD, error);
        setOnboardingError(getUserFacingError(error, ERROR_OPERATION.ONBOARDING_LOAD));
      }
      return null;
    }
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
    confirmation: authConfirmation,
    error: authError,
    loading: authLoading,
    message: authMessage,
    onCloseConfirmation: handleCloseAuthConfirmation,
    onLogin: handleLogin,
    onLogout: handleLogout,
    onOpenPasswordRecovery: handleOpenPasswordRecovery,
    onPasswordRecoveryRequest: handlePasswordRecoveryRequest,
    onPasswordRecoveryUpdate: handlePasswordRecoveryUpdate,
    onResendConfirmation: handleResendConfirmation,
    onSignUp: handleSignUp,
    passwordRecovery,
    session,
    status: authStatus,
  };
  const onboardingIsActive = isOnboardingActive(sessionOnboardingProgress);
  const shouldShowInteractiveOnboarding =
    onboardingIsActive &&
    !onboardingLoading &&
    authConfirmation?.kind !== AUTH_CONFIRMATION_KIND.CONFIRMED &&
    !passwordRecovery;
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
    onBackToSettings: handleOpenProfileSettings,
    onCancelEdit: handleCancelProfileEdit,
    onOpenFeedback: handleOpenFeedback,
    onOpenAvatar: handleOpenAvatarModal,
    onOpenGuide: handleOpenGuide,
    onOpenGuideAdmin: handleOpenGuideAdmin,
    onOpenBlackHoleManagement: handleOpenBlackHoleManagement,
    onOpenObservationStation: () => handleOpenObservationStation(),
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
    contentReportsAvailable,
    observationStationInitialReportId,
    selectedFrame: selectedProfileFrame,
    saving: profileSaving,
    shareError: profileShareError,
    shareMessage: profileShareMessage,
    profileScreenMode,
    onboardingTarget,
    blackHole: {
      available: profileBlockingAvailable,
      error: blackHoleError,
      items: blackHoleItems,
      loading: blackHoleItemsLoading,
      message: blackHoleMessage,
      onRestore: handleRequestBlackHoleRestore,
      saving: blackHoleSaving,
    },
    observationStation: {
      available: contentReportsAvailable,
    },
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
    resonatedPostIds: viewerResonatedPostIds,
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
    blackHole: {
      available: profileBlockingAvailable,
      blockedProfileIds,
      onRequest: handleRequestBlackHole,
    },
    report: {
      available: contentReportsAvailable,
      onRequest: handleRequestContentReport,
    },
    session,
    updatingId: postUpdatingId,
  };
  // Auth can switch before the next effect cleans up previously loaded data.
  // Never render another account's notification text during that transition.
  const visibleNotifications = session?.user?.id
    ? notifications.filter((notification) => notification.recipient_id === session.user.id)
    : [];
  const unreadNotificationCount = visibleNotifications.filter((notification) => !notification.is_read).length;
  const notificationState = {
    error: notificationsError,
    items: visibleNotifications,
    loading: notificationsLoading,
    message: notificationsMessage,
    onMarkRead: handleMarkNotificationRead,
    onOpenMeteorDetail: handleOpenMeteorDetail,
    onOpenObservationStation: handleOpenObservationStation,
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
  const isPasswordRecoveryVisible = Boolean(passwordRecovery);
  const isPostEditor = !isPasswordRecoveryVisible && route.name === "home" && activeTab === "post";

  return (
    <div
      className={`app-shell relative isolate bg-night-950 text-starlight ${
        isPostEditor
          ? "post-editor-shell overflow-hidden pb-0"
          : isPasswordRecoveryVisible
            ? "min-h-screen overflow-x-hidden pb-0"
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
        {isPasswordRecoveryVisible ? (
          <PasswordRecoveryPanel
            error={authError}
            loading={authLoading}
            message={authMessage}
            onBackToLogin={handleClosePasswordRecovery}
            onContinue={handleClosePasswordRecovery}
            onRequest={handlePasswordRecoveryRequest}
            onUpdate={handlePasswordRecoveryUpdate}
            recovery={passwordRecovery}
          />
        ) : (
          <>
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
          timelineRefresh={{
            hasNewPosts: timelineHasNewPosts,
            onRefresh: refreshObserveTimeline,
            pullDistance: timelinePullDistance,
            refreshing: timelineRefreshing,
          }}
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
          </>
        )}
      </div>

      {!isPostEditor && !isPasswordRecoveryVisible && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onboardingTarget={onboardingTarget}
          unreadCount={unreadNotificationCount}
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
      <BlackHoleConfirmationDialog
        dialog={blackHoleDialog}
        error={blackHoleError}
        onCancel={handleCloseBlackHoleDialog}
        onConfirm={handleConfirmBlackHole}
        saving={blackHoleSaving}
      />
      <ContentReportDialog
        dialog={contentReportDialog}
        onCancel={handleCloseContentReportDialog}
        onChange={handleContentReportChange}
        onSubmit={handleSubmitContentReport}
        saving={contentReportSaving}
      />
      {blackHoleMessage && profileScreenMode !== "black-hole" ? (
        <p
          className="fixed inset-x-4 bottom-24 z-[85] mx-auto max-w-sm rounded-2xl border border-comet/25 bg-night-950/95 px-4 py-3 text-center text-xs font-black text-comet shadow-2xl"
          role="status"
        >
          {blackHoleMessage}
        </p>
      ) : null}
      <StarMovieObservationMode
        media={starMovieObservation?.media ?? null}
        onClose={handleCloseStarMovieObservation}
        post={starMovieObservationPost}
      />
      {shouldShowInteractiveOnboarding ? (
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







function AppHeader({ auth }) {
  if (auth.session && auth.confirmation?.kind !== AUTH_CONFIRMATION_KIND.CONFIRMED) {
    return null;
  }

  return (
    <div className="mb-4 lg:ml-auto lg:w-[320px]" data-auth-panel="visible">
      <AuthPanel auth={auth} />
    </div>
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
  timelineRefresh,
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
      timelineRefresh={timelineRefresh}
      onOpenMeteorDetail={onOpenMeteorDetail}
      onOpenPostMedia={onOpenPostMedia}
      onOpenStarMovieObservation={onOpenStarMovieObservation}
      onOpenStarProfile={onOpenStarProfile}
      resonance={resonance}
      starLetters={starLetters}
    />
  );
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
  timelineRefresh,
  resonance,
  starLetters,
}) {
  return (
    <main className="observe-screen mx-auto min-w-0 max-w-3xl border-x border-white/10">
      <ObserveBrandHeader />
      <ObserveTimelineRefreshNotice timelineRefresh={timelineRefresh} />
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

function ObserveTimelineRefreshNotice({ timelineRefresh }) {
  const pullReady = timelineRefresh.pullDistance >= OBSERVE_PULL_REFRESH_THRESHOLD_PX;
  const statusMessage = timelineRefresh.refreshing
    ? "✦ 流星便を観測中…"
    : timelineRefresh.pullDistance > 0
      ? pullReady
        ? "✦ 離して更新"
        : "↓ 引いて更新"
      : "";

  if (!statusMessage && !timelineRefresh.hasNewPosts) {
    return null;
  }

  return (
    <div className="observe-timeline-refresh-slot" aria-live="polite">
      {statusMessage ? (
        <p className="observe-timeline-refresh-status" role="status">
          {statusMessage}
        </p>
      ) : (
        <button
          className="observe-timeline-new-posts-button"
          onClick={() => void timelineRefresh.onRefresh({ scrollToTop: true })}
          type="button"
        >
          ✦ 新しい流星便があります
        </button>
      )}
    </div>
  );
}



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
    <main className="content-page mx-auto max-w-3xl">
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

      <section className="content-feed-list space-y-4 px-3 pb-10 sm:px-5">
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
          <div className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
            この流星便は削除されました。
          </div>
        ) : null}

        {!detail.loading && !detail.error && !post ? (
          <div className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
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
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuButtonRef = useRef(null);
  const profile = profileRoute.profile;
  const isNotFound = profileRoute.error === "not-found";
  const displayName = profile?.display_name || defaultProfileView.display_name;
  const primaryTitle = getPrimaryProfileTitle(profile);
  const canUseBlackHole =
    postActions?.blackHole?.available &&
    Boolean(postActions?.session?.user?.id) &&
    Boolean(profile?.id) &&
    profile.id !== postActions.session.user.id &&
    !isTrustedProtectedProfile({ id: profile?.id, primaryTitle });
  const canReportProfile =
    postActions?.report?.available &&
    canReportContent({
      currentUserId: postActions?.session?.user?.id,
      targetId: profile?.id,
      targetOwnerId: profile?.id,
    });
  const canShowProfileMenu = canUseBlackHole || canReportProfile;

  return (
    <main className="content-page public-profile-page mx-auto max-w-3xl">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5">
        <button
          className="min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
          onClick={profileRoute.onBack}
          type="button"
        >
          観測へ戻る
        </button>
        <div className="relative flex items-center gap-2">
          <button
            className="min-h-10 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!profile?.username}
            onClick={() => profileRoute.onShareProfile(profile?.username)}
            type="button"
          >
            共有
          </button>
          {canShowProfileMenu ? (
            <>
              <button
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
                aria-label={`${displayName}のメニュー`}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-lg font-black text-slate-300"
                onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                ref={profileMenuButtonRef}
                type="button"
              >
                …
              </button>
              {isProfileMenuOpen ? (
                <div
                  className="absolute right-0 top-12 z-30 w-52 rounded-2xl border border-white/10 bg-night-950/95 p-1.5 shadow-2xl backdrop-blur-xl"
                  role="menu"
                >
                  {canUseBlackHole ? (
                    <button
                      className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-black text-slate-200 transition hover:bg-white/10"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        postActions.blackHole.onRequest?.({
                          id: profile.id,
                          displayName,
                          primaryTitle,
                          username: profile.username,
                        });
                      }}
                      role="menuitem"
                      type="button"
                    >
                      ブラックホールに送る
                    </button>
                  ) : null}
                  {canReportProfile ? (
                    <button
                      className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-black text-slate-200 transition hover:bg-white/10"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        postActions.report.onRequest?.({
                          targetId: profile.id,
                          targetLabel: displayName,
                          targetOwnerId: profile.id,
                          targetType: "profile",
                          triggerElement: profileMenuButtonRef.current,
                        });
                      }}
                      role="menuitem"
                      type="button"
                    >
                      観測局へ異常を伝える
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="content-flow">
        {(profileRoute.loading || profileRoute.error || profileRoute.shareMessage || profileRoute.shareError) && (
          <p
            className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
              profileRoute.error || profileRoute.shareError
                ? "border-sakura/30 bg-sakura/10 text-sakura"
                : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {isNotFound
              ? "この村人は見つかりませんでした。"
              : profileRoute.error || profileRoute.shareError || profileRoute.shareMessage || "星座を探しています…"}
          </p>
        )}

        {isNotFound ? (
          <section className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
            <h2 className="text-xl font-black text-white">この村人は見つかりませんでした。</h2>
            <p className="mt-3">URLが間違っているか、現在は表示できないプロフィールです。</p>
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
            <PageIntro subtitle="わたしだけの宇宙" title="My Universe" />
            <PublicProfileCard
              displayName={displayName}
              onOpenAvatar={() => profileRoute.onOpenAvatar(profile.avatar_url, `${displayName}の星影`)}
              onShare={() => profileRoute.onShareProfile(profile.username)}
              profile={profile}
              tags={profileRoute.tags}
            />

            <section className="feed-section">
              <h2 className="section-heading">{displayName}の流星便</h2>
              {profileRoute.posts.length === 0 ? (
                <p className="text-sm leading-7 text-slate-400">公開されている流星便はまだありません。</p>
              ) : (
                <div className="content-feed-list space-y-5">
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
            </section>
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
    <main className="content-page mx-auto max-w-3xl">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5">
        <button
          className="min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-amber-300/35 hover:bg-amber-300/10 hover:text-amber-100"
          onClick={meteorTagRoute.onBack}
          type="button"
        >
          戻る
        </button>
      </section>

      <section className="content-feed-list space-y-5 px-3 pb-10 sm:px-5">
        <section className="page-intro">
          <h1 className="break-words text-amber-100">{tagLabel}</h1>
          <p className="text-slate-300">
            同じ流星タグが添えられた公開流星便を、新しい順に観測します。
          </p>
        </section>

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
          <div className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
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















function RConnectScreen({ notifications }) {
  return (
    <main className="mx-auto max-w-3xl">
      <section className="glass-panel reconnect-panel p-5 sm:p-6">
        <section className="page-intro reconnect-intro">
          <h1>
            Re:Connect<span className="reconnect-meaning">（共鳴で繋がる）</span>
          </h1>
          <p>共鳴・星文・観測通知がここに届きます。</p>
        </section>
        <PushNotificationTestCard onboarding={notifications.onboarding} session={notifications.session} />

        {!notifications.session ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-400">
            ログインすると、自分宛てのRe:Connectを確認できます。
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
                {notifications.error || notifications.message || "Re:Connectを読み込み中..."}
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
                    onOpenObservationStation={notifications.onOpenObservationStation}
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

function NotificationCard({ notification, onMarkRead, onOpenMeteorDetail, onOpenObservationStation, onOpenStarLetterThread, onOpenStarProfile, updating }) {
  const isUnread = !notification.is_read;
  const isContentReport = notification.type === "content_report";
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

      {!isContentReport ? <div className="mt-3 flex items-center gap-3">
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
      </div> : null}

      <p className="mt-3 text-sm leading-7 text-slate-100">{formatNotificationMessage(notification)}</p>
      <p className="mt-2 text-[11px] font-bold text-slate-500">type: {notification.type}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {isContentReport ? (
          <button
            className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={() => onOpenObservationStation?.(notification.content_report_id)}
            type="button"
          >
            観測局を開く
          </button>
        ) : notification.post_id ? (
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

  if (profile.profileScreenMode === "observation-station") {
    return (
      <ObservationStationAdminScreen
        initialReportId={profile.observationStationInitialReportId}
        isAdmin={profile.guideIsAdmin}
        onBack={profile.onBackToSettings}
      />
    );
  }

  if (profile.profileScreenMode === "black-hole") {
    return (
      <main className="mx-auto max-w-2xl">
        <BlackHoleManagementScreen
          blackHole={profile.blackHole}
          onBack={profile.onBackToSettings}
        />
      </main>
    );
  }

  return (
    <main className="content-page my-universe-page mx-auto max-w-2xl">
      <PageIntro subtitle="わたしだけの宇宙" title="My Universe" />
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

function BlackHoleManagementScreen({ blackHole, onBack }) {
  return (
    <Panel eyebrow="settings" title="ブラックホール管理">
      <button
        className="min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
        onClick={onBack}
        type="button"
      >
        設定へ戻る
      </button>
      <p className="mt-4 text-sm leading-7 text-slate-400">
        あなたがブラックホールへ送った村人だけを表示しています。
      </p>
      {blackHole?.message || blackHole?.error ? (
        <p
          className={`mt-4 rounded-2xl border px-4 py-3 text-xs leading-6 ${
            blackHole.error
              ? "border-sakura/30 bg-sakura/10 text-sakura"
              : "border-comet/20 bg-comet/10 text-comet"
          }`}
          role={blackHole.error ? "alert" : "status"}
        >
          {blackHole.error || blackHole.message}
        </p>
      ) : null}
      {blackHole?.loading ? (
        <p className="mt-5 text-sm text-slate-400">ブラックホールを確認中...</p>
      ) : blackHole?.items?.length ? (
        <div className="mt-5 divide-y divide-white/10">
          {blackHole.items.map((item) => (
            <article className="flex flex-wrap items-center gap-3 py-4" key={item.blockId}>
              <AvatarFrame
                avatar={getAvatarText(item.displayName)}
                avatarUrl={item.avatarUrl}
                className="h-11 w-11 rounded-2xl text-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-white">{item.displayName}</p>
                <p className="truncate text-xs text-slate-500">
                  {item.username ? `@${item.username}` : "ユーザー名未設定"}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {formatNotificationTime(item.createdAt)}
                </p>
              </div>
              <button
                className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-200 transition hover:border-comet/30 hover:bg-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={blackHole.saving}
                onClick={() =>
                  blackHole.onRestore?.({
                    id: item.blockedId,
                    displayName: item.displayName,
                    username: item.username,
                  })
                }
                type="button"
              >
                ブラックホールから戻す
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-7 text-slate-500">
          ブラックホールへ送った村人はいません。
        </p>
      )}
    </Panel>
  );
}

function SentStarLetterCard({ item, onOpenStarLetterThread }) {
  const sourcePost = item.sourcePost;
  const sourcePreview = sourcePost?.text?.trim() || "画像・動画を含む流星便";

  return (
    <article className="content-letter-row overflow-hidden p-4 sm:p-5">
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
            <ProfileTitleEmblem decorative size="compact" title={item.primaryTitle} />
            <ProfileTitleBadge size="compact" title={item.primaryTitle} />
            <span className="text-xs text-slate-500">{item.handle}</span>
            <span className="text-xs text-slate-500">· {item.time}</span>
            <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-1 text-[10px] font-black text-comet">
              星文
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
            <LinkedText>{item.body}</LinkedText>
          </p>

          <div className="source-post-reference mt-4 py-3">
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
      <div className="content-feed-list space-y-5">
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
    <section className="feed-section">
      <div aria-label="My Universeの記録" className="content-tabs mb-5 grid grid-cols-3" role="tablist">
        <button
          aria-selected={activeView === "posts"}
          className={`content-tab min-h-11 px-2 text-xs font-black ${
            activeView === "posts" ? "content-tab-active" : "text-slate-400"
          }`}
          onClick={() => myConstellation?.onViewChange?.("posts")}
          role="tab"
          type="button"
        >
          流星便 <span className="ml-1 text-[10px] opacity-70">{ownPosts.items.length}</span>
        </button>
        <button
          aria-selected={isResonatedView}
          className={`content-tab min-h-11 px-2 text-xs font-black ${
            isResonatedView ? "content-tab-active" : "text-slate-400"
          }`}
          onClick={() => myConstellation?.onViewChange?.("resonated")}
          role="tab"
          type="button"
        >
          共鳴 <span className="ml-1 text-[10px] opacity-70">{myConstellation.resonatedPosts.items.length}</span>
        </button>
        <button
          aria-selected={isStarLetterView}
          className={`content-tab min-h-11 px-2 text-xs font-black ${
            isStarLetterView ? "content-tab-active" : "text-slate-400"
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
          <div className="content-feed-list space-y-5">
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
    </section>
  );
}

function ArchivedStarLetterCard({ archive, item }) {
  const sourcePost = item.sourcePost;
  const sourcePreview = sourcePost?.body?.trim() || "画像・動画を含む流星便";
  const isSaving = archive.starLetterSavingIds?.has(item.id);

  return (
    <article className="content-letter-row overflow-hidden p-4 sm:p-5">
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
            <ProfileTitleEmblem decorative size="compact" title={item.primaryTitle} />
            <ProfileTitleBadge size="compact" title={item.primaryTitle} />
            <span className="text-xs text-slate-500">{item.handle}</span>
            <span className="text-xs text-slate-500">· {item.time}</span>
            <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-1 text-[10px] font-black text-comet">
              星文
            </span>
          </div>
          <p className={`mt-3 whitespace-pre-wrap text-sm leading-7 ${item.isDeleted ? "text-slate-500" : "text-slate-200"}`}>
            <LinkedText>{item.isDeleted ? "削除された星文です。" : item.body}</LinkedText>
          </p>

          <div className="source-post-reference mt-4 py-3">
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
    <main className="content-page archive-page mx-auto max-w-3xl">
      <section className="page-intro archive-intro">
        <h1>Archive</h1>
        <p>自分の星空に残しておきたい流星便と星文を集めます。</p>
        {archive.session ? (
          <div aria-label="Archiveの種類" className="content-tabs mt-5 grid grid-cols-2" role="tablist">
            <button
              aria-selected={!isStarLetterView}
              className={`content-tab min-h-11 px-3 text-xs font-black ${
                !isStarLetterView ? "content-tab-active" : "text-slate-400"
              }`}
              onClick={() => archive.onViewChange?.("posts")}
              role="tab"
              type="button"
            >
              流星便 <span className="ml-1 text-[10px] opacity-70">{archive.items.length}</span>
            </button>
            <button
              aria-selected={isStarLetterView}
              className={`content-tab min-h-11 px-3 text-xs font-black ${
                isStarLetterView ? "content-tab-active" : "text-slate-400"
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
        <section className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
          ログインすると、Archiveした流星便と星文を確認できます。
        </section>
      ) : (
        <section className="content-feed-list space-y-5 px-3 pb-10 sm:px-5">
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
              <div className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
                まだArchiveされた星文はありません。
              </div>
            ) : (
              archive.starLetterItems.map((item) => (
                <ArchivedStarLetterCard archive={archive} item={item} key={item.archiveId ?? item.id} />
              ))
            )
          ) : !loading && !error && archive.items.length === 0 ? (
            <div className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
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
        {auth.session?.user?.id ? <ChiaMemorySettings key={auth.session.user.id} userId={auth.session.user.id} /> : null}
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
        {profile.guideIsAdmin && profile.observationStation?.available ? (
          <button
            className="w-full rounded-2xl border border-comet/25 bg-comet/10 px-4 py-4 text-left transition hover:border-comet/40 hover:bg-comet/15"
            onClick={profile.onOpenObservationStation}
            type="button"
          >
            <span className="block text-sm font-black text-white">観測局</span>
            <span className="mt-1 block text-xs leading-6 text-slate-400">
              村人から届いた異常を確認し、対応状態を記録します。
            </span>
          </button>
        ) : null}
        {auth.session && profile.blackHole?.available ? (
          <button
            className="w-full rounded-2xl border border-indigo-300/20 bg-indigo-300/10 px-4 py-4 text-left transition hover:border-indigo-200/35 hover:bg-indigo-300/15"
            onClick={profile.onOpenBlackHoleManagement}
            type="button"
          >
            <span className="block text-sm font-black text-white">ブラックホール管理</span>
            <span className="mt-1 block text-xs leading-6 text-slate-400">
              ブラックホールへ送った村人を確認し、ここから戻せます。
            </span>
          </button>
        ) : null}
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
          <div className="empty-state px-4 py-8 text-center text-sm leading-7 text-slate-400">
            まだ流星便はありません。最初の光を放流してみましょう。
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              archive={archive}
              emblemPlacement="corner"
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





















function PageIntro({ subtitle, title }) {
  return (
    <header className="page-intro">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}





export default App;

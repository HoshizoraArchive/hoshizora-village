import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const bottomNavItems = [
  { id: "observe", label: "観測", icon: "telescope" },
  { id: "rconnect", label: "R.Connect", icon: "bell" },
  { id: "post", label: "流星便投稿", icon: "plus", primary: true },
  { id: "archive", label: "Archive", icon: "bookmark" },
  { id: "profile", label: "わたしの星座", icon: "constellation" },
];

const STAR_LETTER_MAX_LENGTH = 500;
const FEEDBACK_MAX_LENGTH = 1000;
const POST_MAX_LENGTH = 500;
const FEEDBACK_TYPES = ["不具合", "分かりにくい", "改善案", "ほしい機能", "感想", "その他"];
const POST_SELECT_COLUMNS = "id, author_id, type, body, visibility, created_at";
const POST_SELECT_COLUMNS_WITH_DELETED_AT = `${POST_SELECT_COLUMNS}, deleted_at`;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_CROP_SIZE = 512;
const AVATAR_CROP_MIN_ZOOM = 1;
const AVATAR_CROP_MAX_ZOOM = 3;
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

const emptyProfileForm = {
  display_name: "",
  username: "",
  avatar_url: "",
  bio: "",
  constellation_note: "",
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
      reject(new Error("画像の読み込みに失敗しました。"));
    };

    image.src = imageUrl;
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
    throw new Error("星影の切り抜き準備に失敗しました。");
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

        reject(new Error("星影の切り抜きに失敗しました。"));
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

function getRouteFromLocation() {
  const meteorMatch = window.location.pathname.match(/^\/meteor\/([^/?#]+)\/?$/);

  if (meteorMatch?.[1]) {
    return {
      name: "meteor",
      postId: decodeURIComponent(meteorMatch[1]),
      username: null,
    };
  }

  const starMatch = window.location.pathname.match(/^\/stars\/([^/?#]+)\/?$/);

  if (starMatch?.[1]) {
    return {
      name: "starProfile",
      postId: null,
      username: decodeURIComponent(starMatch[1]).replace(/^@/, ""),
    };
  }

  return {
    name: "home",
    postId: null,
    username: null,
  };
}

function buildMeteorPath(postId) {
  return `/meteor/${encodeURIComponent(postId)}`;
}

function buildStarProfilePath(username) {
  return `/stars/${encodeURIComponent(String(username ?? "").replace(/^@/, ""))}`;
}

function getAvatarText(value) {
  return value.trim().charAt(0) || defaultProfileView.avatar;
}

function formatCount(value) {
  if (!Number.isFinite(value)) {
    return "未集計";
  }

  return value.toLocaleString("ja-JP");
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

  return notification.message;
}

function mapSavedPost(post, authorProfile) {
  const displayName = authorProfile?.display_name || defaultProfileView.display_name;
  const username = authorProfile?.username ? `@${authorProfile.username}` : "@starry_creator";

  return {
    id: post.id,
    authorId: post.author_id,
    authorUsername: authorProfile?.username ?? null,
    name: displayName,
    handle: username,
    badge: "流星便",
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile?.avatar_url ?? null,
    createdAt: post.created_at,
    deletedAt: post.deleted_at ?? null,
    time: formatPostTime(post.created_at),
    type: post.type,
    text: post.body,
    visibility: post.visibility,
    tags: ["#流星便", "#観測待ち"],
    resonanceCount: 0,
    comments: "未集計",
    glow: "from-comet/25 to-sakura/20",
  };
}

function applyAuthorProfileToPost(post, authorProfile) {
  if (!post || post.authorId !== authorProfile?.id) {
    return post;
  }

  const displayName = authorProfile.display_name || defaultProfileView.display_name;

  return {
    ...post,
    authorUsername: authorProfile.username ?? null,
    name: displayName,
    handle: authorProfile.username ? `@${authorProfile.username}` : post.handle,
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile.avatar_url ?? null,
  };
}

function mapArchivedPost(archive, post, authorProfile) {
  return {
    ...mapSavedPost(post, authorProfile),
    archiveId: archive.id,
    archivedAt: archive.created_at,
    archivedTime: formatNotificationTime(archive.created_at),
  };
}

function applyAuthorProfileToStarLetter(letter, authorProfile) {
  if (!letter || letter.authorId !== authorProfile?.id) {
    return letter;
  }

  const displayName = authorProfile.display_name || "誰か";

  return {
    ...letter,
    name: displayName,
    handle: authorProfile.username ? `@${authorProfile.username}` : letter.handle,
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile.avatar_url ?? null,
  };
}

function mapStarLetter(letter, authorProfile) {
  const displayName = authorProfile?.display_name || "誰か";

  return {
    id: letter.id,
    postId: letter.post_id,
    authorId: letter.author_id,
    body: letter.body,
    name: displayName,
    handle: authorProfile?.username ? `@${authorProfile.username}` : "@star_letter",
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile?.avatar_url ?? null,
    time: formatNotificationTime(letter.created_at),
    createdAt: letter.created_at,
    updatedAt: letter.updated_at ?? null,
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
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [profileShareMessage, setProfileShareMessage] = useState("");
  const [profileShareError, setProfileShareError] = useState("");
  const [session, setSession] = useState(null);
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
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarCropZoom, setAvatarCropZoom] = useState(AVATAR_CROP_MIN_ZOOM);
  const [avatarCropOffset, setAvatarCropOffset] = useState({ x: 0, y: 0 });
  const [avatarImageSize, setAvatarImageSize] = useState(null);
  const [avatarCropFrameSize, setAvatarCropFrameSize] = useState(AVATAR_CROP_PREVIEW_FALLBACK_SIZE);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarModal, setAvatarModal] = useState(null);
  const [profileResonanceCount, setProfileResonanceCount] = useState(null);
  const [savedPosts, setSavedPosts] = useState([]);
  const [ownPosts, setOwnPosts] = useState([]);
  const [ownPostsLoading, setOwnPostsLoading] = useState(false);
  const [ownPostsError, setOwnPostsError] = useState("");
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [postSaving, setPostSaving] = useState(false);
  const [postMessage, setPostMessage] = useState("");
  const [postError, setPostError] = useState("");
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
  const [feedbackType, setFeedbackType] = useState(FEEDBACK_TYPES[0]);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const detailPostId = route.name === "meteor" ? route.postId : null;
  const publicProfileUsername = route.name === "starProfile" ? route.username : null;
  const postIdsKey = savedPosts.map((post) => post.id).filter(Boolean).join("|");
  const ownPostIdsKey = ownPosts.map((post) => post.id).filter(Boolean).join("|");
  const archivedPostIdsKey = archivedPosts.map((post) => post.id).filter(Boolean).join("|");
  const publicProfilePostIdsKey = publicProfilePosts.map((post) => post.id).filter(Boolean).join("|");
  const allPostIdsKey = [
    ...new Set(
      [...savedPosts, ...ownPosts, ...archivedPosts, ...publicProfilePosts, detailPost]
        .filter(Boolean)
        .map((post) => post.id)
        .filter(Boolean),
    ),
  ].join("|");

  useEffect(() => {
    function handlePopState() {
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
        setAuthError(error.message);
        return;
      }

      setSession(data.session);
      setAuthStatus(data.session ? "ログイン中" : "未ログイン");
    }

    readSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthStatus(session ? "ログイン中" : "未ログイン");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
        setResonanceError(error.message);
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
    const userId = session?.user?.id;

    if (!userId) {
      setProfile(null);
      setProfileForm(emptyProfileForm);
      setProfileLoading(false);
      setProfileSaving(false);
      setProfileMessage("");
      setProfileError("");
      setProfileScreenMode("view");
      setProfileResonanceCount(null);
      return;
    }

    async function readProfile() {
      setProfileLoading(true);
      setProfileMessage("");
      setProfileError("");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, bio, constellation_note")
        .eq("id", userId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      setProfileLoading(false);

      if (error) {
        setProfileError(error.message);
        return;
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
        supabase.from("posts").select(columns).eq("id", detailPostId).eq("type", "text").maybeSingle(),
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

      const { data: authorProfile, error: profileRowsError } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .eq("id", post.author_id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      setDetailPost(mapSavedPost(post, profileRowsError ? null : authorProfile));
      setDetailPostLoading(false);
    }

    readDetailPost();

    return () => {
      isMounted = false;
    };
  }, [detailPostId]);

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

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, bio, constellation_note")
        .eq("username", publicProfileUsername)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (profileError) {
        setPublicProfile(null);
        setPublicProfileTags([]);
        setPublicProfilePosts([]);
        setPublicProfileLoading(false);
        setPublicProfileError(profileError.message);
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
          .eq("visibility", "public")
          .eq("type", "text");

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query.order("created_at", { ascending: false }).limit(30);
      });

      if (!isMounted) {
        return;
      }

      if (postsError) {
        setPublicProfile(profileRow);
        setPublicProfileTags(tagRows ?? []);
        setPublicProfilePosts([]);
        setPublicProfileLoading(false);
        setPublicProfileError(postsError.message);
        return;
      }

      setPublicProfile(profileRow);
      setPublicProfileTags(tagRows ?? []);
      setPublicProfilePosts((postRows ?? []).map((post) => mapSavedPost(post, profileRow)));
      setPublicProfileLoading(false);
    }

    readPublicProfile();

    return () => {
      isMounted = false;
    };
  }, [publicProfileUsername]);

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

      const { data, error } = await supabase
        .from("star_letters")
        .select("id, post_id, author_id, body, created_at, updated_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (error) {
        setStarLettersLoading(false);
        setStarLettersError(error.message);
        return;
      }

      const authorIds = [...new Set((data ?? []).map((letter) => letter.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", authorIds);

        if (!isMounted) {
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      const nextLettersByPostId = {};

      for (const letter of data ?? []) {
        const mappedLetter = mapStarLetter(letter, profilesById.get(letter.author_id));
        nextLettersByPostId[letter.post_id] = [...(nextLettersByPostId[letter.post_id] ?? []), mappedLetter];
      }

      setStarLettersByPostId(nextLettersByPostId);
      setStarLettersLoading(false);
    }

    readStarLetters();

    return () => {
      isMounted = false;
    };
  }, [allPostIdsKey]);

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
        let query = supabase.from("posts").select(columns).eq("author_id", userId).eq("type", "text");

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
        setOwnPostsError(error.message);
        return;
      }

      setOwnPosts((data ?? []).map((post) => mapSavedPost(post, profile)));
    }

    readOwnPosts();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, profile?.display_name, profile?.username, profile?.avatar_url]);

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
        setArchivesError(archiveError.message);
        return;
      }

      const postIds = (archiveRows ?? []).map((archive) => archive.post_id).filter(Boolean);

      if (postIds.length === 0) {
        setArchivedPosts([]);
        setArchivesLoading(false);
        return;
      }

      const { data: postRows, error: postsError } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = supabase.from("posts").select(columns).in("id", postIds).eq("type", "text");

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
        setArchivesError(postsError.message);
        return;
      }

      const authorIds = [...new Set((postRows ?? []).map((post) => post.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", authorIds);

        if (!isMounted) {
          return;
        }

        if (profileRowsError) {
          setArchivesLoading(false);
          setArchivesError(profileRowsError.message);
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
          return post ? mapArchivedPost(archive, post, profilesById.get(post.author_id)) : null;
        })
        .filter(Boolean);

      setArchivedPosts(mappedArchives);
      setArchivesLoading(false);
    }

    readArchivedPosts();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let isMounted = true;
    const userId = session?.user?.id;

    if (!userId) {
      setProfileResonanceCount(null);
      return () => {
        isMounted = false;
      };
    }

    async function readProfileResonanceCount() {
      const { data: ownPostRows, error: ownPostsError } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = supabase.from("posts").select(columns).eq("author_id", userId);

        if (supportsSoftDelete) {
          query = query.is("deleted_at", null);
        }

        return query;
      });

      if (!isMounted) {
        return;
      }

      if (ownPostsError) {
        setProfileResonanceCount(null);
        return;
      }

      const ownPostIds = (ownPostRows ?? []).map((post) => post.id).filter(Boolean);

      if (ownPostIds.length === 0) {
        setProfileResonanceCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("resonances")
        .select("id", { count: "exact", head: true })
        .in("post_id", ownPostIds);

      if (!isMounted) {
        return;
      }

      setProfileResonanceCount(error ? null : (count ?? 0));
    }

    readProfileResonanceCount();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

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
        .select("id, recipient_id, actor_id, post_id, type, message, is_read, created_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      setNotificationsLoading(false);

      if (error) {
        setNotificationsError(error.message);
        return;
      }

      const actorIds = [...new Set((data ?? []).map((notification) => notification.actor_id).filter(Boolean))];
      const profilesById = new Map();

      if (actorIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", actorIds);

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
        })),
      );
    }

    readNotifications();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let isMounted = true;

    async function readPublicPosts() {
      setPostsLoading(true);
      setPostsError("");

      const { data, error } = await runPostQuery((columns, supportsSoftDelete) => {
        let query = supabase.from("posts").select(columns).eq("visibility", "public").eq("type", "text");

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
        setPostsError(error.message);
        return;
      }

      const authorIds = [...new Set((data ?? []).map((post) => post.author_id).filter(Boolean))];
      const profilesById = new Map();

      if (authorIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", authorIds);

        if (!isMounted) {
          return;
        }

        if (profileRowsError) {
          setPostsLoading(false);
          setPostsError(profileRowsError.message);
          return;
        }

        for (const profileRow of profileRows ?? []) {
          profilesById.set(profileRow.id, profileRow);
        }
      }

      if (!isMounted) {
        return;
      }

      setSavedPosts((data ?? []).map((post) => mapSavedPost(post, profilesById.get(post.author_id))));
      setPostsLoading(false);
    }

    readPublicPosts();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSignUp(email, password) {
    setAuthLoading(true);
    setAuthMessage("");
    setAuthError("");

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setSession(data.session);
    setAuthStatus(data.session ? "ログイン中" : "未ログイン");
    setAuthMessage(
      data.session
        ? "会員登録してログインしました。"
        : "確認メールを送信しました。メールを確認してからログインしてください。",
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
      setAuthError(error.message);
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
      setAuthError(error.message);
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

  function clearSelectedAvatar() {
    setAvatarFile(null);
    setAvatarPreviewUrl("");
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

    if (!file) {
      clearSelectedAvatar();
      return;
    }

    if (!AVATAR_ALLOWED_TYPES[file.type]) {
      clearSelectedAvatar();
      event.target.value = "";
      setProfileError("jpg / jpeg / png / webp の画像を選んでください。");
      return;
    }

    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      clearSelectedAvatar();
      event.target.value = "";
      setProfileError("画像は5MBまで選べます。");
      return;
    }

    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    resetAvatarCrop();
    setProfileMessage("星影を選びました。位置を調整して保存できます。");
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
    setProfileMessage("星影の位置をリセットしました。");
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

      let croppedAvatarBlob;

      try {
        croppedAvatarBlob = await createCroppedAvatarBlob({
          file: avatarFile,
          frameSize: avatarCropFrameSize,
          offset: avatarCropOffset,
          zoom: avatarCropZoom,
        });
      } catch (cropError) {
        setAvatarUploading(false);
        setProfileSaving(false);
        setProfileError(cropError.message);
        return;
      }

      const filePath = `${session.user.id}/avatar-cropped-${Date.now()}.${AVATAR_CROP_OUTPUT_EXTENSION}`;
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, croppedAvatarBlob, {
        cacheControl: "3600",
        contentType: AVATAR_CROP_OUTPUT_TYPE,
        upsert: false,
      });

      setAvatarUploading(false);

      if (uploadError) {
        setProfileSaving(false);
        setProfileError(`星影の更新に失敗しました。${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      nextAvatarUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: session.user.id,
          display_name: displayName,
          username: optionalUsername(profileForm.username),
          avatar_url: nextAvatarUrl,
          bio: optionalText(profileForm.bio),
          constellation_note: optionalText(profileForm.constellation_note),
        },
        { onConflict: "id" },
      )
      .select("id, display_name, username, avatar_url, bio, constellation_note")
      .single();

    setProfileSaving(false);

    if (error) {
      setProfileError(error.message);
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
    setSavedPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile)));
    setOwnPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile)));
    setArchivedPosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile)));
    setPublicProfilePosts((currentPosts) => currentPosts.map((post) => applyAuthorProfileToPost(post, nextProfile)));
    setDetailPost((currentPost) => applyAuthorProfileToPost(currentPost, nextProfile));
    setStarLettersByPostId((currentLettersByPostId) =>
      Object.fromEntries(
        Object.entries(currentLettersByPostId).map(([postId, letters]) => [
          postId,
          letters.map((letter) => applyAuthorProfileToStarLetter(letter, nextProfile)),
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
      setProfileError(
        `${label}設定は、Supabase SQL Editorでmigrationを実行した後に保存できます。既存のプロフィール表示、Archive、共鳴機能はそのまま使えます。`,
      );
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
      setFeedbackError(error.message);
      return;
    }

    setFeedbackBody("");
    setFeedbackMessage("フィードバックを送信しました。ありがとうございます。");
  }

  async function handlePostSubmit(event) {
    event.preventDefault();
    setPostMessage("");
    setPostError("");

    if (!session?.user?.id) {
      setPostError("ログインすると流星便を放流できます。");
      return;
    }

    if (!profile?.id) {
      setPostError("先にプロフィールを保存してください。");
      return;
    }

    const body = postDraft.trim();

    if (!body) {
      setPostError("流星便の本文を入力してください。");
      return;
    }

    setPostSaving(true);

    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: session.user.id,
        type: "text",
        body,
        visibility: "public",
      })
      .select("id, author_id, type, body, visibility, created_at")
      .single();

    setPostSaving(false);

    if (error) {
      setPostError(error.message);
      return;
    }

    const newPost = mapSavedPost(data, profile);
    setSavedPosts((currentPosts) => [newPost, ...currentPosts.filter((post) => post.id !== newPost.id)]);
    setOwnPosts((currentPosts) => [newPost, ...currentPosts.filter((post) => post.id !== newPost.id)]);
    setPostDraft("");
    setPostMessage("流星便を放流しました。");
    setActiveTab("observe");
  }

  function updatePostEverywhere(postId, updater) {
    setSavedPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setOwnPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setArchivedPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? updater(post) : post)));
    setDetailPost((currentPost) => (currentPost?.id === postId ? updater(currentPost) : currentPost));
  }

  function removePostFromVisibleLists(postId) {
    setSavedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setOwnPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setArchivedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
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

    if (post.type !== "text") {
      setPostActionError("MVPではテキスト流星便だけ編集できます。");
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

    if (post.type !== "text") {
      setPostActionError("MVPではテキスト流星便だけ編集できます。");
      return;
    }

    if (post.deletedAt) {
      setPostActionError("削除済みの流星便は編集できません。");
      return;
    }

    const body = (postEditDrafts[post.id] ?? "").trim();

    if (!body) {
      setPostActionError("流星便の本文を入力してください。");
      return;
    }

    if (getTrimmedCharacterLength(body) > POST_MAX_LENGTH) {
      setPostActionError("流星便は500文字以内で放流してください。");
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

    setPostUpdatingId(null);

    if (error) {
      setPostActionError(error.message);
      return;
    }

    const nextBody = data?.body ?? body;
    updatePostEverywhere(post.id, (currentPost) => ({
      ...currentPost,
      text: nextBody,
    }));
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
        setPostActionError("流星便削除には、Supabase SQL Editorで soft delete migration の実行が必要です。");
        return;
      }

      setPostActionError(error.message);
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
      archivedPosts.find((post) => post.id === postId) ??
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
      setResonanceError(error.message);
      return;
    }

    if (targetPost.authorId === session.user.id) {
      setProfileResonanceCount((currentCount) => (Number.isFinite(currentCount) ? currentCount + 1 : currentCount));
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

    setArchiveSavingPostId(postId);

    if (archivedPost?.archiveId) {
      const { error } = await supabase
        .from("archives")
        .delete()
        .eq("id", archivedPost.archiveId)
        .eq("profile_id", session.user.id);

      setArchiveSavingPostId(null);

      if (error) {
        setArchivesError(error.message);
        return;
      }

      setArchivedPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
      setArchivesMessage("Archiveから外しました。");
      return;
    }

    const targetPost =
      savedPosts.find((post) => post.id === postId) ??
      ownPosts.find((post) => post.id === postId) ??
      archivedPosts.find((post) => post.id === postId) ??
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
        return;
      }

      setArchivesError(error.message);
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
      setNotificationsError(error.message);
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

  function handleToggleStarLetters(postId) {
    setStarLettersMessage("");
    setStarLettersError("");
    setOpenStarLetterPostId((currentPostId) => (currentPostId === postId ? null : postId));
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
      archivedPosts.find((post) => post.id === postId) ??
      (detailPost?.id === postId ? detailPost : null);

    if (!targetPost) {
      setStarLettersError("星文を送る流星便が見つかりませんでした。");
      return;
    }

    setStarLetterSavingPostId(postId);

    const { data, error } = await supabase
      .from("star_letters")
      .insert({
        post_id: postId,
        author_id: session.user.id,
        body,
      })
      .select("id, post_id, author_id, body, created_at, updated_at")
      .single();

    setStarLetterSavingPostId(null);

    if (error) {
      setStarLettersError(error.message);
      return;
    }

    const mappedLetter = mapStarLetter(data, profile);

    setStarLettersByPostId((currentLetters) => ({
      ...currentLetters,
      [postId]: [...(currentLetters[postId] ?? []), mappedLetter],
    }));
    setStarLetterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [postId]: "",
    }));
    setOpenStarLetterPostId(postId);
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

    const { data, error } = await supabase
      .from("star_letters")
      .update({
        body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", letter.id)
      .eq("author_id", session.user.id)
      .select("id, post_id, author_id, body, created_at, updated_at")
      .single();

    setStarLetterUpdatingId(null);

    if (error) {
      setStarLettersError(error.message);
      return;
    }

    setStarLettersByPostId((currentLetters) => ({
      ...currentLetters,
      [letter.postId]: (currentLetters[letter.postId] ?? []).map((currentLetter) =>
        currentLetter.id === letter.id
          ? {
              ...currentLetter,
              body: data?.body ?? body,
              updatedAt: data?.updated_at ?? currentLetter.updatedAt,
            }
          : currentLetter,
      ),
    }));
    handleCancelStarLetterEdit(letter.id);
    setStarLettersMessage("星文を保存しました。");
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

    const { error } = await supabase
      .from("star_letters")
      .delete()
      .eq("id", letter.id)
      .eq("author_id", session.user.id);

    setStarLetterDeletingId(null);

    if (error) {
      setStarLettersError(error.message);
      return;
    }

    setStarLettersByPostId((currentLetters) => ({
      ...currentLetters,
      [letter.postId]: (currentLetters[letter.postId] ?? []).filter((currentLetter) => currentLetter.id !== letter.id),
    }));
    setStarLetterEditDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[letter.id];
      return nextDrafts;
    });
    setEditingStarLetterId((currentId) => (currentId === letter.id ? null : currentId));
    setStarLettersMessage("星文を削除しました。");
  }

  function handleOpenMeteorDetail(postId) {
    if (!postId) {
      return;
    }

    const nextPath = buildMeteorPath(postId);

    if (window.location.pathname !== nextPath) {
      window.history.pushState({ hoshizoraRoute: "meteor" }, "", nextPath);
    }

    setRoute({ name: "meteor", postId, username: null });
    setShareMessage("");
    setShareError("");
    setOpenStarLetterPostId(postId);
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

    setRoute({ name: "starProfile", postId: null, username: String(username).replace(/^@/, "") });
    setShareMessage("");
    setShareError("");
    setProfileShareMessage("");
    setProfileShareError("");
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
    setRoute({ name: "home", postId: null, username: null });
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
    setRoute({ name: "home", postId: null, username: null });
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
          title: "星空Villageのわたしの星座",
          text: "星空Villageのわたしの星座です。",
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

  function handleTabChange(tabId) {
    if (route.name !== "home") {
      window.history.pushState({}, "", "/");
      setRoute({ name: "home", postId: null, username: null });
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
  const profileState = {
    canEdit: Boolean(session),
    data: profile,
    error: profileError,
    avatarAccept: AVATAR_ACCEPT,
    avatarCropFrameSize,
    avatarCropOffset,
    avatarCropZoom,
    avatarFileName: avatarFile?.name ?? "",
    avatarImageSize,
    avatarPreviewUrl,
    avatarUploading,
    form: profileForm,
    loading: profileLoading,
    message: profileMessage,
    onArchiveNotificationSettingSubmit: handleArchiveNotificationSettingSubmit,
    onAvatarCropFrameSizeChange: handleAvatarCropFrameSizeChange,
    onAvatarCropImageLoad: handleAvatarCropImageLoad,
    onAvatarCropOffsetChange: handleAvatarCropOffsetChange,
    onAvatarCropReset: handleAvatarCropReset,
    onAvatarCropZoomChange: handleAvatarCropZoomChange,
    onAvatarFileChange: handleProfileAvatarFileChange,
    onChange: handleProfileFieldChange,
    onBackToProfile: handleBackToProfile,
    onCancelEdit: handleCancelProfileEdit,
    onOpenFeedback: handleOpenFeedback,
    onOpenAvatar: handleOpenAvatarModal,
    onOpenGuide: handleOpenGuide,
    onOpenSettings: handleOpenProfileSettings,
    onResonanceNotificationSettingSubmit: handleResonanceNotificationSettingSubmit,
    onShareProfile: handleShareStarProfile,
    onStartEdit: handleStartProfileEdit,
    onSubmit: handleProfileSubmit,
    resonanceCount: profileResonanceCount,
    saving: profileSaving,
    shareError: profileShareError,
    shareMessage: profileShareMessage,
    profileScreenMode,
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
  const composer = {
    canPost: Boolean(session),
    draft: postDraft,
    error: postError,
    hasProfile: Boolean(profile?.id),
    message: postMessage,
    onChange: setPostDraft,
    onSubmit: handlePostSubmit,
    saving: postSaving,
  };
  const resonance = {
    error: resonanceError,
    message: resonanceMessage,
    onResonate: handleResonance,
    savingPostId: resonanceSavingPostId,
  };
  const archiveState = {
    archivedPostIds: archivedPosts.map((post) => post.id),
    error: archivesError,
    items: archivedPosts,
    loading: archivesLoading,
    message: archivesMessage,
    onToggleArchive: handleToggleArchive,
    savingPostId: archiveSavingPostId,
    session,
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
    onOpenStarProfile: handleOpenStarProfile,
    session,
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
    onCancelEdit: handleCancelStarLetterEdit,
    onDelete: handleStarLetterDelete,
    onEditChange: handleStarLetterEditDraftChange,
    onStartEdit: handleStartStarLetterEdit,
    onSubmit: handleStarLetterSubmit,
    onToggle: handleToggleStarLetters,
    onUpdate: handleStarLetterUpdate,
    openPostId: openStarLetterPostId,
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
  const posts = savedPosts;
  const detailPostForScreen =
    detailPostId
      ? detailPost ??
        savedPosts.find((post) => post.id === detailPostId) ??
        ownPosts.find((post) => post.id === detailPostId) ??
        archivedPosts.find((post) => post.id === detailPostId)
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
  const publicStarProfile = {
    error: publicProfileError,
    loading: publicProfileLoading,
    onBack: handleBackFromStarProfile,
    onOpenAvatar: handleOpenAvatarModal,
    onOpenMeteorDetail: handleOpenMeteorDetail,
    onOpenStarProfile: handleOpenStarProfile,
    onShareProfile: handleShareStarProfile,
    posts: publicProfilePosts,
    profile: publicProfile,
    shareError: profileShareError,
    shareMessage: profileShareMessage,
    tags: publicProfileTags,
    username: publicProfileUsername,
  };

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden bg-night-950 pb-28 text-starlight">
      <SkyBackdrop />
      <StardustForeground />

      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[1180px] px-3 py-3 sm:px-4 lg:py-5">
        <AppHeader auth={auth} />

        <TabContent
          activeTab={activeTab}
          auth={auth}
          composer={composer}
          feedback={feedback}
          posts={posts}
          postsError={postsError}
          postsLoading={postsLoading}
          ownPosts={ownPostState}
          profile={profileState}
          archive={archiveState}
          postActions={postActions}
          resonance={resonance}
          notifications={notificationState}
          starLetters={starLetters}
          meteorDetail={meteorDetail}
          publicStarProfile={publicStarProfile}
          route={route}
          onOpenMeteorDetail={handleOpenMeteorDetail}
          onOpenStarProfile={handleOpenStarProfile}
        />
      </div>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      <AvatarPreviewModal avatar={avatarModal} onClose={handleCloseAvatarModal} />
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
  meteorDetail,
  notifications,
  onOpenMeteorDetail,
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
  if (route.name === "meteor") {
    return (
      <MeteorDetailScreen
        archive={archive}
        detail={meteorDetail}
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
        profileRoute={publicStarProfile}
        resonance={resonance}
        starLetters={starLetters}
      />
    );
  }

  if (activeTab === "rconnect") {
    return <RConnectScreen notifications={notifications} />;
  }

  if (activeTab === "post") {
    return <PostScreen composer={composer} />;
  }

  if (activeTab === "archive") {
    return (
      <ArchiveScreen
        archive={archive}
        onOpenMeteorDetail={onOpenMeteorDetail}
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
        ownPosts={ownPosts}
        onOpenMeteorDetail={onOpenMeteorDetail}
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
      postActions={postActions}
      posts={posts}
      postsError={postsError}
      postsLoading={postsLoading}
      onOpenMeteorDetail={onOpenMeteorDetail}
      onOpenStarProfile={onOpenStarProfile}
      resonance={resonance}
      starLetters={starLetters}
    />
  );
}

function ObserveScreen({
  archive,
  onOpenMeteorDetail,
  onOpenStarProfile,
  postActions,
  posts,
  postsError,
  postsLoading,
  resonance,
  starLetters,
}) {
  return (
    <main className="mx-auto min-w-0 max-w-3xl border-x border-white/10">
      <Timeline
        archive={archive}
        onOpenMeteorDetail={onOpenMeteorDetail}
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

function PostScreen({ composer }) {
  return (
    <main className="mx-auto max-w-3xl">
      <section className="glass-panel mb-4 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase text-comet">meteor letter</p>
        <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">流星便投稿</h2>
        <p className="mt-2 text-sm leading-7 text-slate-400">
          今夜、観測してほしい未完成の光を放流します。
        </p>
      </section>

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

function MeteorDetailScreen({ archive, detail, onOpenStarProfile, postActions, resonance, starLetters }) {
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

function PublicStarProfileScreen({ archive, profileRoute, resonance, starLetters }) {
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
              <AvatarFrame avatar={avatar} avatarUrl={profile.avatar_url} className="h-16 w-16 rounded-3xl text-xl" />
            </button>
          ) : (
            <AvatarFrame avatar={avatar} avatarUrl={profile.avatar_url} className="h-16 w-16 rounded-3xl text-xl" />
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
          <p className="text-xs font-black text-comet">わたしの星座</p>
          <h2 className="mt-1 text-lg font-black text-white">{displayName}</h2>
          <p className="text-sm text-slate-400">{username}</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">{bio}</p>
          {profile.constellation_note && (
            <div className="mt-3 rounded-2xl border border-comet/20 bg-comet/10 px-3 py-2">
              <p className="text-[11px] font-black text-comet">星座メモ</p>
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

function RConnectScreen({ notifications }) {
  return (
    <main className="mx-auto max-w-3xl">
      <section className="glass-panel p-5 sm:p-6">
        <p className="text-xs font-bold normal-case text-comet">R.Connect</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">R.Connect</h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">共鳴・星文・観測通知がここに届きます。</p>

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

function NotificationCard({ notification, onMarkRead, onOpenMeteorDetail, onOpenStarProfile, updating }) {
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
            <AvatarFrame avatar={avatar} avatarUrl={actorProfile?.avatar_url} className="h-10 w-10 rounded-2xl text-sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-white">{actorName}</span>
              <span className="block truncate text-xs text-slate-500">@{actorUsername}</span>
            </span>
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <AvatarFrame avatar={avatar} avatarUrl={actorProfile?.avatar_url} className="h-10 w-10 rounded-2xl text-sm" />
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
            onClick={() => onOpenMeteorDetail(notification.post_id)}
            type="button"
          >
            流星便を見る
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
  onOpenMeteorDetail,
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

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <ProfileCard profile={profile} />
      <OwnPostsPanel
        archive={archive}
        onOpenMeteorDetail={onOpenMeteorDetail}
        onOpenStarProfile={onOpenStarProfile}
        ownPosts={ownPosts}
        postActions={postActions}
        resonance={resonance}
        starLetters={starLetters}
      />
    </main>
  );
}

function OwnPostsPanel({ archive, onOpenMeteorDetail, onOpenStarProfile, ownPosts, postActions, resonance, starLetters }) {
  if (!ownPosts.session) {
    return null;
  }

  return (
    <Panel title="わたしの流星便" eyebrow="my meteor letters">
      {postActions?.message || postActions?.error ? (
        <p
          className={`mb-3 rounded-2xl border px-4 py-3 text-xs leading-5 ${
            postActions.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {postActions.error || postActions.message}
        </p>
      ) : null}

      {ownPosts.loading || ownPosts.error ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
            ownPosts.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {ownPosts.error || "わたしの流星便を読み込み中..."}
        </p>
      ) : ownPosts.items.length === 0 ? (
        <p className="text-sm leading-7 text-slate-400">
          まだ流星便はありません。中央の＋から最初の流星便を放流できます。
        </p>
      ) : (
        <div className="space-y-5">
          {ownPosts.items.map((post) => (
            <PostCard
              archive={archive}
              key={post.id ?? post.handle}
              onOpenAuthorProfile={onOpenStarProfile}
              onOpenDetail={onOpenMeteorDetail}
              postActions={postActions}
              post={post}
              resonance={resonance}
              starLetters={starLetters}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function ArchiveScreen({ archive, onOpenMeteorDetail, onOpenStarProfile, postActions, resonance, starLetters }) {
  return (
    <main className="mx-auto max-w-3xl">
      <section className="glass-panel mb-4 p-5 sm:p-6">
        <p className="text-xs font-bold normal-case text-comet">Archive</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Archive</h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          自分の星空に残しておきたい流星便を集めます。
        </p>
      </section>

      {!archive.session ? (
        <section className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
          ログインすると、Archiveした流星便を確認できます。
        </section>
      ) : (
        <section className="space-y-5 px-3 pb-10 sm:px-5">
          {(archive.loading || archive.error || archive.message) && (
            <p
              className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
                archive.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
              }`}
            >
              {archive.error || archive.message || "Archiveを読み込み中..."}
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

          {!archive.loading && !archive.error && archive.items.length === 0 ? (
            <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
              まだArchiveされた流星便はありません。
            </div>
          ) : (
            archive.items.map((post) => (
              <PostCard
                archive={archive}
                key={post.archiveId ?? post.id}
                onOpenAuthorProfile={onOpenStarProfile}
                onOpenDetail={onOpenMeteorDetail}
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
            今できること、未実装のこと、テストで見てほしい場所を確認できます。
          </span>
        </button>
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
  const availableItems = [
    "会員登録 / ログイン",
    "プロフィール作成 / 編集",
    "流星便投稿",
    "流星便編集 / 削除",
    "流星便の詳細ページ表示",
    "流星便URL共有",
    "共鳴",
    "Archive保存 / 解除",
    "星文投稿",
    "星文編集 / 削除",
    "R.Connect通知",
    "共鳴 / Archive通知設定",
    "星の目安箱からフィードバック送信",
  ];
  const plannedItems = [
    "星空ちあAI住人の自動観測",
    "AI住人からの星文",
    "星文通知",
    "プロフィール単体URL / アカウント共有",
    "プロフィール画像アップロード",
    "画像 / 音声 / 動画投稿",
    "YouTube URL埋め込み再生",
    "Sunoリンクカード表示",
    "Push通知",
    "リアルタイム通知",
    "リポスト / 再放流",
    "星空広場 / ゲーム広場",
    "占い舘",
    "管理者用の目安箱一覧",
    "スマホアプリ化",
  ];
  const betaTestItems = [
    "登録やログインで迷わないか",
    "プロフィール作成が分かりやすいか",
    "流星便を投稿しやすいか",
    "共鳴 / Archive / 星文の意味が伝わるか",
    "通知が分かりやすいか",
    "画面が重くないか",
    "スマホで使いにくい場所がないか",
    "ほしい機能や不安な点がないか",
  ];

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

        <GuideSection title="星空Villageとは">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>星空Villageは、AI時代にもう一度SNSをやさしく作り直すための、小さな星空の街です。</p>
            <p>ここでは、投稿は「流星便」、いいねは「共鳴」、コメントは「星文」、保存は「Archive」と呼びます。</p>
            <p>
              誰にも見つからないまま流れていく想いや作品を、AI住人や他のユーザーが観測し、残し、言葉を届ける場所を目指しています。
            </p>
          </div>
        </GuideSection>

        <GuideSection title="今できること">
          <GuideList items={availableItems} />
        </GuideSection>

        <GuideSection title="まだ未実装のこと">
          <GuideList items={plannedItems} />
        </GuideSection>

        <GuideSection title="ベータテストで試してほしいこと">
          <GuideList items={betaTestItems} />
        </GuideSection>

        <GuideSection title="不具合・要望の送り方">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>気づいたこと、不具合、ほしい機能、分かりにくかった場所があれば、設定画面の「星の目安箱」から送ってください。</p>
            <p>あなたの声は、星空Villageを育てるための大切な星文です。</p>
          </div>
        </GuideSection>

        <div className="rounded-2xl border border-sakura/20 bg-sakura/10 px-4 py-4 text-xs leading-6 text-slate-300">
          現在の星空Villageは開発中の先行テスト版です。予告なく仕様が変わったり、一部機能が不安定な場合があります。
          <br />
          大切な文章や作品は、念のため自分の手元にも保存しておいてください。
        </div>

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
        <li className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2" key={item}>
          {item}
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
  const constellationNote = profile.data?.constellation_note;
  const avatar = displayName.trim().charAt(0) || defaultProfileView.avatar;
  const resonanceValue = formatCount(profile.resonanceCount);
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
              <AvatarFrame avatar={avatar} avatarUrl={avatarUrl} className="h-16 w-16 rounded-3xl text-xl" />
            </button>
          ) : (
            <AvatarFrame avatar={avatar} avatarUrl={avatarUrl} className="h-16 w-16 rounded-3xl text-xl" />
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
              <p className="text-[11px] font-black text-comet">わたしの星座</p>
              <p className="mt-1 text-xs leading-5 text-slate-200">{constellationNote}</p>
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <Stat label="観測" value="未集計" />
          <Stat label="観測者" value="未集計" />
          <Stat label="共鳴" value={resonanceValue} />
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
            表示名、星影、わたしの星座を編集できます。
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

function AvatarFrame({ avatar, avatarUrl, className = "h-12 w-12 rounded-2xl text-base" }) {
  const baseClass =
    "grid flex-none place-items-center overflow-hidden border border-white/20 bg-gradient-to-br from-night-800 via-aurora/70 to-sakura/70 font-black text-white shadow-glow";

  if (avatarUrl) {
    return (
      <div className={`${baseClass} ${className}`}>
        <img alt="" className="h-full w-full object-cover" src={avatarUrl} />
      </div>
    );
  }

  return <div className={`${baseClass} ${className}`}>{avatar}</div>;
}

function AvatarCropper({ disabled, imageUrl, offset, onFrameSizeChange, onImageLoad, onOffsetChange, onReset, onZoomChange, zoom }) {
  const frameRef = useRef(null);
  const [dragState, setDragState] = useState(null);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return undefined;
    }

    function updateFrameSize() {
      const rect = frame.getBoundingClientRect();
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
    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl, onFrameSizeChange]);

  function handlePointerDown(event) {
    if (disabled) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
    });
  }

  function handlePointerMove(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    onOffsetChange({
      x: dragState.startOffset.x + event.clientX - dragState.startX,
      y: dragState.startOffset.y + event.clientY - dragState.startY,
    });
  }

  function handlePointerEnd(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragState(null);
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
        className="relative mx-auto mt-4 aspect-square w-full max-w-[260px] touch-none overflow-hidden rounded-3xl border border-comet/30 bg-night-950/70 shadow-[0_0_35px_rgba(125,223,255,0.16)]"
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerEnd}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={frameRef}
        style={{ touchAction: "none" }}
      >
        <div className="absolute inset-0" style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}>
          <img
            alt=""
            className="h-full w-full select-none object-cover"
            draggable={false}
            onLoad={(event) =>
              onImageLoad({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            src={imageUrl}
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/25" />
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

function ProfileEditor({ profile }) {
  const previewUrl = profile.avatarPreviewUrl || profile.form.avatar_url;
  const previewName = profile.form.display_name || defaultProfileView.display_name;
  const previewAvatar = getAvatarText(previewName);

  return (
    <form className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-night-950/35 p-3" onSubmit={profile.onSubmit}>
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
          <AvatarFrame avatar={previewAvatar} avatarUrl={previewUrl} className="h-16 w-16 rounded-3xl text-xl" />
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
        {profile.avatarPreviewUrl ? (
          <AvatarCropper
            disabled={profile.loading || profile.saving || profile.avatarUploading}
            imageUrl={profile.avatarPreviewUrl}
            offset={profile.avatarCropOffset}
            onFrameSizeChange={profile.onAvatarCropFrameSizeChange}
            onImageLoad={profile.onAvatarCropImageLoad}
            onOffsetChange={profile.onAvatarCropOffsetChange}
            onReset={profile.onAvatarCropReset}
            onZoomChange={profile.onAvatarCropZoomChange}
            zoom={profile.avatarCropZoom}
          />
        ) : null}
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
        わたしの星座
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

function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav
      aria-label="星空Village bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5"
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
                className={buttonClass}
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

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M6 16 11 8l4 5 3-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M6 16h.01M11 8h.01M15 13h.01M18 7h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function AuthPanel({ auth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSignUp = mode === "signup";
  const userEmail = auth.session?.user?.email;

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSignUp) {
      await auth.onSignUp(email, password);
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

          <button
            className="min-h-10 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={auth.loading}
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
    </section>
  );
}

function LinkedText({ children }) {
  const text = String(children ?? "");
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;
    const trailingText = matchedText.match(/[.,!?;:)\]}、。！？）」』】]+$/)?.[0] ?? "";
    const urlText = getCleanMatchedUrl(matchedText);
    const safeUrl = getSafeLinkUrl(urlText);

    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    if (safeUrl) {
      parts.push(
        <a
          className="break-all text-comet underline decoration-comet/50 underline-offset-4 transition hover:text-aurora hover:decoration-aurora"
          href={safeUrl}
          key={`${matchIndex}-${urlText}`}
          onClick={(event) => event.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          {urlText}
        </a>,
      );

      if (trailingText) {
        parts.push(trailingText);
      }
    } else {
      parts.push(matchedText);
    }

    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

function YouTubeEmbed({ videoId }) {
  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return null;
  }

  return (
    <div
      className="mt-4 aspect-video overflow-hidden rounded-2xl border border-comet/20 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.28)]"
      data-card-action="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="YouTube video player"
      />
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

function Timeline({
  archive,
  onOpenMeteorDetail,
  onOpenStarProfile,
  postActions,
  posts,
  postsError,
  postsLoading,
  resonance,
  starLetters,
}) {
  return (
    <section className="mx-auto max-w-3xl">
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

      <div className="space-y-5 px-3 pb-10 pt-4 sm:px-5">
        {!postsLoading && !postsError && posts.length === 0 ? (
          <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            まだ流星便はありません。最初の光を放流してみましょう。
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              archive={archive}
              key={post.id ?? post.handle}
              onOpenAuthorProfile={onOpenStarProfile}
              onOpenDetail={onOpenMeteorDetail}
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

function Composer({ composer }) {
  const helperText = !composer.canPost
    ? "ログインすると流星便を放流できます。"
    : !composer.hasProfile
      ? "先にプロフィールを保存すると流星便を放流できます。"
      : "テキスト流星便を公開で放流します。";
  const canSubmit = composer.canPost && composer.hasProfile && composer.draft.trim() && !composer.saving;

  return (
    <form className="border-b border-white/10 px-3 py-4 sm:px-5" onSubmit={composer.onSubmit}>
      <div className="glass-panel p-4">
        <div className="flex gap-3">
          <div className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-gradient-to-br from-comet/70 to-aurora/80 font-black">
            創
          </div>
          <div className="min-w-0 flex-1">
            <textarea
              className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-night-950/50 p-4 text-sm leading-7 text-white outline-none placeholder:text-slate-500 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
              disabled={!composer.canPost || !composer.hasProfile || composer.saving}
              maxLength={160}
              onChange={(event) => composer.onChange(event.target.value)}
              placeholder="今夜、どの星を観測してほしい？"
              value={composer.draft}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-full bg-white/10 px-3 py-1">{helperText}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">星文メモ</span>
              </div>
              <button
                className="min-h-10 rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-5 text-sm font-black text-night-950 shadow-glow transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSubmit}
                type="submit"
              >
                {composer.saving ? "放流中..." : "流星便を放流する"}
              </button>
            </div>
            {(composer.message || composer.error) && (
              <p
                className={`mt-3 rounded-2xl border px-3 py-2 text-xs leading-5 ${
                  composer.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
                }`}
              >
                {composer.error || composer.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function PostCard({
  archive,
  detailMode = false,
  onOpenAuthorProfile,
  onOpenDetail,
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
  const youtubeVideoId = !isPostEditing ? findFirstYouTubeVideoId(post.text) : null;
  const isPostUpdating = postActions?.updatingId === post.id;
  const isPostDeleting = postActions?.deletingId === post.id;
  const canSavePostEdit = Boolean(postEditDraft.trim()) && !isPostEditOverLimit && !isPostUpdating;
  const postStarLetters = starLetters?.itemsByPostId?.[post.id] ?? [];
  const isStarLettersOpen = showStarLetters || starLetters?.openPostId === post.id;
  const isStarLetterSaving = starLetters?.savingPostId === post.id;
  const sunoUrl = !isPostEditing ? findFirstSunoUrl(post.text) : null;
  const resonanceLabel = `${resonanceCount} 共鳴`;
  const starLetterLabel = `星文 ${postStarLetters.length}`;
  const canOpenDetail = Boolean(onOpenDetail && post.id && !detailMode);
  const authorUsername = post.authorUsername;
  const canOpenAuthorProfile = Boolean(onOpenAuthorProfile && authorUsername);

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

  return (
    <article
      aria-label={canOpenDetail ? `${post.name}の流星便を開く` : undefined}
      className={`glass-panel post-card-panel group overflow-hidden ${
        canOpenDetail ? "is-clickable" : ""
      }`}
      onClick={handleOpenDetail}
      onKeyDown={handleOpenDetailKeyDown}
      role={canOpenDetail ? "link" : undefined}
      tabIndex={canOpenDetail ? 0 : undefined}
    >
      <div className={`h-1 bg-gradient-to-r ${post.glow}`} />
      <div className="p-4 sm:p-5">
        <div className="flex gap-3">
          {canOpenAuthorProfile ? (
            <button
              aria-label={`${post.name}の星座を開く`}
              className="flex-none rounded-2xl outline-none transition hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-comet/25"
              data-card-action="true"
              onClick={handleOpenAuthorProfile}
              type="button"
            >
              <AvatarFrame avatar={post.avatar} avatarUrl={post.avatarUrl} />
            </button>
          ) : (
            <AvatarFrame avatar={post.avatar} avatarUrl={post.avatarUrl} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {canOpenAuthorProfile ? (
                <button
                  className="font-black text-white transition hover:text-comet focus-visible:rounded focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-comet/20"
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
            {post.archivedTime && (
              <p className="mt-2 text-[11px] font-bold text-comet/80">Archive: {post.archivedTime}</p>
            )}
            {isPostEditing ? (
              <form
                className="mt-3 rounded-2xl border border-white/10 bg-night-950/45 p-3"
                data-card-action="true"
                onSubmit={(event) => postActions?.onUpdate?.(event, post)}
              >
                <textarea
                  className="min-h-28 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 p-3 text-sm leading-7 text-white outline-none placeholder:text-slate-500 focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPostUpdating}
                  maxLength={POST_MAX_LENGTH + 1}
                  onChange={(event) => postActions?.onEditChange?.(post.id, event.target.value)}
                  placeholder="流星便の本文を編集する"
                  value={postEditDraft}
                />
                {isPostEditOverLimit && (
                  <p className="mt-2 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
                    流星便は500文字以内で放流してください
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
                <p className={`${detailMode ? "text-base sm:text-lg" : "text-[15px]"} mt-3 whitespace-pre-wrap leading-8 text-slate-100`}>
                  <LinkedText>{post.text}</LinkedText>
                </p>
                <YouTubeEmbed videoId={youtubeVideoId} />
                <SunoLinkCard url={sunoUrl} />
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
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
                onChange={(value) => starLetters?.onChange?.(post.id, value)}
                onSubmit={(event) => starLetters?.onSubmit?.(event, post.id)}
                saving={isStarLetterSaving}
                starLetters={starLetters}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function StarLettersPanel({ draft, letters, loading, onChange, onSubmit, saving, starLetters }) {
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
        <p
          className={`mb-3 rounded-2xl border px-3 py-2 text-xs leading-5 ${
            starLetters.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {starLetters.error || starLetters.message}
        </p>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-xs leading-6 text-slate-400">星文を読み込み中...</p>
        ) : letters.length === 0 ? (
          <p className="text-xs leading-6 text-slate-500">まだ星文はありません。</p>
        ) : (
          letters.map((letter) => <StarLetterItem key={letter.id} letter={letter} starLetters={starLetters} />)
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
  const editDraft = starLetters?.editDrafts?.[letter.id] ?? letter.body;
  const editTrimmedLength = getTrimmedCharacterLength(editDraft);
  const isEditOverLimit = editTrimmedLength > STAR_LETTER_MAX_LENGTH;
  const canSaveEdit = Boolean(editDraft.trim()) && !isEditOverLimit && starLetters?.updatingId !== letter.id;
  const isDeleting = starLetters?.deletingId === letter.id;

  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <div className="flex gap-3">
        <AvatarFrame avatar={letter.avatar} avatarUrl={letter.avatarUrl} className="h-9 w-9 rounded-2xl text-xs" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-black text-white">{letter.name}</span>
            <span className="text-xs text-slate-500">{letter.handle}</span>
            <span className="text-xs text-slate-500">· {letter.time}</span>
          </div>
          {isEditing ? (
            <form className="mt-3" onSubmit={(event) => starLetters?.onUpdate?.(event, letter)}>
              <textarea
                className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-night-950/70 p-3 text-sm leading-7 text-white outline-none placeholder:text-slate-500 focus:border-comet/40 focus:ring-4 focus:ring-comet/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={starLetters?.updatingId === letter.id}
                onChange={(event) => starLetters?.onEditChange?.(letter.id, event.target.value)}
                value={editDraft}
              />
              {isEditOverLimit && (
                <p className="mt-2 rounded-2xl border border-sakura/30 bg-sakura/10 px-3 py-2 text-xs leading-5 text-sakura">
                  星文は500文字以内で送ってください
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-slate-500">
                  <span className={isEditOverLimit ? "font-black text-sakura" : "text-slate-600"}>
                    {editTrimmedLength}/{STAR_LETTER_MAX_LENGTH}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={starLetters?.updatingId === letter.id}
                    onClick={() => starLetters?.onCancelEdit?.(letter.id)}
                    type="button"
                  >
                    キャンセル
                  </button>
                  <button
                    className="min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canSaveEdit}
                    type="submit"
                  >
                    {starLetters?.updatingId === letter.id ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                <LinkedText>{letter.body}</LinkedText>
              </p>
              {isOwner && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={`min-h-8 rounded-full border px-3 text-[11px] font-black transition ${getActionButtonTone("edit")}`}
                    onClick={() => starLetters?.onStartEdit?.(letter)}
                    type="button"
                  >
                    編集
                  </button>
                  <button
                    className={`min-h-8 rounded-full border px-3 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${getActionButtonTone("danger")}`}
                    disabled={isDeleting}
                    onClick={() => starLetters?.onDelete?.(letter)}
                    type="button"
                  >
                    {isDeleting ? "削除中..." : "削除"}
                  </button>
                </div>
              )}
            </>
          )}
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

function ActionButton({ active = false, disabled = false, icon, label, onClick, variant = "default" }) {
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
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      <span className="text-comet">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-black text-white">{value}</p>
    </div>
  );
}

export default App;

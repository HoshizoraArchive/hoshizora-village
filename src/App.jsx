import { useEffect, useState } from "react";
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
const FEEDBACK_TYPES = ["不具合", "分かりにくい", "改善案", "ほしい機能", "感想", "その他"];

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

function getRouteFromLocation() {
  const match = window.location.pathname.match(/^\/meteor\/([^/?#]+)\/?$/);

  if (match?.[1]) {
    return {
      name: "meteor",
      postId: decodeURIComponent(match[1]),
    };
  }

  return {
    name: "home",
    postId: null,
  };
}

function buildMeteorPath(postId) {
  return `/meteor/${encodeURIComponent(postId)}`;
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
    return `${actorName}さんがあなたに星文を送りました。`;
  }

  return notification.message;
}

function mapSavedPost(post, authorProfile) {
  const displayName = authorProfile?.display_name || defaultProfileView.display_name;
  const username = authorProfile?.username ? `@${authorProfile.username}` : "@starry_creator";

  return {
    id: post.id,
    authorId: post.author_id,
    name: displayName,
    handle: username,
    badge: "流星便",
    avatar: getAvatarText(displayName),
    avatarUrl: authorProfile?.avatar_url ?? null,
    time: formatPostTime(post.created_at),
    text: post.body,
    tags: ["#流星便", "#観測待ち"],
    resonanceCount: 0,
    comments: "未集計",
    glow: "from-comet/25 to-sakura/20",
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
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
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
  const postIdsKey = savedPosts.map((post) => post.id).filter(Boolean).join("|");
  const ownPostIdsKey = ownPosts.map((post) => post.id).filter(Boolean).join("|");
  const archivedPostIdsKey = archivedPosts.map((post) => post.id).filter(Boolean).join("|");
  const allPostIdsKey = [
    ...new Set(
      [...savedPosts, ...ownPosts, ...archivedPosts, detailPost]
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
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

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

    const existingPost =
      savedPosts.find((post) => post.id === detailPostId) ??
      ownPosts.find((post) => post.id === detailPostId) ??
      archivedPosts.find((post) => post.id === detailPostId);

    if (existingPost) {
      setDetailPost(existingPost);
      setDetailPostLoading(false);
      setDetailPostError("");
      return () => {
        isMounted = false;
      };
    }

    async function readDetailPost() {
      setDetailPostLoading(true);
      setDetailPostError("");

      const { data: post, error } = await supabase
        .from("posts")
        .select("id, author_id, type, body, visibility, created_at")
        .eq("id", detailPostId)
        .eq("type", "text")
        .maybeSingle();

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
        setDetailPostError("流星便が見つかりませんでした。");
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
  }, [detailPostId, savedPosts, ownPosts, archivedPosts]);

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

      const { data, error } = await supabase
        .from("posts")
        .select("id, author_id, type, body, visibility, created_at")
        .eq("author_id", userId)
        .eq("type", "text")
        .order("created_at", { ascending: false })
        .limit(30);

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

      const { data: postRows, error: postsError } = await supabase
        .from("posts")
        .select("id, author_id, type, body, visibility, created_at")
        .in("id", postIds)
        .eq("type", "text");

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
      const { data: ownPostRows, error: ownPostsError } = await supabase
        .from("posts")
        .select("id")
        .eq("author_id", userId);

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
          .select("id, display_name, username")
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

      const { data, error } = await supabase
        .from("posts")
        .select("id, author_id, type, body, visibility, created_at")
        .eq("visibility", "public")
        .eq("type", "text")
        .order("created_at", { ascending: false })
        .limit(20);

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

  function handleStartProfileEdit() {
    setProfileForm(
      profile ? profileFormFromRecord(profile) : { ...emptyProfileForm, display_name: defaultProfileView.display_name },
    );
    setProfileMessage("");
    setProfileError("");
    setProfileScreenMode("edit");
  }

  function handleCancelProfileEdit() {
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

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: session.user.id,
          display_name: displayName,
          username: optionalUsername(profileForm.username),
          avatar_url: optionalText(profileForm.avatar_url),
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
    setProfileMessage("プロフィールを保存しました。");
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

    setRoute({ name: "meteor", postId });
    setShareMessage("");
    setShareError("");
    setOpenStarLetterPostId(postId);
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
    setRoute({ name: "home", postId: null });
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

  function handleTabChange(tabId) {
    if (route.name === "meteor") {
      window.history.pushState({}, "", "/");
      setRoute({ name: "home", postId: null });
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
    form: profileForm,
    loading: profileLoading,
    message: profileMessage,
    onArchiveNotificationSettingSubmit: handleArchiveNotificationSettingSubmit,
    onChange: handleProfileFieldChange,
    onBackToProfile: handleBackToProfile,
    onCancelEdit: handleCancelProfileEdit,
    onOpenFeedback: handleOpenFeedback,
    onOpenSettings: handleOpenProfileSettings,
    onResonanceNotificationSettingSubmit: handleResonanceNotificationSettingSubmit,
    onStartEdit: handleStartProfileEdit,
    onSubmit: handleProfileSubmit,
    resonanceCount: profileResonanceCount,
    saving: profileSaving,
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
  const notificationState = {
    error: notificationsError,
    items: notifications,
    loading: notificationsLoading,
    message: notificationsMessage,
    onMarkRead: handleMarkNotificationRead,
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
      ? savedPosts.find((post) => post.id === detailPostId) ??
        ownPosts.find((post) => post.id === detailPostId) ??
        archivedPosts.find((post) => post.id === detailPostId) ??
        detailPost
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
          resonance={resonance}
          notifications={notificationState}
          starLetters={starLetters}
          meteorDetail={meteorDetail}
          route={route}
          onOpenMeteorDetail={handleOpenMeteorDetail}
        />
      </div>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
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
  ownPosts,
  posts,
  postsError,
  postsLoading,
  profile,
  resonance,
  route,
  starLetters,
}) {
  if (route.name === "meteor") {
    return (
      <MeteorDetailScreen
        archive={archive}
        detail={meteorDetail}
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
        profile={profile}
        resonance={resonance}
        starLetters={starLetters}
      />
    );
  }

  return (
    <ObserveScreen
      archive={archive}
      posts={posts}
      postsError={postsError}
      postsLoading={postsLoading}
      onOpenMeteorDetail={onOpenMeteorDetail}
      resonance={resonance}
      starLetters={starLetters}
    />
  );
}

function ObserveScreen({ archive, onOpenMeteorDetail, posts, postsError, postsLoading, resonance, starLetters }) {
  return (
    <main className="mx-auto min-w-0 max-w-3xl border-x border-white/10">
      <Timeline
        archive={archive}
        onOpenMeteorDetail={onOpenMeteorDetail}
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

function MeteorDetailScreen({ archive, detail, resonance, starLetters }) {
  const post = detail.post;

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

        {!detail.loading && !detail.error && !post ? (
          <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            流星便が見つかりませんでした。
          </div>
        ) : null}

        {post ? (
          <PostCard
            archive={archive}
            detailMode
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

function NotificationCard({ notification, onMarkRead, updating }) {
  const isUnread = !notification.is_read;

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

      <p className="mt-3 text-sm leading-7 text-slate-100">{formatNotificationMessage(notification)}</p>
      <p className="mt-2 text-[11px] font-bold text-slate-500">type: {notification.type}</p>

      {isUnread && (
        <button
          className="mt-4 min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={updating}
          onClick={() => onMarkRead(notification.id)}
          type="button"
        >
          {updating ? "更新中..." : "既読にする"}
        </button>
      )}
    </article>
  );
}

function ProfileScreen({ archive, auth, feedback, onOpenMeteorDetail, ownPosts, profile, resonance, starLetters }) {
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

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <ProfileCard profile={profile} />
      <OwnPostsPanel
        archive={archive}
        onOpenMeteorDetail={onOpenMeteorDetail}
        ownPosts={ownPosts}
        resonance={resonance}
        starLetters={starLetters}
      />
    </main>
  );
}

function OwnPostsPanel({ archive, onOpenMeteorDetail, ownPosts, resonance, starLetters }) {
  if (!ownPosts.session) {
    return null;
  }

  return (
    <Panel title="わたしの流星便" eyebrow="my meteor letters">
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
              onOpenDetail={onOpenMeteorDetail}
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

function ArchiveScreen({ archive, onOpenMeteorDetail, resonance, starLetters }) {
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

          {!archive.loading && !archive.error && archive.items.length === 0 ? (
            <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
              まだArchiveされた流星便はありません。
            </div>
          ) : (
            archive.items.map((post) => (
              <PostCard
                archive={archive}
                key={post.archiveId ?? post.id}
                onOpenDetail={onOpenMeteorDetail}
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

  return (
    <section className="glass-panel overflow-hidden">
      <div className="h-20 bg-[radial-gradient(circle_at_24%_30%,rgba(125,223,255,0.55),transparent_28%),linear-gradient(120deg,rgba(159,140,255,0.36),rgba(255,139,207,0.18))]" />
      <div className="p-4 pt-0">
        <div className="-mt-7 flex items-end justify-between gap-3">
          <AvatarFrame avatar={avatar} avatarUrl={avatarUrl} className="h-16 w-16 rounded-3xl text-xl" />
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

        {(profile.message || profile.error) && (
          <p
            className={`mt-4 rounded-2xl border px-3 py-2 text-xs leading-5 ${
              profile.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
            }`}
          >
            {profile.error || profile.message}
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
            表示名、アイコン画像URL、わたしの星座を編集できます。
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

function ProfileEditor({ profile }) {
  return (
    <form className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-night-950/35 p-3" onSubmit={profile.onSubmit}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-comet">プロフィール編集</p>
        {profile.loading && <span className="text-[11px] font-bold text-slate-500">読み込み中...</span>}
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

      <label className="block text-xs font-bold text-slate-400">
        アイコン画像URL
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
          disabled={profile.loading || profile.saving}
          type="submit"
        >
          {profile.saving ? "保存中..." : "保存する"}
        </button>
        <button
          className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={profile.saving}
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

function Timeline({ archive, onOpenMeteorDetail, posts, postsError, postsLoading, resonance, starLetters }) {
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
              onOpenDetail={onOpenMeteorDetail}
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

function PostCard({ archive, detailMode = false, onOpenDetail, post, resonance, showStarLetters = false, starLetters }) {
  const resonanceCount = Number.isFinite(post.resonanceCount) ? post.resonanceCount : 0;
  const isResonanceSaving = resonance?.savingPostId === post.id;
  const isArchiveSaving = archive?.savingPostId === post.id;
  const isArchived = archive?.archivedPostIds?.includes(post.id);
  const postStarLetters = starLetters?.itemsByPostId?.[post.id] ?? [];
  const isStarLettersOpen = showStarLetters || starLetters?.openPostId === post.id;
  const isStarLetterSaving = starLetters?.savingPostId === post.id;
  const resonanceLabel = `${resonanceCount} 共鳴`;
  const starLetterLabel = `星文 ${postStarLetters.length}`;
  const canOpenDetail = Boolean(onOpenDetail && post.id && !detailMode);

  function isCardActionTarget(target) {
    return Boolean(
      target?.closest?.("button, a, input, textarea, select, label, [data-card-action='true']"),
    );
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
          <AvatarFrame avatar={post.avatar} avatarUrl={post.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-black text-white">{post.name}</h3>
              <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-0.5 text-[11px] font-bold text-comet">
                {post.badge}
              </span>
              <span className="text-sm text-slate-500">{post.handle}</span>
              <span className="text-sm text-slate-500">· {post.time}</span>
            </div>
            {post.archivedTime && (
              <p className="mt-2 text-[11px] font-bold text-comet/80">Archive: {post.archivedTime}</p>
            )}
            <p className={`${detailMode ? "text-base sm:text-lg" : "text-[15px]"} mt-3 leading-8 text-slate-100`}>
              {post.text}
            </p>
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
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{letter.body}</p>
              {isOwner && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="min-h-8 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
                    onClick={() => starLetters?.onStartEdit?.(letter)}
                    type="button"
                  >
                    編集
                  </button>
                  <button
                    className="min-h-8 rounded-full border border-sakura/30 bg-sakura/10 px-3 text-[11px] font-black text-sakura transition hover:bg-sakura/15 disabled:cursor-not-allowed disabled:opacity-60"
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

function ActionButton({ active = false, disabled = false, icon, label, onClick }) {
  function handleClick(event) {
    event.stopPropagation();
    onClick?.(event);
  }

  return (
    <button
      className={`flex min-h-9 items-center gap-2 rounded-full border px-3 transition disabled:cursor-not-allowed disabled:opacity-70 ${
        active
          ? "border-comet/40 bg-comet/15 text-white"
          : "border-white/10 bg-white/5 hover:border-comet/30 hover:bg-comet/10 hover:text-white"
      }`}
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

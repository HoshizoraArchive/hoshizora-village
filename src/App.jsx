import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const bottomNavItems = [
  { id: "observe", label: "観測", icon: "telescope" },
  { id: "rconnect", label: "R.Connect", icon: "bell" },
  { id: "post", label: "流星便投稿", icon: "plus", primary: true },
  { id: "archive", label: "Archive", icon: "bookmark" },
  { id: "profile", label: "わたしの星座", icon: "constellation" },
];

const emptyProfileForm = {
  display_name: "",
  username: "",
  avatar_url: "",
  bio: "",
  constellation_note: "",
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

function App() {
  const [activeTab, setActiveTab] = useState("observe");
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
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [postSaving, setPostSaving] = useState(false);
  const [postMessage, setPostMessage] = useState("");
  const [postError, setPostError] = useState("");
  const [resonanceSavingPostId, setResonanceSavingPostId] = useState(null);
  const [resonanceMessage, setResonanceMessage] = useState("");
  const [resonanceError, setResonanceError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsMessage, setNotificationsMessage] = useState("");
  const [notificationUpdatingId, setNotificationUpdatingId] = useState(null);
  const postIdsKey = savedPosts.map((post) => post.id).filter(Boolean).join("|");

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

      setProfile(data);
      setProfileForm(data ? profileFormFromRecord(data) : { ...emptyProfileForm, display_name: defaultProfileView.display_name });
    }

    readProfile();

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

      setNotifications(data ?? []);
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

    setProfile(data);
    setProfileForm(profileFormFromRecord(data));
    setProfileMessage("プロフィールを保存しました。");
    setProfileScreenMode("view");
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

    const targetPost = savedPosts.find((post) => post.id === postId);

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
    setResonanceMessage("共鳴を記録しました。");
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

  function handleTabChange(tabId) {
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
    onChange: handleProfileFieldChange,
    onBackToProfile: handleBackToProfile,
    onCancelEdit: handleCancelProfileEdit,
    onOpenSettings: handleOpenProfileSettings,
    onStartEdit: handleStartProfileEdit,
    onSubmit: handleProfileSubmit,
    resonanceCount: profileResonanceCount,
    saving: profileSaving,
    profileScreenMode,
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
  const notificationState = {
    error: notificationsError,
    items: notifications,
    loading: notificationsLoading,
    message: notificationsMessage,
    onMarkRead: handleMarkNotificationRead,
    session,
    updatingId: notificationUpdatingId,
  };
  const posts = savedPosts;

  return (
    <div className="min-h-screen overflow-x-hidden bg-night-950 pb-28 text-starlight">
      <SkyBackdrop />
      <StardustForeground />

      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-3 sm:px-4 lg:py-5">
        <AppHeader auth={auth} />

        <TabContent
          activeTab={activeTab}
          auth={auth}
          composer={composer}
          posts={posts}
          postsError={postsError}
          postsLoading={postsLoading}
          profile={profileState}
          resonance={resonance}
          notifications={notificationState}
        />
      </div>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

function SkyBackdrop() {
  return (
    <div className="hoshizora-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="cosmic-haze" />
      <div className="moon-crescent" />
      <div className="stars-layer" />
      <div className="distant-stars" />
      <div className="shooting-star shooting-star-a" />
      <div className="shooting-star shooting-star-b" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(to_top,rgba(3,5,17,0.96),transparent)]" />
      <div className="village-horizon">
        <span className="village-window village-window-a" />
        <span className="village-window village-window-b" />
        <span className="village-window village-window-c" />
        <span className="village-window village-window-d" />
        <span className="village-window village-window-e" />
      </div>
      <div className="city-grid absolute inset-x-0 bottom-0 h-44 opacity-45" />
    </div>
  );
}

function StardustForeground() {
  return <div className="foreground-stardust pointer-events-none fixed inset-0 z-20" aria-hidden="true" />;
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
  auth,
  composer,
  notifications,
  posts,
  postsError,
  postsLoading,
  profile,
  resonance,
}) {
  if (activeTab === "rconnect") {
    return <RConnectScreen notifications={notifications} />;
  }

  if (activeTab === "post") {
    return <PostScreen composer={composer} />;
  }

  if (activeTab === "archive") {
    return (
      <PlaceholderScreen
        eyebrow="private archive"
        title="Archive"
        text="保存した流星便がここに集まります。"
        note="Archive機能は今後実装予定です。"
      />
    );
  }

  if (activeTab === "profile") {
    return <ProfileScreen auth={auth} profile={profile} />;
  }

  return <ObserveScreen posts={posts} postsError={postsError} postsLoading={postsLoading} resonance={resonance} />;
}

function ObserveScreen({ posts, postsError, postsLoading, resonance }) {
  return (
    <main className="mx-auto min-w-0 max-w-3xl border-x border-white/10">
      <Timeline posts={posts} postsError={postsError} postsLoading={postsLoading} resonance={resonance} />
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

      <p className="mt-3 text-sm leading-7 text-slate-100">{notification.message}</p>
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

function ProfileScreen({ auth, profile }) {
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
        <SettingsPanel auth={auth} onBack={profile.onBackToProfile} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl">
      <ProfileCard profile={profile} />
    </main>
  );
}

function SettingsPanel({ auth, onBack }) {
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
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs font-black text-comet">ログイン状態</p>
          <p className="mt-1 text-slate-300">{auth.status}</p>
        </div>
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

function Timeline({ posts, postsError, postsLoading, resonance }) {
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

      <div className="space-y-4 px-3 pb-10 pt-4 sm:px-5">
        {!postsLoading && !postsError && posts.length === 0 ? (
          <div className="glass-panel px-4 py-8 text-center text-sm leading-7 text-slate-400">
            まだ流星便はありません。最初の光を放流してみましょう。
          </div>
        ) : (
          posts.map((post) => <PostCard key={post.id ?? post.handle} post={post} resonance={resonance} />)
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

function PostCard({ post, resonance }) {
  const resonanceCount = Number.isFinite(post.resonanceCount) ? post.resonanceCount : 0;
  const isResonanceSaving = resonance?.savingPostId === post.id;
  const resonanceLabel = `${resonanceCount} 共鳴`;

  return (
    <article className="glass-panel group overflow-hidden">
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
            <p className="mt-3 text-[15px] leading-8 text-slate-100">{post.text}</p>
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
              <ActionButton label={`${post.comments} 星文`} icon="✎" />
              <ActionButton label="Archive" icon="✦" />
            </div>
          </div>
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
  return (
    <button
      className={`flex min-h-9 items-center gap-2 rounded-full border px-3 transition disabled:cursor-not-allowed disabled:opacity-70 ${
        active
          ? "border-comet/40 bg-comet/15 text-white"
          : "border-white/10 bg-white/5 hover:border-comet/30 hover:bg-comet/10 hover:text-white"
      }`}
      disabled={disabled}
      onClick={onClick}
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

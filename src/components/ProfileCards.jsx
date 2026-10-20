// Stateless profile cards, editor and avatar presentation.
import { getPrimaryProfileTitle } from "../profileTitles";
import ProfileTitleBadge from "../ProfileTitleBadge";
import ProfileTitleEmblem from "../ProfileTitleEmblem";
import { AvatarFrame } from "./AvatarFrame";
import { defaultProfileView, getAvatarText } from "../lib/profileUi";

export function PublicProfileCard({ displayName, onOpenAvatar, onShare, profile, tags }) {
  const username = profile.username ? `@${profile.username}` : defaultProfileView.username;
  const bio = profile.bio || defaultProfileView.bio;
  const avatar = getAvatarText(displayName);
  const visibleTags = (tags ?? []).filter((tag) => tag?.label);
  const canOpenAvatar = Boolean(profile.avatar_url);
  const primaryTitle = getPrimaryProfileTitle(profile);

  return (
    <section className="profile-surface overflow-hidden">
      <div className="profile-card-header">
        <div className="h-20 bg-[radial-gradient(circle_at_24%_30%,rgba(125,223,255,0.55),transparent_28%),linear-gradient(120deg,rgba(159,140,255,0.36),rgba(255,139,207,0.18))]" />
        <div className="profile-card-header-actions">
          <button
            className="min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15"
            onClick={onShare}
            type="button"
          >
            共有
          </button>
        </div>
        <ProfileTitleEmblem placement="header" size="profile" title={primaryTitle} />
      </div>
      <div className="p-4 pt-0">
        <div className={`-mt-7 flex items-end${primaryTitle ? " profile-avatar-title-layout" : ""}`}>
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
          {primaryTitle && (
            <div className="profile-avatar-title-plate">
              <ProfileTitleBadge size="profile" title={primaryTitle} />
            </div>
          )}
        </div>
        <div className={primaryTitle ? "mt-1" : "mt-3"}>
          <div className="profile-title-profile-layout">
            <h2 className="mt-1 min-w-0 text-lg font-black text-white">{displayName}</h2>
          </div>
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

export function AvatarPreviewModal({ avatar, onClose }) {
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

export function ProfileCard({ profile }) {
  const displayName = profile.data?.display_name || defaultProfileView.display_name;
  const username = profile.data?.username ? `@${profile.data.username}` : defaultProfileView.username;
  const bio = profile.data?.bio || defaultProfileView.bio;
  const avatarUrl = profile.data?.avatar_url;
  const activeFrame = profile.activeFrame;
  const constellationNote = profile.data?.constellation_note;
  const avatar = displayName.trim().charAt(0) || defaultProfileView.avatar;
  const canShareStarProfile = Boolean(profile.data?.username);
  const canOpenAvatar = Boolean(avatarUrl);
  const primaryTitle = getPrimaryProfileTitle(profile.data);
  const statusMessage = profile.error || profile.shareError || profile.message || profile.shareMessage;

  return (
    <section className="profile-surface overflow-hidden">
      <div className="profile-card-header">
        <div className="h-20 bg-[radial-gradient(circle_at_24%_30%,rgba(125,223,255,0.55),transparent_28%),linear-gradient(120deg,rgba(159,140,255,0.36),rgba(255,139,207,0.18))]" />
        <div className="profile-card-header-actions">
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
        <ProfileTitleEmblem placement="header" size="profile" title={primaryTitle} />
      </div>
      <div className="p-4 pt-0">
        <div className={`-mt-7 flex items-end${primaryTitle ? " profile-avatar-title-layout" : ""}`}>
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
          {primaryTitle && (
            <div className="profile-avatar-title-plate">
              <ProfileTitleBadge size="profile" title={primaryTitle} />
            </div>
          )}
        </div>
        <div className={primaryTitle ? "mt-1" : "mt-3"}>
          <div className="profile-title-profile-layout">
            <h2 className="min-w-0 text-lg font-black text-white">{displayName}</h2>
          </div>
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

export function ProfileEditScreen({ profile }) {
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

export function ProfileEditor({ profile }) {
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

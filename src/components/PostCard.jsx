import { useRef, useState } from "react";
import ProfileTitleBadge from "../ProfileTitleBadge";
import ProfileTitleEmblem from "../ProfileTitleEmblem";
import { canReportContent } from "../contentReports";
import { isTrustedProtectedProfile } from "../profileBlocking";
import { createUploadMovieObservationMedia, createYouTubeMovieObservationMedia } from "../starMovieObservation";
import { buildStarLetterThreadRows } from "../starLetterThread";
import { AvatarFrame } from "./AvatarFrame";
import { PostMediaGrid, SunoLinkCard, YouTubeEmbed } from "./PostMediaViews";
import { LinkedText } from "./LinkedText";
import { MeteorTagTextarea } from "./PostComposer";
import { STAR_LETTER_MAX_LENGTH, POST_MAX_LENGTH, getTrimmedCharacterLength, validateMeteorTagsFromText, findFirstYouTubeVideoId, findFirstSunoUrl } from "../lib/postTextUtils";

function PostCard({
  archive,
  detailMode = false,
  emblemPlacement = "inline",
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
  const [isAuthorMenuOpen, setIsAuthorMenuOpen] = useState(false);
  const authorMenuButtonRef = useRef(null);
  const resonanceCount = Number.isFinite(post.resonanceCount) ? post.resonanceCount : 0;
  const isResonanceSaving = resonance?.savingPostId === post.id;
  const hasViewerResonated = resonance?.resonatedPostIds?.has(post.id) === true;
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
  const hasCornerEmblem = emblemPlacement === "corner" && Boolean(post.primaryTitle?.emblemPath);
  const canUseBlackHole =
    postActions?.blackHole?.available &&
    Boolean(postActions?.session?.user?.id) &&
    !isOwnPost &&
    !isTrustedProtectedProfile(post);
  const canReportPost =
    postActions?.report?.available &&
    canReportContent({
      currentUserId: postActions?.session?.user?.id,
      targetId: post.id,
      targetOwnerId: post.authorId,
    });
  const canShowAuthorMenu = canUseBlackHole || canReportPost;

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
      className={`glass-panel post-card-panel post-card group relative overflow-hidden ${
        canOpenDetail ? "is-clickable" : ""
      }`}
      data-onboarding-target={isOnboardingTargetPost ? "onboarding-archive-post" : undefined}
      onClick={handleOpenDetail}
      onKeyDown={handleOpenDetailKeyDown}
      role={canOpenDetail ? "link" : undefined}
      tabIndex={canOpenDetail ? 0 : undefined}
    >
      <div className={`h-1 bg-gradient-to-r ${post.glow}`} />
      {post.isPinned ? (
        <div className="px-4 pt-3 text-[11px] font-black tracking-[0.08em] text-amber-200 sm:px-5">
          ★ 固定流星便
        </div>
      ) : null}
      {canShowAuthorMenu ? (
        <div className="absolute right-3 top-3 z-20" data-card-action="true">
          <button
            aria-expanded={isAuthorMenuOpen}
            aria-haspopup="menu"
            aria-label={`${post.name}のメニュー`}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-night-950/55 text-lg font-black text-slate-300 transition hover:border-comet/30 hover:bg-night-950/80 hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              setIsAuthorMenuOpen((isOpen) => !isOpen);
            }}
            ref={authorMenuButtonRef}
            type="button"
          >
            …
          </button>
          {isAuthorMenuOpen ? (
            <div
              className="absolute right-0 top-11 w-52 rounded-2xl border border-white/10 bg-night-950/95 p-1.5 shadow-2xl backdrop-blur-xl"
              role="menu"
            >
              {canUseBlackHole ? (
                <button
                  className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-black text-slate-200 transition hover:bg-white/10"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsAuthorMenuOpen(false);
                    postActions.blackHole.onRequest?.({
                      id: post.authorId,
                      displayName: post.name,
                      primaryTitle: post.primaryTitle,
                      username: String(post.handle ?? "").replace(/^@/, ""),
                    });
                  }}
                  role="menuitem"
                  type="button"
                >
                  ブラックホールに送る
                </button>
              ) : null}
              {canReportPost ? (
                <button
                  className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-black text-slate-200 transition hover:bg-white/10"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsAuthorMenuOpen(false);
                    postActions.report.onRequest?.({
                      targetId: post.id,
                      targetLabel: post.text || "流星便",
                      targetOwnerId: post.authorId,
                      targetType: "post",
                      triggerElement: authorMenuButtonRef.current,
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
        </div>
      ) : null}
      {hasCornerEmblem ? (
        <ProfileTitleEmblem decorative placement="post-card" size="compact" title={post.primaryTitle} />
      ) : null}
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
          <div className={`min-w-0 flex-1 pt-0.5${hasCornerEmblem || canShowAuthorMenu ? " pr-20" : ""}`}>
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
              {!hasCornerEmblem ? <ProfileTitleEmblem decorative size="compact" title={post.primaryTitle} /> : null}
              <ProfileTitleBadge size="compact" title={post.primaryTitle} />
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
            active={hasViewerResonated}
            disabled={isResonanceSaving || !resonance?.onResonate}
            icon={hasViewerResonated ? "♥" : "♡"}
            label={isResonanceSaving ? "共鳴中..." : resonanceLabel}
            onClick={() => resonance?.onResonate?.(post.id)}
            variant="resonance"
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
      className="star-letter-panel mt-5 p-3 sm:p-4"
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
      className={`star-letter-item px-3 py-3 ${
        letter.displayDepth ? "ml-3 star-letter-item-reply sm:ml-5" : ""
      } ${starLetters?.highlightedId === letter.id ? "star-letter-item-highlighted" : ""}`}
      id={`star-letter-${letter.id}`}
      tabIndex={-1}
    >
      <div className="flex gap-3">
        <AvatarFrame avatar={letter.avatar} avatarUrl={letter.avatarUrl} className="h-9 w-9 rounded-2xl text-xs" frame={letter.avatarFrame} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-black text-white">{letter.name}</span>
            <ProfileTitleEmblem decorative size="compact" title={letter.primaryTitle} />
            <ProfileTitleBadge size="compact" title={letter.primaryTitle} />
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

function getActionButtonTone(variant = "default", active = false) {
  if (variant === "resonance") {
    return active
      ? "border-sakura/55 bg-sakura/15 text-sakura shadow-[0_0_18px_rgba(255,120,168,0.16)]"
      : "border-white/10 bg-white/5 hover:border-sakura/30 hover:bg-sakura/10 hover:text-white";
  }

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
      <span className={variant === "resonance" && active ? "text-sakura" : "text-comet"}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export { PostCard };

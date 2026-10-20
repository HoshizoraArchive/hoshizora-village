import { useEffect, useRef, useState } from "react";
import { LinkedText } from "./LinkedText";
import { PostImageDraftPreview, PostVideoDraftPreview, PostThumbnailDraftPreview } from "./MediaDraftPreviews";
import { POST_MAX_LENGTH } from "../lib/postTextUtils";

const METEOR_COMPOSER_FORM_ID = "meteor-composer-form";

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

export { Composer, MeteorTagTextarea, METEOR_COMPOSER_FORM_ID };

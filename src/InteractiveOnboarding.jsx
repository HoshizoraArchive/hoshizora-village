import { useCallback, useEffect, useRef, useState } from "react";
import {
  ONBOARDING_MINI_CHIA_SRC,
  ONBOARDING_WELCOME_VIDEO_SRC,
  createVillageUsername,
  getHomeScreenInstallMode,
  getNotificationSkipStatus,
  getOnboardingStepDefinition,
  getProfileGuideStepDefinition,
  isIosHomeScreenRequiredForPush,
  shouldCreateVillageUsername,
  shouldOfferNotificationSkip,
  tryPlayWelcomeVideo,
} from "./onboarding";
import {
  ONBOARDING_SKIP_ERROR_MESSAGE,
  ONBOARDING_SKIP_HELPER,
  ONBOARDING_SKIP_LABEL,
  ONBOARDING_SKIP_LOADING_LABEL,
  requestSkipAllOnboarding,
} from "./onboardingSkipExperience";

const PROFILE_DYNAMIC_TARGET = "profile-guide-active";
const PROFILE_USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;
const PROFILE_GUIDE_CONTROL_SELECTOR = "input, textarea, button, select";
const PROFILE_GUIDE_ORIGINAL_DISABLED = "data-onboarding-original-disabled";
const PROFILE_GUIDE_PREVIOUS_STEP = Object.freeze({
  username: "name",
  avatar: "username",
  bio: "avatar",
  star_chart: "bio",
  save: "star_chart",
});

function OnboardingSkipAllControl({ busy, error, onSkipAll }) {
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <button
        aria-label="ちあの入村案内をすべてスキップ"
        className="min-h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-black text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
        onClick={() => void onSkipAll()}
        type="button"
      >
        {busy ? ONBOARDING_SKIP_LOADING_LABEL : ONBOARDING_SKIP_LABEL}
      </button>
      <p className="mt-1 text-center text-[9px] font-bold leading-4 text-slate-500">
        {ONBOARDING_SKIP_HELPER}
      </p>
      {error ? (
        <p className="mt-1 text-center text-[10px] font-bold leading-4 text-sakura">{error}</p>
      ) : null}
    </div>
  );
}

function WelcomeVideo({ error, onComplete, onSkipAll, skipAllBusy, skipAllError }) {
  const dialogRef = useRef(null);
  const completionStartedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const skipButtonRef = useRef(null);
  const videoRef = useRef(null);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const completeOnce = useCallback(async (status) => {
    if (completionStartedRef.current) {
      return false;
    }

    completionStartedRef.current = true;
    try {
      const result = await onCompleteRef.current(status);

      if (!result) {
        completionStartedRef.current = false;
      }

      return Boolean(result);
    } catch {
      completionStartedRef.current = false;
      return false;
    }
  }, []);

  useEffect(() => {
    if (!ONBOARDING_WELCOME_VIDEO_SRC) {
      return undefined;
    }

    let isCurrent = true;

    async function attemptAutoplay() {
      const started = await tryPlayWelcomeVideo(videoRef.current);

      if (isCurrent) {
        setShowPlayButton(!started);
      }
    }

    void attemptAutoplay();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skipButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        void completeOnce("skipped");
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = [...(dialogRef.current?.querySelectorAll("button, video[controls]") ?? [])];

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [completeOnce]);

  async function handlePlayVideo() {
    setPlaybackError("");
    const started = await tryPlayWelcomeVideo(videoRef.current);
    setShowPlayButton(!started);

    if (!started) {
      setPlaybackError("映像を再生できませんでした。スキップして案内へ進むこともできます。");
    }
  }

  return (
    <div
      aria-labelledby="onboarding-welcome-title"
      aria-modal="true"
      className="onboarding-welcome fixed inset-0 z-[90] grid place-items-center overflow-y-auto px-4 py-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
    >
      <div className="absolute inset-0 bg-night-950/90" aria-hidden="true" />
      <section
        className="glass-panel relative z-10 w-full max-w-3xl overflow-hidden p-4 sm:p-6"
        ref={dialogRef}
      >
        <p className="text-xs font-black normal-case text-comet">Welcome to 星空Village</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl" id="onboarding-welcome-title">
          入村案内をはじめます
        </h2>
        {ONBOARDING_WELCOME_VIDEO_SRC ? (
          <video
            className="mt-5 aspect-video w-full bg-transparent object-contain"
            controls
            onEnded={() => void completeOnce("completed")}
            onPlay={() => {
              setShowPlayButton(false);
              setPlaybackError("");
            }}
            playsInline
            preload="metadata"
            ref={videoRef}
            src={ONBOARDING_WELCOME_VIDEO_SRC}
          />
        ) : (
          <div className="mt-5 grid aspect-video place-items-center rounded-2xl border border-white/10 bg-night-950/45 px-6 text-center text-sm leading-7 text-slate-300">
            Welcome映像は準備中です。映像をスキップすると、ミニちあの案内を確認できます。
          </div>
        )}
        {showPlayButton ? (
          <button
            className="mt-4 min-h-12 w-full rounded-2xl border border-comet/40 bg-comet/10 px-5 text-sm font-black text-white transition hover:bg-comet/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            onClick={handlePlayVideo}
            type="button"
          >
            Welcome映像を再生
          </button>
        ) : null}
        {playbackError ? (
          <p className="mt-3 text-sm leading-6 text-slate-300">{playbackError}</p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-2xl border border-sakura/30 bg-sakura/10 px-4 py-3 text-sm leading-6 text-sakura">
            {error}
          </p>
        ) : null}
        <button
          className="mt-5 min-h-12 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-5 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          onClick={() => void completeOnce("skipped")}
          ref={skipButtonRef}
          type="button"
        >
          映像をスキップして案内へ進む
        </button>
        <OnboardingSkipAllControl
          busy={skipAllBusy}
          error={skipAllError}
          onSkipAll={onSkipAll}
        />
      </section>
    </div>
  );
}

function findButtonByText(root, text) {
  return [...(root?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent?.trim() === text,
  );
}

function getProfileEditor() {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    document.querySelector('[data-onboarding-target="profile-editor"]') ??
    document.querySelector('input[placeholder="名無しの観測者"]')?.closest("form") ??
    null
  );
}

function getProfileUsernameInput(editor) {
  return editor?.querySelector('input[placeholder="silent_creator"]') ?? null;
}

function setProfileInputValue(input, value) {
  if (!input) {
    return;
  }

  const inputWindow = input.ownerDocument?.defaultView;
  const valueSetter = inputWindow?.HTMLInputElement
    ? Object.getOwnPropertyDescriptor(inputWindow.HTMLInputElement.prototype, "value")?.set
    : null;

  if (valueSetter) {
    valueSetter.call(input, value);
  } else {
    input.value = value;
  }

  const InputEvent = inputWindow?.Event ?? Event;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function ensureVillageUsername(editor, displayName, generatedUsernameRef) {
  const input = getProfileUsernameInput(editor);

  if (!input) {
    return "";
  }

  const hasExistingProfile = Boolean(String(displayName ?? "").trim());

  if (!shouldCreateVillageUsername(input.value, { hasExistingProfile })) {
    return input.value.trim().replace(/^@/, "");
  }

  if (generatedUsernameRef.current && !input.value.trim()) {
    return "";
  }

  const username = generatedUsernameRef.current || createVillageUsername();
  generatedUsernameRef.current = username;
  setProfileInputValue(input, username);
  return username;
}

function getProfileAvatarSection(editor) {
  const fileInput = editor?.querySelector('input[type="file"]');
  let current = fileInput?.parentElement ?? null;

  while (current && current !== editor) {
    const hasAvatarHeading = [...current.children].some(
      (child) => child.tagName === "P" && child.textContent?.trim() === "星影",
    );

    if (hasAvatarHeading) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function isProfileAvatarReady(editor) {
  const avatarUrlInput = editor?.querySelector('input[placeholder="https://example.com/avatar.png"]');
  const avatarSection = getProfileAvatarSection(editor);
  return Boolean(avatarUrlInput?.value?.trim() || avatarSection?.querySelector("img[src]"));
}

function getProfileGuideAllowedControls(editor, step) {
  const allowed = new Set();

  if (!editor) {
    return allowed;
  }

  if (step === "name") {
    const input = editor.querySelector('input[placeholder="名無しの観測者"]');
    if (input) allowed.add(input);
    return allowed;
  }

  if (step === "username") {
    const input = getProfileUsernameInput(editor);
    if (input) allowed.add(input);
    return allowed;
  }

  if (step === "avatar") {
    const avatarSection = getProfileAvatarSection(editor);
    for (const control of avatarSection?.querySelectorAll(PROFILE_GUIDE_CONTROL_SELECTOR) ?? []) {
      allowed.add(control);
    }
    return allowed;
  }

  if (step === "bio") {
    const input = editor.querySelector('textarea[placeholder^="まだ名前のない作品"]');
    if (input) allowed.add(input);
    return allowed;
  }

  if (step === "star_chart") {
    const input = editor.querySelector('textarea[placeholder^="好きなもの"]');
    if (input) allowed.add(input);
    return allowed;
  }

  if (step === "save") {
    const button = editor.querySelector('button[type="submit"]');
    if (button) allowed.add(button);
  }

  return allowed;
}

function applyProfileGuideInteractionLock(editor, step) {
  if (!editor) {
    return;
  }

  const allowed = getProfileGuideAllowedControls(editor, step);

  for (const control of editor.querySelectorAll(PROFILE_GUIDE_CONTROL_SELECTOR)) {
    const locked = !allowed.has(control);
    const wasLocked = control.hasAttribute("data-onboarding-locked");

    if (!locked) {
      if (wasLocked) {
        control.disabled = control.getAttribute(PROFILE_GUIDE_ORIGINAL_DISABLED) === "true";
        control.removeAttribute(PROFILE_GUIDE_ORIGINAL_DISABLED);
        control.removeAttribute("data-onboarding-locked");
      }
      continue;
    }

    if (!wasLocked) {
      control.setAttribute(PROFILE_GUIDE_ORIGINAL_DISABLED, control.disabled ? "true" : "false");
    }

    control.disabled = true;
    control.setAttribute("data-onboarding-locked", "true");
  }
}

function restoreProfileGuideInteractionLock(editor) {
  if (!editor) {
    return;
  }

  for (const control of editor.querySelectorAll(`[${PROFILE_GUIDE_ORIGINAL_DISABLED}]`)) {
    control.disabled = control.getAttribute(PROFILE_GUIDE_ORIGINAL_DISABLED) === "true";
    control.removeAttribute(PROFILE_GUIDE_ORIGINAL_DISABLED);
    control.removeAttribute("data-onboarding-locked");
  }
}

function getProfileGuideTargetElement(targetKey) {
  if (typeof document === "undefined") {
    return null;
  }

  if (targetKey === "avatar_crop") {
    return findButtonByText(document.querySelector('[aria-label="星影を切り取る"]'), "この星影を使う");
  }

  const editor = getProfileEditor();

  if (!editor) {
    return null;
  }

  if (targetKey === "name") {
    return editor.querySelector('input[placeholder="名無しの観測者"]');
  }

  if (targetKey === "username") {
    return getProfileUsernameInput(editor);
  }

  if (targetKey === "avatar") {
    const fileInput = editor.querySelector('input[type="file"]');
    return getProfileAvatarSection(editor) ?? fileInput?.closest("label") ?? fileInput;
  }

  if (targetKey === "bio") {
    return editor.querySelector('textarea[placeholder^="まだ名前のない作品"]');
  }

  if (targetKey === "star_chart") {
    return editor.querySelector('textarea[placeholder^="好きなもの"]');
  }

  if (targetKey === "save") {
    return editor.querySelector('button[type="submit"]');
  }

  return null;
}

export default function InteractiveOnboarding({
  busy,
  displayName,
  error,
  onAdvance,
  onSkipNotifications,
  progress,
}) {
  const dialogueRef = useRef(null);
  const generatedUsernameRef = useRef("");
  const installPromptRef = useRef(null);
  const profileGuideStepRef = useRef("entry");
  const skipAllInFlightRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [homeScreenHelpMode, setHomeScreenHelpMode] = useState("");
  const [homeScreenInstallComplete, setHomeScreenInstallComplete] = useState(false);
  const [placement, setPlacement] = useState("bottom");
  const [profileAvatarReady, setProfileAvatarReady] = useState(false);
  const [profileGuideError, setProfileGuideError] = useState("");
  const [profileGuideStep, setProfileGuideStep] = useState("entry");
  const [skipAllBusy, setSkipAllBusy] = useState(false);
  const [skipAllError, setSkipAllError] = useState("");

  const handleSkipAllOnboarding = useCallback(async () => {
    if (skipAllInFlightRef.current || busy) {
      return false;
    }

    skipAllInFlightRef.current = true;
    setSkipAllBusy(true);
    setSkipAllError("");

    try {
      const result = await requestSkipAllOnboarding();

      if (result.outcome === "cancelled") {
        return false;
      }

      if (result.outcome !== "succeeded") {
        setSkipAllError(ONBOARDING_SKIP_ERROR_MESSAGE);
        return false;
      }

      window.location.reload();
      return true;
    } catch {
      setSkipAllError(ONBOARDING_SKIP_ERROR_MESSAGE);
      return false;
    } finally {
      skipAllInFlightRef.current = false;
      setSkipAllBusy(false);
    }
  }, [busy]);

  useEffect(() => {
    profileGuideStepRef.current = profileGuideStep;
  }, [profileGuideStep]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      installPromptRef.current = event;
    }

    function handleAppInstalled() {
      installPromptRef.current = null;
      setHomeScreenHelpMode("");
      setHomeScreenInstallComplete(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    setCollapsed(false);
    setHomeScreenHelpMode("");
    setPlacement("bottom");
    setProfileGuideError("");
    setSkipAllError("");

    if (progress?.current_step !== "profile_setup") {
      generatedUsernameRef.current = "";
      profileGuideStepRef.current = "entry";
      setProfileGuideStep("entry");
      setProfileAvatarReady(false);
    }
  }, [progress?.current_step]);

  useEffect(() => {
    if (progress?.current_step !== "profile_setup" || typeof document === "undefined") {
      return undefined;
    }

    let timerId;
    let lockedEditor = null;

    function setProfileStep(nextStep) {
      if (profileGuideStepRef.current === nextStep) {
        return;
      }

      profileGuideStepRef.current = nextStep;
      setProfileGuideError("");
      setProfileGuideStep(nextStep);
      applyProfileGuideInteractionLock(getProfileEditor(), nextStep);
    }

    function synchronizeProfileGuide() {
      const cropDialog = document.querySelector('[aria-label="星影を切り取る"]');
      const editor = getProfileEditor();
      const avatarReady = isProfileAvatarReady(editor);
      setProfileAvatarReady(avatarReady);

      if (editor) {
        lockedEditor = editor;
      }

      if (cropDialog) {
        setProfileStep("avatar_crop");
        return;
      }

      if (!editor) {
        return;
      }

      ensureVillageUsername(editor, displayName, generatedUsernameRef);

      if (profileGuideStepRef.current === "entry") {
        setProfileStep("name");
        return;
      }

      if (profileGuideStepRef.current === "avatar_crop") {
        setProfileStep(avatarReady ? "bio" : "avatar");
        return;
      }

      applyProfileGuideInteractionLock(editor, profileGuideStepRef.current);
    }

    function handleFocus(event) {
      const editor = getProfileEditor();

      if (!editor?.contains(event.target) || event.target.disabled) {
        return;
      }

      if (event.target.matches('input[placeholder="名無しの観測者"]')) {
        setProfileStep("name");
      } else if (event.target === getProfileUsernameInput(editor)) {
        setProfileStep("username");
      } else if (event.target.matches('textarea[placeholder^="まだ名前のない作品"]')) {
        setProfileStep("bio");
      } else if (event.target.matches('textarea[placeholder^="好きなもの"]')) {
        setProfileStep("star_chart");
      }
    }

    const observer = new MutationObserver(() => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(synchronizeProfileGuide, 30);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", synchronizeProfileGuide, true);
    document.addEventListener("focusin", handleFocus, true);
    synchronizeProfileGuide();

    return () => {
      window.clearTimeout(timerId);
      observer.disconnect();
      document.removeEventListener("change", synchronizeProfileGuide, true);
      document.removeEventListener("focusin", handleFocus, true);
      restoreProfileGuideInteractionLock(lockedEditor ?? getProfileEditor());
    };
  }, [displayName, progress?.current_step]);

  const profileGuideDefinition =
    progress?.current_step === "profile_setup" && profileGuideStep !== "entry"
      ? getProfileGuideStepDefinition(profileGuideStep)
      : null;
  const canGoBackProfileGuide = Boolean(
    profileGuideDefinition && PROFILE_GUIDE_PREVIOUS_STEP[profileGuideStep],
  );
  const isNotificationStep = Boolean(
    progress &&
      ["notification_permission", "device_registration", "push_test"].includes(progress.current_step),
  );
  const homeScreenInstallMode = isNotificationStep ? getHomeScreenInstallMode() : "";
  const needsIosHomeScreen = Boolean(
    isNotificationStep && homeScreenInstallMode === "ios" && isIosHomeScreenRequiredForPush(),
  );
  const showHomeScreenInstall = Boolean(
    isNotificationStep && homeScreenInstallMode && !homeScreenInstallComplete,
  );

  let step = progress ? getOnboardingStepDefinition(progress.current_step, displayName) : null;

  if (profileGuideDefinition) {
    step = {
      ...profileGuideDefinition,
      target: PROFILE_DYNAMIC_TARGET,
    };
  } else if (needsIosHomeScreen) {
    step = {
      lines: ["iPhoneでは、ホーム画面に追加すると通知を受け取れるよ！"],
    };
  }

  const effectiveTargetName = profileGuideDefinition
    ? PROFILE_DYNAMIC_TARGET
    : needsIosHomeScreen
      ? ""
      : progress?.target;

  useEffect(() => {
    if (!profileGuideDefinition?.targetKey || typeof document === "undefined") {
      return undefined;
    }

    let attemptCount = 0;
    let timerId;
    let currentTarget = null;
    let previousTargetName = null;
    let profileEditor = null;
    let profileEditorTargetName = null;

    function attachTargetWhenReady() {
      const target = getProfileGuideTargetElement(profileGuideDefinition.targetKey);

      if (!target && attemptCount < 30) {
        attemptCount += 1;
        timerId = window.setTimeout(attachTargetWhenReady, 100);
        return;
      }

      if (!target) {
        return;
      }

      profileEditor = getProfileEditor();
      profileEditorTargetName = profileEditor?.getAttribute("data-onboarding-target") ?? null;
      if (profileEditorTargetName === "profile-editor") {
        profileEditor.removeAttribute("data-onboarding-target");
      }

      currentTarget = target;
      previousTargetName = target.getAttribute("data-onboarding-target");
      target.setAttribute("data-onboarding-dynamic-target", "true");
      target.setAttribute("data-onboarding-target", PROFILE_DYNAMIC_TARGET);
    }

    attachTargetWhenReady();

    return () => {
      window.clearTimeout(timerId);

      if (currentTarget?.getAttribute("data-onboarding-dynamic-target") === "true") {
        currentTarget.removeAttribute("data-onboarding-dynamic-target");
        if (previousTargetName) {
          currentTarget.setAttribute("data-onboarding-target", previousTargetName);
        } else {
          currentTarget.removeAttribute("data-onboarding-target");
        }
      }

      if (profileEditor && profileEditorTargetName === "profile-editor") {
        profileEditor.setAttribute("data-onboarding-target", profileEditorTargetName);
      }
    };
  }, [profileGuideDefinition?.targetKey]);

  useEffect(() => {
    if (!effectiveTargetName || typeof document === "undefined") {
      setPlacement(needsIosHomeScreen ? "top" : "bottom");
      return undefined;
    }

    let attemptCount = 0;
    let timerId;

    function focusTargetWhenReady() {
      const target = document.querySelector(`[data-onboarding-target="${effectiveTargetName}"]`);

      if (!target && attemptCount < 30) {
        attemptCount += 1;
        timerId = window.setTimeout(focusTargetWhenReady, 100);
        return;
      }

      if (!target) {
        return;
      }

      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const targetRect = target.getBoundingClientRect();
      const targetMiddle = targetRect.top + targetRect.height / 2;
      setPlacement(targetMiddle > window.innerHeight * 0.54 ? "top" : "bottom");
      target.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });

      if (profileGuideStep === "name" || profileGuideStep === "username") {
        target.focus?.({ preventScroll: true });
      }
    }

    timerId = window.setTimeout(focusTargetWhenReady, 80);

    return () => window.clearTimeout(timerId);
  }, [effectiveTargetName, needsIosHomeScreen, profileGuideStep, progress?.current_step]);

  if (!progress) {
    return null;
  }

  if (progress.current_step === "welcome_video") {
    return (
      <WelcomeVideo
        error={error}
        onComplete={(status) => onAdvance("welcome_completed", { status })}
        onSkipAll={handleSkipAllOnboarding}
        skipAllBusy={skipAllBusy || busy}
        skipAllError={skipAllError}
      />
    );
  }

  if (!step) {
    return null;
  }

  const allowNotificationSkip = shouldOfferNotificationSkip(progress) || needsIosHomeScreen;
  const profileActionLabel =
    profileGuideDefinition?.actionLabel ||
    (profileGuideStep === "avatar" && profileAvatarReady ? "次へ" : "");
  const isCompact = Boolean(
    profileGuideDefinition ||
      effectiveTargetName ||
      allowNotificationSkip ||
      showHomeScreenInstall ||
      ["archive_success", "notification_permission", "device_registration", "push_test"].includes(
        progress.current_step,
      ),
  );
  const innerStyle = {
    ...(placement === "top"
      ? { bottom: "auto", top: "max(0.75rem, env(safe-area-inset-top))" }
      : {}),
    ...(isCompact
      ? {
          gridTemplateColumns: "clamp(3rem, 13vw, 4.5rem) minmax(0, 20rem)",
          maxHeight: "calc(100dvh - 7rem)",
        }
      : {}),
  };
  const dialogueStyle = isCompact
    ? { maxHeight: "min(38dvh, 17rem)", padding: "0.72rem 0.82rem" }
    : undefined;
  const miniChiaStyle = isCompact ? { maxHeight: "9rem" } : undefined;

  function moveProfileGuideTo(nextStep) {
    profileGuideStepRef.current = nextStep;
    setProfileGuideError("");
    setProfileGuideStep(nextStep);
    applyProfileGuideInteractionLock(getProfileEditor(), nextStep);
  }

  function handleProfileGuideBack() {
    const previousStep = PROFILE_GUIDE_PREVIOUS_STEP[profileGuideStep];

    if (!previousStep) {
      return;
    }

    moveProfileGuideTo(previousStep);
  }

  function handleProfileGuideNext() {
    if (profileGuideStep === "name") {
      const input = getProfileGuideTargetElement("name");
      if (!input?.value?.trim()) {
        setProfileGuideError("先に名前を書いてね！");
        input?.focus();
        return;
      }
      ensureVillageUsername(getProfileEditor(), displayName, generatedUsernameRef);
      moveProfileGuideTo("username");
      return;
    }

    if (profileGuideStep === "username") {
      const input = getProfileUsernameInput(getProfileEditor());
      const username = ensureVillageUsername(getProfileEditor(), displayName, generatedUsernameRef)
        .trim()
        .replace(/^@/, "");

      if (!username) {
        setProfileGuideError("ユーザー名を決めてから次へ進んでね！");
        input?.focus();
        return;
      }

      if (!PROFILE_USERNAME_PATTERN.test(username)) {
        setProfileGuideError("ユーザー名は3〜32文字の半角英数字と「_」で決めてね！");
        input?.focus();
        return;
      }

      moveProfileGuideTo("avatar");
      return;
    }

    if (profileGuideStep === "avatar") {
      if (!isProfileAvatarReady(getProfileEditor())) {
        setProfileGuideError("先に星影を選ぶか「今は設定しない」を押してね！");
        return;
      }
      moveProfileGuideTo("bio");
      return;
    }

    if (profileGuideStep === "bio") {
      moveProfileGuideTo("star_chart");
      return;
    }

    if (profileGuideStep === "star_chart") {
      moveProfileGuideTo("save");
    }
  }

  async function handleHomeScreenInstall() {
    setHomeScreenHelpMode("");

    if (homeScreenInstallMode === "ios") {
      setHomeScreenHelpMode("ios");
      return;
    }

    if (homeScreenInstallMode !== "android") {
      return;
    }

    const promptEvent = installPromptRef.current;

    if (!promptEvent || typeof promptEvent.prompt !== "function") {
      setHomeScreenHelpMode("android");
      return;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice?.outcome === "accepted") {
        installPromptRef.current = null;
        setHomeScreenInstallComplete(true);
        return;
      }
    } catch {
      // Browser-provided install prompts are optional. Fall back to manual instructions.
    }

    setHomeScreenHelpMode("android");
  }

  if (collapsed) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[80]">
        <button
          className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex min-h-11 items-center gap-2 rounded-full border border-comet/30 bg-night-950/95 px-3 py-2 text-xs font-black text-white shadow-glow backdrop-blur-xl"
          onClick={() => setCollapsed(false)}
          type="button"
        >
          <img alt="" className="h-8 w-8 object-contain" src={ONBOARDING_MINI_CHIA_SRC} />
          ちあの案内を見る
        </button>
      </div>
    );
  }

  return (
    <div
      className="onboarding-guide pointer-events-none fixed inset-0 z-[80]"
      data-guide-placement={placement}
      data-guide-variant={isCompact ? "compact" : "story"}
      data-onboarding-step={progress.current_step}
      data-profile-guide-step={profileGuideDefinition ? profileGuideStep : undefined}
    >
      <div className="onboarding-guide-inner" style={innerStyle}>
        <img
          alt="星空ちあ"
          className="onboarding-mini-chia pointer-events-none select-none"
          draggable={false}
          src={ONBOARDING_MINI_CHIA_SRC}
          style={miniChiaStyle}
        />
        <aside
          aria-atomic="true"
          aria-label="星空ちあの入村案内"
          aria-live="polite"
          className="onboarding-dialogue pointer-events-auto"
          ref={dialogueRef}
          role="region"
          style={dialogueStyle}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-black tracking-[0.12em] text-comet">星空ちあ</p>
            <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">
              {canGoBackProfileGuide ? (
                <button
                  aria-label="ひとつ前の案内に戻る"
                  className="min-h-8 rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-black text-slate-300 transition hover:bg-white/10 hover:text-white"
                  onClick={handleProfileGuideBack}
                  type="button"
                >
                  戻る
                </button>
              ) : null}
              <button
                aria-label="ちあの案内を小さくする"
                className="min-h-8 rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-black text-slate-300 transition hover:bg-white/10 hover:text-white"
                onClick={() => setCollapsed(true)}
                type="button"
              >
                小さく
              </button>
            </div>
          </div>
          <div className={`${isCompact ? "mt-1.5 text-[13px] leading-5" : "mt-2 text-sm leading-6 sm:text-base sm:leading-7"} space-y-1.5 font-bold text-white`}>
            {step.lines.map((line, index) => (
              <p key={`${index}-${line}`}>{line}</p>
            ))}
          </div>
          {showHomeScreenInstall ? (
            <button
              className="mt-3 min-h-10 w-full rounded-2xl border border-comet/30 bg-comet/10 px-3 text-xs font-black text-comet transition hover:bg-comet/15"
              onClick={() => void handleHomeScreenInstall()}
              type="button"
            >
              星空Villageをホーム画面に追加
            </button>
          ) : null}
          {homeScreenHelpMode === "ios" ? (
            <div className="mt-2 space-y-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold leading-5 text-slate-200">
              <p>あとちょっとだよ！✨</p>
              <p>Safariの「…」から「共有」を開いて、</p>
              <p>下にスクロールして「ホーム画面に追加」を選んでね！</p>
            </div>
          ) : null}
          {homeScreenHelpMode === "android" ? (
            <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold leading-5 text-slate-200">
              右上の「︙」から「アプリをインストール」または「ホーム画面に追加」を選んでね！
            </div>
          ) : null}
          {profileGuideError ? <p className="mt-2 text-xs leading-5 text-sakura">{profileGuideError}</p> : null}
          {error ? <p className="mt-2 text-xs leading-5 text-sakura">{error}</p> : null}
          {profileActionLabel ? (
            <button
              className="mt-3 min-h-10 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
              onClick={handleProfileGuideNext}
              type="button"
            >
              {profileActionLabel}
            </button>
          ) : null}
          {profileGuideDefinition?.optionalLabel ? (
            <button
              className="mt-2 min-h-9 w-full rounded-2xl border border-white/15 bg-white/5 px-3 text-[11px] font-black text-slate-200 transition hover:bg-white/10"
              onClick={() =>
                moveProfileGuideTo(
                  profileGuideStep === "avatar"
                    ? "bio"
                    : profileGuideStep === "bio"
                      ? "star_chart"
                      : "save",
                )
              }
              type="button"
            >
              {profileGuideDefinition.optionalLabel}
            </button>
          ) : null}
          {!profileGuideDefinition && step.action ? (
            <button
              className="mt-3 min-h-10 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => onAdvance(step.action, { navigateTo: step.navigateTo })}
              type="button"
            >
              次へ
            </button>
          ) : null}
          {allowNotificationSkip ? (
            <button
              className="mt-2 min-h-10 w-full rounded-2xl border border-white/15 bg-white/5 px-3 text-[11px] font-black text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => onSkipNotifications(getNotificationSkipStatus(progress))}
              type="button"
            >
              {needsIosHomeScreen ? "通知はあとで設定する" : "通知の案内をスキップして流星便へ進む"}
            </button>
          ) : null}
          <OnboardingSkipAllControl
            busy={skipAllBusy || busy}
            error={skipAllError}
            onSkipAll={handleSkipAllOnboarding}
          />
        </aside>
      </div>
    </div>
  );
}

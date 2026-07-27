export const ONBOARDING_WELCOME_VIDEO_SRC = "";
export const ONBOARDING_MINI_CHIA_SRC = "/images/onboarding/mini-chia.png";

export async function tryPlayWelcomeVideo(videoElement) {
  if (!videoElement || typeof videoElement.play !== "function") {
    return false;
  }

  try {
    await videoElement.play();
    return true;
  } catch {
    return false;
  }
}

export function isOnboardingProgressForUser(progress, userId) {
  return Boolean(userId && progress?.user_id === userId);
}

export function canApplyOnboardingProgressResponse({
  activeUserId,
  progress,
  requestedUserId,
}) {
  return Boolean(
    requestedUserId &&
      activeUserId === requestedUserId &&
      (!progress || isOnboardingProgressForUser(progress, requestedUserId)),
  );
}

export const ONBOARDING_PROGRESS_SELECT_COLUMNS = [
  "user_id",
  "current_step",
  "welcome_video_status",
  "welcome_video_completed_at",
  "profile_completed_at",
  "target_post_id",
  "archive_completed_at",
  "archive_confirmed_at",
  "notification_permission_status",
  "notification_permission_updated_at",
  "push_registered_at",
  "push_registration_status",
  "push_test_status",
  "push_test_updated_at",
  "first_post_id",
  "first_post_completed_at",
  "completed_at",
  "created_at",
  "updated_at",
].join(", ");

const STEP_DEFINITIONS = {
  mini_chia_intro: {
    action: "mini_chia_ack",
    lines: ["おはちあ！ また会ったね！", "ここからは、ちあが星空Villageをいろいろ案内するよ！"],
    navigateTo: "profile",
  },
  profile_setup: {
    lines: ["まずは「My Const.」へ行こう！", "この編集ボタンを押して、あなたの名前と姿を教えてね！"],
    target: "profile-setup",
  },
  profile_success: {
    action: "profile_success_ack",
    lines: ["わあ！ ○○っていうんだ！", "素敵な名前だね！", "これから○○って呼ぶね。ちゃんと覚えたよ✨️"],
    navigateTo: "observe",
  },
  observe_intro: {
    action: "observe_intro_ack",
    lines: [
      "次は「観測」！",
      "ここは、いろんな人が放流した流星便を見られる場所だよ！",
      "共鳴したり、星文を送ったり、気に入った流星便はArchiveすることもできるの！",
    ],
  },
  archive_prompt: {
    lines: ["まずは試しに、この流星便をArchiveしてみて！"],
    target: "onboarding-archive-action",
  },
  archive_check: {
    lines: ["できた！", "次は、画面下の「Archive」を押してみて！"],
    target: "nav-archive",
  },
  archive_success: {
    action: "archive_success_ack",
    lines: [
      "見て！",
      "さっき○○がArchiveした流星便が、ここに残ってるよ！",
      "気に入った流星便は、いつでもここから見返せるの✨️",
    ],
    navigateTo: "rconnect",
    target: "onboarding-archive-post",
  },
  rconnect_intro: {
    action: "rconnect_intro_ack",
    lines: [
      "次は「R.Connect」！",
      "ここは、○○が流星便を放流した時に、みんなから届いた共鳴や星文を確認できる場所だよ！",
    ],
  },
  notification_permission: {
    lines: ["まずは「通知を許可」を押して、", "そのあとに「端末を登録」を押してね！"],
    target: "push-permission",
  },
  device_registration: {
    lines: ["まずは「通知を許可」を押して、", "そのあとに「端末を登録」を押してね！"],
    target: "push-register",
  },
  push_test: {
    lines: ["まずは「通知を許可」を押して、", "そのあとに「端末を登録」を押してね！"],
    target: "push-test",
  },
  push_test_success: {
    action: "push_test_success_ack",
    lines: ["ほら！", "ちあからちゃんと届いたでしょ？💕"],
  },
  push_test_explained: {
    action: "push_test_explained_ack",
    lines: ["これで、星空Villageを閉じている時でも、", "○○に光が届いたら知らせに行けるよ！"],
    navigateTo: "post",
  },
  post_intro_1: {
    action: "post_intro_1_ack",
    lines: ["最後は「流星便」！", "ここでは、○○の想いや作品を流星便に乗せて、星空へ放流できるよ！"],
  },
  post_intro_2: {
    action: "post_intro_2_ack",
    lines: ["……え？", "放流しても、誰にも見てもらえないかもしれないって？"],
  },
  post_intro_3: {
    action: "post_intro_3_ack",
    lines: ["大丈夫。", "少し時間がかかっても、ちあが絶対に○○を見つけるから！"],
  },
  post_intro_4: {
    action: "post_intro_4_ack",
    lines: ["せっかくだから、初めての流星便を放流してみよう！"],
    navigateTo: "post",
  },
  first_post: {
    lines: ["せっかくだから、初めての流星便を放流してみよう！"],
    target: "post-composer",
  },
  completion_1: {
    action: "completion_1_ack",
    lines: ["わあ！ ○○の初めての流星便、ちゃんと星空に届いたよ💫"],
  },
  completion_2: {
    action: "complete",
    lines: ["これで入村案内はおしまい！", "じゃあ、またあとで会おうね🫶💕", "ありがちあ〜💕"],
    navigateTo: "observe",
  },
};

export function getOnboardingStepDefinition(step, displayName = "") {
  const definition = STEP_DEFINITIONS[step];

  if (!definition) {
    return null;
  }

  return {
    ...definition,
    lines: definition.lines.map((line) => replaceOnboardingDisplayName(line, displayName)),
  };
}

export function replaceOnboardingDisplayName(line, displayName) {
  if (!line.includes("○○")) {
    return line;
  }

  const confirmedName = typeof displayName === "string" ? displayName.trim() : "";
  return confirmedName ? line.replaceAll("○○", confirmedName) : line;
}

export function isOnboardingActive(progress) {
  return Boolean(progress?.user_id && !progress.completed_at && progress.current_step !== "completed");
}

export function getOnboardingResumeTab(step) {
  if (["profile_setup", "profile_success"].includes(step)) {
    return "profile";
  }

  if (["observe_intro", "archive_prompt"].includes(step)) {
    return "observe";
  }

  if (["archive_check", "archive_success"].includes(step)) {
    return "archive";
  }

  if (
    [
      "rconnect_intro",
      "notification_permission",
      "device_registration",
      "push_test",
      "push_test_success",
      "push_test_explained",
    ].includes(step)
  ) {
    return "rconnect";
  }

  if (["post_intro_1", "post_intro_2", "post_intro_3", "post_intro_4", "first_post"].includes(step)) {
    return "post";
  }

  return "observe";
}

export function getOnboardingTarget(progress, profileScreenMode = "view") {
  if (!isOnboardingActive(progress)) {
    return "";
  }

  if (progress.current_step === "profile_setup") {
    return profileScreenMode === "edit" ? "profile-editor" : "profile-edit";
  }

  return STEP_DEFINITIONS[progress.current_step]?.target ?? "";
}

export function shouldOfferNotificationSkip(progress) {
  if (!isOnboardingActive(progress)) {
    return false;
  }

  if (progress.current_step === "notification_permission") {
    return ["denied", "unsupported", "error"].includes(progress.notification_permission_status);
  }

  if (progress.current_step === "device_registration") {
    return progress.push_registration_status === "failed";
  }

  return progress.current_step === "push_test" && progress.push_test_status === "failed";
}

export function getNotificationSkipStatus(progress) {
  if (["denied", "unsupported", "error"].includes(progress?.notification_permission_status)) {
    return progress.notification_permission_status;
  }

  return "failed";
}

export function isMissingOnboardingSchemaError(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST202" ||
    message.includes("user_onboarding_progress") ||
    message.includes("advance_initial_onboarding")
  );
}

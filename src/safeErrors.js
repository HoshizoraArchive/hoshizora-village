export const ERROR_OPERATION = Object.freeze({
  ARCHIVE_LOAD: "archive_load",
  ARCHIVE_SAVE: "archive_save",
  AUTH_SESSION: "auth_session",
  AUTH_SIGN_IN: "auth_sign_in",
  AUTH_SIGN_OUT: "auth_sign_out",
  AUTH_SIGN_UP: "auth_sign_up",
  FEEDBACK_SAVE: "feedback_save",
  MEDIA_CLEANUP: "media_cleanup",
  MEDIA_LOAD: "media_load",
  MEDIA_SIGNED_URL: "media_signed_url",
  METEOR_TAG_LOAD: "meteor_tag_load",
  METEOR_TAG_SAVE: "meteor_tag_save",
  NOTIFICATION_LOAD: "notification_load",
  NOTIFICATION_SAVE: "notification_save",
  POST_CREATE: "post_create",
  POST_DELETE: "post_delete",
  POST_LOAD: "post_load",
  POST_MEDIA_SAVE: "post_media_save",
  POST_UPDATE: "post_update",
  PROFILE_FRAME_LOAD: "profile_frame_load",
  PROFILE_LOAD: "profile_load",
  PROFILE_SAVE: "profile_save",
  RESONANCE_LOAD: "resonance_load",
  RESONANCE_SAVE: "resonance_save",
  STAR_LETTER_LOAD: "star_letter_load",
  STAR_LETTER_SAVE: "star_letter_save",
  STORAGE_UPLOAD: "storage_upload",
  VIDEO_THUMBNAIL: "video_thumbnail",
  VIDEO_TRIM: "video_trim",
  DEFAULT: "default",
});

const USER_ERROR_MESSAGES = Object.freeze({
  [ERROR_OPERATION.ARCHIVE_LOAD]: "Archiveの読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.ARCHIVE_SAVE]: "Archiveの更新に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.AUTH_SESSION]: "ログイン状態の確認に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.AUTH_SIGN_IN]: "ログインに失敗しました。メールアドレスとパスワードを確認してください。",
  [ERROR_OPERATION.AUTH_SIGN_OUT]: "ログアウトに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.AUTH_SIGN_UP]: "会員登録に失敗しました。入力内容を確認してもう一度お試しください。",
  [ERROR_OPERATION.FEEDBACK_SAVE]: "フィードバックの送信に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.MEDIA_CLEANUP]: "送信途中のデータ整理に失敗しました。時間をおいて状態を確認してください。",
  [ERROR_OPERATION.MEDIA_LOAD]: "添付メディアの読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.MEDIA_SIGNED_URL]: "添付メディアの準備に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.METEOR_TAG_LOAD]: "流星タグの読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.METEOR_TAG_SAVE]: "流星タグの保存に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.NOTIFICATION_LOAD]: "R.Connectの読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.NOTIFICATION_SAVE]: "R.Connectの更新に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.POST_CREATE]: "流星便の放流に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.POST_DELETE]: "流星便の削除に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.POST_LOAD]: "流星便の読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.POST_MEDIA_SAVE]: "流星便メディアの保存に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.POST_UPDATE]: "流星便の保存に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.PROFILE_FRAME_LOAD]: "アイコンフレームの読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.PROFILE_LOAD]: "プロフィールの読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.PROFILE_SAVE]: "プロフィールの保存に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.RESONANCE_LOAD]: "共鳴の読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.RESONANCE_SAVE]: "共鳴の記録に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.STAR_LETTER_LOAD]: "星文の読み込みに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.STAR_LETTER_SAVE]: "星文の保存に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.STORAGE_UPLOAD]: "ファイルの送信に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.VIDEO_THUMBNAIL]: "星映の表紙の準備に失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.VIDEO_TRIM]: "星映の切り取りに失敗しました。時間をおいてもう一度お試しください。",
  [ERROR_OPERATION.DEFAULT]: "処理に失敗しました。時間をおいてもう一度お試しください。",
});

export class SafeUserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafeUserFacingError";
    this.safeForUser = true;
  }
}

export function createUserFacingError(message) {
  return new SafeUserFacingError(message);
}

export function isSafeUserFacingError(error) {
  return error instanceof SafeUserFacingError || error?.safeForUser === true;
}

export function getUserFacingError(error, operation = ERROR_OPERATION.DEFAULT) {
  if (isSafeUserFacingError(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  return USER_ERROR_MESSAGES[operation] ?? USER_ERROR_MESSAGES[ERROR_OPERATION.DEFAULT];
}

function getSafeErrorCode(error) {
  if (typeof error?.code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(error.code)) {
    return error.code;
  }

  if (typeof error?.status === "number") {
    return `${error.status}`;
  }

  if (typeof error?.status === "string" && /^[0-9]{3}$/.test(error.status)) {
    return error.status;
  }

  if (typeof error?.name === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(error.name)) {
    return error.name;
  }

  return "unknown";
}

export function getSafeErrorLogContext(error, operation = ERROR_OPERATION.DEFAULT) {
  return {
    operation,
    code: getSafeErrorCode(error),
  };
}

export function logSafeError(operation, error) {
  console.warn("Hoshizora operation failed", getSafeErrorLogContext(error, operation));
}

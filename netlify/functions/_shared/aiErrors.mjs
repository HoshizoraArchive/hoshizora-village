export class AiHttpError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = "AiHttpError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export const AI_ERROR = Object.freeze({
  BAD_JSON: ["BAD_JSON", "リクエスト形式が正しくありません。"],
  BAD_REQUEST: ["BAD_REQUEST", "リクエスト内容が正しくありません。"],
  CONTENT_TOO_LARGE: ["CONTENT_TOO_LARGE", "リクエストが大きすぎます。"],
  DISABLED: ["AI_OBSERVATION_DISABLED", "AI観測機能は現在利用できません。"],
  FORBIDDEN: ["AI_OPERATOR_REQUIRED", "AI観測を実行する権限がありません。"],
  INVALID_TOKEN: ["INVALID_TOKEN", "ログイン情報を確認できませんでした。"],
  METHOD_NOT_ALLOWED: ["METHOD_NOT_ALLOWED", "この操作は許可されていません。"],
  NOT_FOUND: ["POST_NOT_FOUND", "観測できる流星便が見つかりませんでした。"],
  CONFLICT: ["AI_JOB_CONFLICT", "この流星便はすでに観測待ちです。"],
  RATE_LIMITED: ["AI_LIMIT_REACHED", "AI観測の利用上限に達しています。"],
  UNSUPPORTED_MEDIA: ["UNSUPPORTED_MEDIA", "この流星便の形式はAI観測に対応していません。"],
  UNSUPPORTED_TYPE: ["UNSUPPORTED_CONTENT_TYPE", "対応していないリクエスト形式です。"],
  SCHEMA_INVALID: ["AI_OUTPUT_SCHEMA_INVALID", "AI出力の形式が正しくありません。"],
  CONFIGURATION_ERROR: ["AI_CONFIGURATION_ERROR", "AI観測機能は現在利用できません。"],
  WORKER_DISPATCH_FAILED: ["WORKER_DISPATCH_FAILED", "観測を始められませんでした。もう一度試してください。"],
  WORKER_STALE: ["WORKER_STALE", "観測処理が途中で止まったため、再実行できる状態へ戻しました。"],
  POST_CHANGED: ["POST_CHANGED", "流星便の内容が変わったため、観測を中止しました。"],
  MEDIA_UNAVAILABLE: ["MEDIA_UNAVAILABLE", "作品データを確認できませんでした。"],
  GEMINI_UPLOAD_FAILED: ["GEMINI_UPLOAD_FAILED", "作品データの準備に失敗しました。"],
  GEMINI_TIMEOUT: ["GEMINI_TIMEOUT", "観測に時間がかかりすぎました。"],
  GEMINI_RATE_LIMITED: ["GEMINI_RATE_LIMITED", "AI観測が混み合っています。時間をおいてもう一度お試しください。"],
  GEMINI_REQUEST_FAILED: ["GEMINI_REQUEST_FAILED", "AI観測リクエストを受け付けられませんでした。"],
  GEMINI_CONNECTION_FAILED: ["GEMINI_CONNECTION_FAILED", "AI観測サービスへ接続できませんでした。"],
  GEMINI_SERVICE_UNAVAILABLE: ["GEMINI_SERVICE_UNAVAILABLE", "AI観測サービスが一時的に利用できません。"],
  AI_OUTPUT_INVALID: ["AI_OUTPUT_INVALID", "観測結果の形式を確認できませんでした。"],
  CHIA_PROFILE_MISMATCH: ["CHIA_PROFILE_MISMATCH", "星空ちあの設定を確認できませんでした。"],
  INTERNAL: ["AI_INTERNAL_ERROR", "AI観測の準備に失敗しました。時間をおいてもう一度お試しください。"],
});

export function aiHttpError(status, errorTuple, options = {}) {
  return new AiHttpError(status, errorTuple[0], errorTuple[1], options);
}

export function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function errorResponse(error, requestId) {
  const status = Number.isInteger(error?.status) ? error.status : 503;
  const code = typeof error?.code === "string" ? error.code : AI_ERROR.INTERNAL[0];
  const message = typeof error?.message === "string" ? error.message : AI_ERROR.INTERNAL[1];

  const headers = {};

  if (status === 429 && Number.isInteger(error?.retryAfterSeconds) && error.retryAfterSeconds > 0) {
    headers["Retry-After"] = String(error.retryAfterSeconds);
  }

  return jsonResponse(status, {
    error: {
      code,
      message,
      requestId,
    },
  }, headers);
}

function safeCode(value) {
  if (typeof value === "string" && /^[A-Z0-9_:-]{1,80}$/.test(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
    return `${value}`;
  }

  return "unknown";
}

export function logAiEvent(level, event, fields = {}) {
  const entry = {
    event: typeof event === "string" ? event : "ai_event",
    requestId: fields.requestId,
    jobId: fields.jobId,
    operation: fields.operation,
    status: typeof fields.status === "number" ? fields.status : undefined,
    code: safeCode(fields.code),
    durationMs: typeof fields.durationMs === "number" ? Math.round(fields.durationMs) : undefined,
  };
  const compactEntry = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));

  if (level === "error") {
    console.error("Hoshizora AI event", compactEntry);
    return;
  }

  if (level === "warn") {
    console.warn("Hoshizora AI event", compactEntry);
    return;
  }

  console.info("Hoshizora AI event", compactEntry);
}

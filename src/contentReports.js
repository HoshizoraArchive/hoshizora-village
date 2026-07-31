export const CONTENT_REPORT_DETAILS_MAX_LENGTH = 1000;
export const CONTENT_REPORT_RESOLUTION_MAX_LENGTH = 2000;
export const CONTENT_REPORT_SUCCESS_MESSAGE =
  "観測局へ伝えました。\nご協力ありがとうございます。";
export const CONTENT_REPORT_DUPLICATE_MESSAGE =
  "この内容はすでに観測局へ伝えています。";
export const CONTENT_REPORT_ERROR_MESSAGE =
  "観測局へ送れませんでした。時間をおいてもう一度お試しください。";

export const CONTENT_REPORT_REASONS = Object.freeze([
  { key: "harassment", label: "嫌がらせ・いじめ" },
  { key: "hate_or_abuse", label: "差別・攻撃的な内容" },
  { key: "sexual_content", label: "性的な内容" },
  { key: "violence_or_danger", label: "暴力・危険行為" },
  { key: "self_harm", label: "自傷・自殺に関する危険な内容" },
  { key: "impersonation", label: "なりすまし" },
  { key: "spam_or_fraud", label: "スパム・詐欺" },
  { key: "personal_information", label: "個人情報の公開" },
  { key: "copyright", label: "著作権・権利侵害" },
  { key: "other", label: "その他" },
]);

export const CONTENT_REPORT_STATUSES = Object.freeze([
  { key: "open", label: "未確認" },
  { key: "reviewing", label: "確認中" },
  { key: "resolved", label: "対応済み" },
  { key: "dismissed", label: "対応なし" },
]);

const REASON_KEYS = new Set(CONTENT_REPORT_REASONS.map((reason) => reason.key));
const STATUS_KEYS = new Set(CONTENT_REPORT_STATUSES.map((status) => status.key));

function getRpcRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function normalizeOptionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function canReportContent({ currentUserId, targetId, targetOwnerId }) {
  return Boolean(
    currentUserId &&
      targetId &&
      targetOwnerId &&
      currentUserId !== targetOwnerId,
  );
}

export function validateContentReportInput({ details, reason, targetId, targetType }) {
  if (!targetId || !["post", "profile"].includes(targetType)) {
    return { error: "対象を確認できませんでした。", valid: false };
  }

  if (!REASON_KEYS.has(reason)) {
    return { error: "理由を選んでください。", valid: false };
  }

  const normalizedDetails = normalizeOptionalText(details);

  if (
    normalizedDetails &&
    Array.from(normalizedDetails).length > CONTENT_REPORT_DETAILS_MAX_LENGTH
  ) {
    return {
      error: `補足は${CONTENT_REPORT_DETAILS_MAX_LENGTH}文字以内で入力してください。`,
      valid: false,
    };
  }

  return { details: normalizedDetails, error: "", valid: true };
}

export function createContentReportSingleFlight() {
  let inFlight = null;

  return {
    async run(operation) {
      if (inFlight) {
        return inFlight;
      }

      inFlight = Promise.resolve().then(operation);

      try {
        return await inFlight;
      } finally {
        inFlight = null;
      }
    },
  };
}

export function createLatestContentReportRequestGuard() {
  let latestRequestId = 0;

  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },
    invalidate() {
      latestRequestId += 1;
    },
    isCurrent(requestId) {
      return requestId === latestRequestId;
    },
  };
}

export function getContentReportReviewDraft(report) {
  return {
    resolutionNote: report?.resolutionNote ?? "",
    status: report?.status ?? "open",
  };
}

export function isMissingContentReportsSchemaError(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();

  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    message.includes("content_reports") ||
    message.includes("create_content_report") ||
    message.includes("get_content_reports") ||
    message.includes("update_content_report")
  );
}

export function getContentReportReasonLabel(reasonKey) {
  return (
    CONTENT_REPORT_REASONS.find((reason) => reason.key === reasonKey)?.label ??
    "不明な理由"
  );
}

export function getContentReportStatusLabel(statusKey) {
  return (
    CONTENT_REPORT_STATUSES.find((status) => status.key === statusKey)?.label ??
    "不明な状態"
  );
}

export async function createContentReport(client, input) {
  const validation = validateContentReportInput(input);

  if (!validation.valid) {
    const error = new Error("CONTENT_REPORT_INVALID_INPUT");
    error.safeMessage = validation.error;
    throw error;
  }

  const { data, error } = await client.rpc("create_content_report", {
    p_details: validation.details,
    p_reason: input.reason,
    p_target_id: input.targetId,
    p_target_type: input.targetType,
  });

  if (error) {
    throw error;
  }

  const result = getRpcRow(data);

  if (!["created", "already_reported"].includes(result?.outcome)) {
    const rpcError = new Error("CONTENT_REPORT_NOT_ALLOWED");
    rpcError.outcome = result?.outcome ?? "unknown";
    throw rpcError;
  }

  return {
    outcome: result.outcome,
    reportId: result.report_id ?? null,
  };
}

export async function readContentReports(client, { limit = 100, status = null } = {}) {
  const normalizedStatus = status && STATUS_KEYS.has(status) ? status : null;
  const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { data, error } = await client.rpc("get_content_reports", {
    p_limit: normalizedLimit,
    p_status: normalizedStatus,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    createdAt: row.created_at,
    details: row.details ?? "",
    id: row.report_id,
    reason: row.reason,
    reporterDisplayName: row.reporter_display_name || "削除された村人",
    reporterId: row.reporter_id ?? null,
    reporterOriginalId: row.reporter_original_id,
    reporterUsername: row.reporter_username || "",
    resolutionNote: row.resolution_note ?? "",
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedByDisplayName: row.reviewed_by_display_name || "",
    snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot : {},
    status: row.report_status,
    targetOriginalId: row.target_original_id,
    targetPostId: row.target_post_id ?? null,
    targetProfileId: row.target_profile_id ?? null,
    targetReportCount: Number(row.target_report_count ?? 0),
    targetType: row.target_type,
  }));
}

export async function updateContentReport(client, { reportId, resolutionNote, status }) {
  const normalizedNote = normalizeOptionalText(resolutionNote);

  if (!reportId || !STATUS_KEYS.has(status)) {
    throw new Error("CONTENT_REPORT_INVALID_ADMIN_INPUT");
  }

  if (
    normalizedNote &&
    Array.from(normalizedNote).length > CONTENT_REPORT_RESOLUTION_MAX_LENGTH
  ) {
    throw new Error("CONTENT_REPORT_RESOLUTION_TOO_LONG");
  }

  const { data, error } = await client.rpc("update_content_report", {
    p_report_id: reportId,
    p_resolution_note: normalizedNote,
    p_status: status,
  });

  if (error) {
    throw error;
  }

  const result = getRpcRow(data);

  if (result?.outcome !== "updated") {
    throw new Error("CONTENT_REPORT_UPDATE_FAILED");
  }

  return {
    id: result.report_id,
    resolutionNote: result.resolution_note ?? "",
    reviewedAt: result.reviewed_at,
    reviewedBy: result.reviewed_by,
    status: result.report_status,
  };
}

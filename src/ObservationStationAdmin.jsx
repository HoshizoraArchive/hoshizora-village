import { useEffect, useMemo, useState } from "react";
import {
  CONTENT_REPORT_RESOLUTION_MAX_LENGTH,
  CONTENT_REPORT_STATUSES,
  getContentReportReasonLabel,
  getContentReportStatusLabel,
  isMissingContentReportsSchemaError,
  readContentReports,
  updateContentReport,
} from "./contentReports";
import { ERROR_OPERATION, getUserFacingError, logSafeError } from "./safeErrors";
import { supabase } from "./lib/supabaseClient";

function formatDateTime(value) {
  if (!value) {
    return "未設定";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTargetTitle(report) {
  if (report.targetType === "profile") {
    return report.snapshot.display_name || "削除された村人";
  }

  return String(report.snapshot.body || "本文のない流星便").slice(0, 80);
}

function SnapshotDetails({ report }) {
  const snapshot = report.snapshot ?? {};

  if (report.targetType === "profile") {
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <SnapshotField label="表示名" value={snapshot.display_name || "未設定"} />
        <SnapshotField label="ユーザー名" value={snapshot.username ? `@${snapshot.username}` : "未設定"} />
        <SnapshotField className="sm:col-span-2" label="自己紹介" value={snapshot.bio || "未設定"} />
        <SnapshotField className="sm:col-span-2" label="送信時のアイコン参照" value={snapshot.avatar_url || "未設定"} />
      </dl>
    );
  }

  const media = Array.isArray(snapshot.media) ? snapshot.media : [];

  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <SnapshotField label="投稿形式" value={snapshot.type || "不明"} />
      <SnapshotField label="公開状態" value={snapshot.visibility || "不明"} />
      <SnapshotField label="投稿日時" value={formatDateTime(snapshot.created_at)} />
      <SnapshotField label="メディア数" value={`${media.length}件`} />
      <SnapshotField className="sm:col-span-2" label="本文" value={snapshot.body || "本文なし"} />
      {media.length ? (
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-black text-slate-500">メディア情報</dt>
          <dd className="mt-2 space-y-2">
            {media.map((item, index) => (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2" key={`${item.storage_path ?? "media"}-${index}`}>
                <p className="text-xs font-bold text-slate-200">
                  {index + 1}. {item.media_type || "不明"}
                </p>
                <p className="mt-1 break-all text-[11px] leading-5 text-slate-500">
                  {item.storage_path || "保存先なし"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {item.mime_type || "形式不明"}
                  {item.duration_seconds ? ` / ${item.duration_seconds}秒` : ""}
                </p>
              </div>
            ))}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function SnapshotField({ className = "", label, value }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-black text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{String(value)}</dd>
    </div>
  );
}

export default function ObservationStationAdminScreen({ isAdmin, onBack }) {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draftStatus, setDraftStatus] = useState("open");
  const [resolutionNote, setResolutionNote] = useState("");
  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedId) ?? null,
    [reports, selectedId],
  );

  async function loadReports(nextStatus = statusFilter) {
    if (!isAdmin) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const nextReports = await readContentReports(supabase, {
        status: nextStatus || null,
      });
      setReports(nextReports);
      setSelectedId((currentId) =>
        nextReports.some((report) => report.id === currentId)
          ? currentId
          : nextReports[0]?.id ?? null,
      );
    } catch (loadError) {
      logSafeError(ERROR_OPERATION.REPORT_LOAD, loadError);
      setError(
        isMissingContentReportsSchemaError(loadError)
          ? "観測局のDB更新がまだ適用されていません。"
          : getUserFacingError(loadError, ERROR_OPERATION.REPORT_LOAD),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReports("");
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedReport) {
      return;
    }

    setDraftStatus(selectedReport.status);
    setResolutionNote(selectedReport.resolutionNote);
    setMessage("");
    setError("");
  }, [selectedReport?.id]);

  async function handleStatusFilterChange(event) {
    const nextStatus = event.target.value;
    setStatusFilter(nextStatus);
    setMessage("");
    await loadReports(nextStatus);
  }

  async function handleUpdate(event) {
    event.preventDefault();

    if (!selectedReport || saving) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await updateContentReport(supabase, {
        reportId: selectedReport.id,
        resolutionNote,
        status: draftStatus,
      });
      await loadReports(statusFilter);
      setMessage("観測局の確認状態を更新しました。");
    } catch (saveError) {
      logSafeError(ERROR_OPERATION.REPORT_SAVE, saveError);
      setError(getUserFacingError(saveError, ERROR_OPERATION.REPORT_SAVE));
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl">
        <section className="glass-panel p-5">
          <h1 className="text-xl font-black text-white">この画面は表示できません。</h1>
          <button
            className="mt-5 min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300"
            onClick={onBack}
            type="button"
          >
            設定へ戻る
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl">
      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-comet">Observation Station</p>
            <h1 className="mt-1 text-2xl font-black text-white">観測局</h1>
          </div>
          <button
            className="min-h-10 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300"
            onClick={onBack}
            type="button"
          >
            設定へ戻る
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-xs font-black text-slate-400">
            状態
            <select
              className="mt-1 block min-h-11 rounded-2xl border border-white/10 bg-night-950 px-3 text-sm text-white"
              disabled={loading}
              onChange={(event) => void handleStatusFilterChange(event)}
              value={statusFilter}
            >
              <option value="">すべて</option>
              {CONTENT_REPORT_STATUSES.map((status) => (
                <option key={status.key} value={status.key}>{status.label}</option>
              ))}
            </select>
          </label>
          <button
            className="min-h-11 rounded-2xl border border-comet/25 bg-comet/10 px-4 text-xs font-black text-comet disabled:opacity-50"
            disabled={loading}
            onClick={() => void loadReports()}
            type="button"
          >
            再読み込み
          </button>
        </div>

        {error || message ? (
          <p
            className={`mt-4 rounded-2xl border px-4 py-3 text-xs leading-6 ${
              error
                ? "border-sakura/30 bg-sakura/10 text-sakura"
                : "border-comet/25 bg-comet/10 text-comet"
            }`}
            role={error ? "alert" : "status"}
          >
            {error || message}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]">
          <section aria-label="観測局へ届いた内容" className="min-w-0">
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">観測局を確認中...</p>
            ) : reports.length ? (
              <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                {reports.map((report) => (
                  <button
                    aria-pressed={report.id === selectedId}
                    className={`w-full px-3 py-4 text-left transition ${
                      report.id === selectedId ? "bg-comet/10" : "hover:bg-white/[0.04]"
                    }`}
                    key={report.id}
                    onClick={() => setSelectedId(report.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-0.5 text-[10px] font-black text-comet">
                        {getContentReportStatusLabel(report.status)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        {report.targetType === "post" ? "流星便" : "村人"}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-black leading-6 text-white">
                      {getTargetTitle(report)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {getContentReportReasonLabel(report.reason)}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {formatDateTime(report.createdAt)} / 同一対象 {report.targetReportCount}件
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">該当する内容はありません。</p>
            )}
          </section>

          <section aria-label="観測局の詳細" className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            {selectedReport ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SnapshotField label="送信者" value={`${selectedReport.reporterDisplayName}${selectedReport.reporterUsername ? ` (@${selectedReport.reporterUsername})` : ""}`} />
                  <SnapshotField label="送信日時" value={formatDateTime(selectedReport.createdAt)} />
                  <SnapshotField label="送信者ID" value={selectedReport.reporterOriginalId} />
                  <SnapshotField label="対象ID" value={selectedReport.targetOriginalId} />
                  <SnapshotField label="対象" value={selectedReport.targetType === "post" ? "流星便" : "村人"} />
                  <SnapshotField label="理由" value={getContentReportReasonLabel(selectedReport.reason)} />
                  <SnapshotField className="sm:col-span-2" label="補足" value={selectedReport.details || "補足なし"} />
                </div>

                <div className="mt-5 border-t border-white/10 pt-5">
                  <h2 className="text-sm font-black text-white">送信時点の内容</h2>
                  <div className="mt-3">
                    <SnapshotDetails report={selectedReport} />
                  </div>
                </div>

                <form className="mt-5 border-t border-white/10 pt-5" onSubmit={handleUpdate}>
                  <label className="text-xs font-black text-slate-400">
                    確認状態
                    <select
                      className="mt-1 block min-h-11 w-full rounded-2xl border border-white/10 bg-night-950 px-3 text-sm text-white"
                      disabled={saving}
                      onChange={(event) => setDraftStatus(event.target.value)}
                      value={draftStatus}
                    >
                      {CONTENT_REPORT_STATUSES.map((status) => (
                        <option key={status.key} value={status.key}>{status.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-4 block text-xs font-black text-slate-400" htmlFor="content-report-resolution-note">
                    対応メモ
                  </label>
                  <textarea
                    className="mt-1 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-night-950 px-3 py-3 text-sm leading-7 text-white outline-none focus:border-comet/40"
                    disabled={saving}
                    id="content-report-resolution-note"
                    maxLength={CONTENT_REPORT_RESOLUTION_MAX_LENGTH}
                    onChange={(event) => setResolutionNote(event.target.value)}
                    value={resolutionNote}
                  />
                  <p className="mt-1 text-right text-[11px] text-slate-500">
                    {Array.from(resolutionNote).length}/{CONTENT_REPORT_RESOLUTION_MAX_LENGTH}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    最終確認: {formatDateTime(selectedReport.reviewedAt)}
                    {selectedReport.reviewedByDisplayName ? ` / ${selectedReport.reviewedByDisplayName}` : ""}
                  </p>
                  <button
                    className="mt-4 min-h-11 w-full rounded-2xl border border-comet/30 bg-comet/15 px-4 text-xs font-black text-comet disabled:opacity-50"
                    disabled={saving}
                    type="submit"
                  >
                    {saving ? "更新中..." : "確認状態を更新"}
                  </button>
                </form>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">左の一覧から内容を選んでください。</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

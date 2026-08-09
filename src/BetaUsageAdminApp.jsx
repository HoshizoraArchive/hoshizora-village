import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const JST_TIME_ZONE = "Asia/Tokyo";

function getJstDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatJstTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatJstDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function getSourceLabel(source) {
  return source === "foreground" ? "foreground" : "launch";
}

function getModeLabel(mode) {
  return mode === "standalone" ? "PWA" : "ブラウザ";
}

function getPlatformLabel(platform) {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  if (platform === "desktop") return "Desktop";
  return "Other";
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    event_count: Number(row.event_count ?? 0),
    events: Array.isArray(row.events) ? row.events : [],
  }));
}

function BetaResidentCard({ resident }) {
  const hasEvents = resident.event_count > 0;

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black text-white">{resident.display_name}</h2>
          <p className="mt-1 truncate text-xs text-slate-500">
            {resident.username ? `@${resident.username}` : "ユーザー名なし"}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black ${hasEvents ? "text-comet" : "text-slate-600"}`}>
            {resident.event_count}
          </p>
          <p className="text-[10px] font-black tracking-[0.16em] text-slate-500">OPENS</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/8 bg-night-950/35 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-black text-slate-500">最終起動</span>
          <span className={`text-sm font-black ${hasEvents ? "text-white" : "text-slate-600"}`}>
            {hasEvents ? formatJstDateTime(resident.last_opened_at) : "なし"}
          </span>
        </div>
      </div>

      {hasEvents ? (
        <div className="mt-4 space-y-2">
          {resident.events.map((event, index) => (
            <div
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5"
              key={`${event.opened_at ?? "open"}-${index}`}
            >
              <span className="min-w-[72px] text-sm font-black tabular-nums text-white">
                {formatJstTime(event.opened_at)}
              </span>
              <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-0.5 text-[10px] font-black text-comet">
                {getSourceLabel(event.source)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                {getModeLabel(event.app_mode)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                {getPlatformLabel(event.platform)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-sm text-slate-600">
          この日は起動なし
        </p>
      )}
    </article>
  );
}

export default function BetaUsageAdminApp() {
  const [selectedDay, setSelectedDay] = useState(() => getJstDateString());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState("checking");
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);

  const activeCount = useMemo(
    () => rows.filter((resident) => resident.event_count > 0).length,
    [rows],
  );

  const loadDashboard = useCallback(async (day = selectedDay) => {
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc("get_beta_usage_dashboard", {
      p_day: day || null,
    });

    if (rpcError) {
      if (rpcError.code === "42501" || /forbidden/i.test(rpcError.message ?? "")) {
        setAuthState("forbidden");
        setRows([]);
      } else {
        setError("β利用データを読み込めませんでした。少し待ってから再読み込みしてください。");
      }
      setLoading(false);
      return;
    }

    setAuthState("ready");
    setRows(normalizeRows(data));
    setLoadedAt(new Date());
    setLoading(false);
  }, [selectedDay]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (sessionError || !data?.session) {
        setAuthState("signed-out");
        setLoading(false);
        return;
      }

      await loadDashboard(selectedDay);
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [loadDashboard, selectedDay]);

  function handleDayChange(event) {
    setSelectedDay(event.target.value || getJstDateString());
  }

  if (authState === "signed-out") {
    return (
      <main className="min-h-screen bg-night-950 px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <p className="text-xs font-black tracking-[0.18em] text-comet">BETA OBSERVATION</p>
          <h1 className="mt-2 text-2xl font-black">ログインが必要です</h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            星空Villageへログインした状態で、もう一度この運営画面を開いてください。
          </p>
          <a className="mt-5 inline-flex min-h-11 items-center rounded-2xl border border-comet/25 bg-comet/10 px-4 text-sm font-black text-comet" href="/">
            星空Villageへ戻る
          </a>
        </section>
      </main>
    );
  }

  if (authState === "forbidden") {
    return (
      <main className="min-h-screen bg-night-950 px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <p className="text-xs font-black tracking-[0.18em] text-sakura">ADMIN ONLY</p>
          <h1 className="mt-2 text-2xl font-black">この画面は表示できません</h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">β利用ログは星空Village運営だけが確認できます。</p>
          <a className="mt-5 inline-flex min-h-11 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-black text-slate-300" href="/">
            星空Villageへ戻る
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-night-950 px-4 py-6 text-white sm:py-10">
      <section className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.18em] text-comet">BETA OBSERVATION</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">β利用ダッシュボード</h1>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              推測ではなく、app_open_events のサーバー時刻だけで確認します。
            </p>
          </div>
          <a className="inline-flex min-h-10 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300" href="/">
            Villageへ戻る
          </a>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
            <span className="block text-[11px] font-black text-slate-500">確認する日（日本時間）</span>
            <input
              className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-night-950 px-3 text-sm font-black text-white"
              max={getJstDateString()}
              onChange={handleDayChange}
              type="date"
              value={selectedDay}
            />
          </label>
          <button
            className="min-h-14 rounded-3xl border border-comet/25 bg-comet/10 px-5 text-sm font-black text-comet disabled:opacity-50 sm:min-w-32"
            disabled={loading}
            onClick={() => void loadDashboard(selectedDay)}
            type="button"
          >
            {loading ? "確認中..." : "再読み込み"}
          </button>
        </div>

        <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-black text-slate-500">利用あり</p>
              <p className="mt-1 text-3xl font-black text-comet">
                {loading ? "—" : `${activeCount}/${rows.length}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-500">対象</p>
              <p className="mt-1 text-lg font-black text-white">β村人</p>
              <p className="mt-1 text-[11px] text-slate-600">profile_cohorts: beta_resident</p>
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-500">最終更新</p>
              <p className="mt-1 text-sm font-black text-white">
                {loadedAt ? formatJstDateTime(loadedAt.toISOString()) : "—"}
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <p className="mt-4 rounded-2xl border border-sakura/30 bg-sakura/10 px-4 py-3 text-sm font-bold text-sakura" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {loading && rows.length === 0 ? (
            <p className="md:col-span-2 py-12 text-center text-sm text-slate-500">β村人の利用状況を確認中...</p>
          ) : rows.length ? (
            rows.map((resident) => <BetaResidentCard key={resident.profile_id} resident={resident} />)
          ) : (
            <p className="md:col-span-2 rounded-3xl border border-dashed border-white/10 py-12 text-center text-sm text-slate-500">
              β村人がまだ登録されていません。
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] leading-6 text-slate-600">
          起動回数は launch / foreground をそれぞれ1件として集計。認証更新・投稿・共鳴などは代替指標に使いません。
        </p>
      </section>
    </main>
  );
}

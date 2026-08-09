import { useCallback, useEffect, useState } from "react";
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
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatJstDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
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

function getModeLabel(mode) {
  return mode === "standalone" ? "PWA" : "ブラウザ";
}

function getPlatformLabel(platform) {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  if (platform === "desktop") return "Desktop";
  return "Other";
}

function normalizeSummary(data) {
  const source = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    day: source.day ?? null,
    eventCount: Number(source.event_count ?? 0),
    events: Array.isArray(source.events) ? source.events : [],
  };
}

export default function SignupOpenAdminApp() {
  const [selectedDay, setSelectedDay] = useState(() => getJstDateString());
  const [summary, setSummary] = useState(() => normalizeSummary(null));
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState("checking");
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);

  const loadDashboard = useCallback(async (day = selectedDay) => {
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc("get_signup_open_dashboard", {
      p_day: day || null,
    });

    if (rpcError) {
      if (rpcError.code === "42501" || /forbidden/i.test(rpcError.message ?? "")) {
        setAuthState("forbidden");
        setSummary(normalizeSummary(null));
      } else {
        setError("会員登録画面の利用データを読み込めませんでした。少し待ってから再読み込みしてください。");
      }
      setLoading(false);
      return;
    }

    setAuthState("ready");
    setSummary(normalizeSummary(data));
    setLoadedAt(new Date());
    setLoading(false);
  }, [selectedDay]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

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
          <p className="text-xs font-black tracking-[0.18em] text-sakura">SIGNUP OBSERVATION</p>
          <h1 className="mt-2 text-2xl font-black">ログインが必要です</h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            星空Villageへ運営アカウントでログインした状態で、もう一度この画面を開いてください。
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
          <p className="mt-3 text-sm leading-7 text-slate-400">会員登録画面の利用ログは星空Village運営だけが確認できます。</p>
          <a className="mt-5 inline-flex min-h-11 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-black text-slate-300" href="/">
            星空Villageへ戻る
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-night-950 px-4 py-6 text-white sm:py-10">
      <section className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.18em] text-sakura">SIGNUP OBSERVATION</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">入村手続き観測</h1>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              「入村手続き（会員登録）」を実際に開いた回数を、サーバー時刻で確認します。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-10 items-center rounded-2xl border border-comet/20 bg-comet/10 px-4 text-xs font-black text-comet" href="/admin/beta-usage">
              β利用を見る
            </a>
            <a className="inline-flex min-h-10 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-black text-slate-300" href="/">
              Villageへ戻る
            </a>
          </div>
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
            className="min-h-14 rounded-3xl border border-sakura/25 bg-sakura/10 px-5 text-sm font-black text-sakura disabled:opacity-50 sm:min-w-32"
            disabled={loading}
            onClick={() => void loadDashboard(selectedDay)}
            type="button"
          >
            {loading ? "確認中..." : "再読み込み"}
          </button>
        </div>

        <section className="mt-4 rounded-3xl border border-sakura/20 bg-sakura/[0.06] p-5">
          <p className="text-[11px] font-black text-slate-500">会員登録画面を開いたセッション</p>
          <p className={`mt-1 text-5xl font-black ${summary.eventCount > 0 ? "text-sakura" : "text-slate-600"}`}>
            {loading ? "—" : summary.eventCount}
          </p>
          <p className="mt-3 text-xs leading-6 text-slate-400">
            同じブラウザタブのセッションでは1回だけ記録します。これは「画面を開いた」記録で、会員登録完了とは別です。
          </p>
        </section>

        {error ? (
          <p className="mt-4 rounded-2xl border border-sakura/30 bg-sakura/10 px-4 py-3 text-sm font-bold text-sakura" role="alert">
            {error}
          </p>
        ) : null}

        <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black tracking-[0.16em] text-slate-500">OPEN EVENTS</p>
              <h2 className="mt-1 text-lg font-black text-white">開いた時刻</h2>
            </div>
            <p className="text-[11px] text-slate-600">
              最終更新 {loadedAt ? formatJstDateTime(loadedAt.toISOString()) : "—"}
            </p>
          </div>

          <div className="mt-4 space-y-2">
            {loading && summary.events.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">会員登録画面の利用状況を確認中...</p>
            ) : summary.events.length ? (
              summary.events.map((event, index) => (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-night-950/35 px-3 py-3"
                  key={`${event.opened_at ?? "signup-open"}-${index}`}
                >
                  <span className="min-w-[72px] text-sm font-black tabular-nums text-white">
                    {formatJstTime(event.opened_at)}
                  </span>
                  <span className="rounded-full border border-sakura/20 bg-sakura/10 px-2 py-0.5 text-[10px] font-black text-sakura">
                    入村手続き
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {getModeLabel(event.app_mode)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {getPlatformLabel(event.platform)}
                  </span>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-slate-600">
                この日はまだ入村手続きを開いた記録がありません。
              </p>
            )}
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] leading-6 text-slate-600">
          メールアドレス・IPアドレス・生のUser-Agentはこの計測テーブルには保存しません。端末はiOS / Android / Desktop / Otherの粗い分類だけです。
        </p>
      </section>
    </main>
  );
}

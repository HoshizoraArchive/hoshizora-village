const STAR_MOVIE_SAMPLE_URL = "data:video/mp4;base64,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";
const USER_YOUTUBE_VIDEO_ID = "Kh34c7MfaBE";

function PreviewAction({ children }) {
  return (
    <button
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 font-bold text-slate-400"
      type="button"
    >
      {children}
    </button>
  );
}

function ProductionCardShell({ children, label, time = "23:40" }) {
  return (
    <article className="glass-panel post-card-panel post-card group relative overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-comet/25 to-sakura/20" />
      <div className="post-card-content p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl border border-comet/25 bg-night-950/55 text-lg font-black text-comet shadow-[0_0_22px_rgba(125,223,255,0.14)]">
            星
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-white">確認用住人</h3>
              <span className="rounded-full border border-comet/20 bg-comet/10 px-2 py-0.5 text-[11px] font-bold text-comet">
                流星便
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm text-slate-500">@media_glass_preview</span>
              <span className="text-sm text-slate-500">· {time}</span>
            </div>
          </div>
        </div>

        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-slate-100">{label}</p>

        {children}

        <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-400">
          <PreviewAction>♡ 0 共鳴</PreviewAction>
          <PreviewAction>✎ 星文 0</PreviewAction>
          <PreviewAction>✦ Archive</PreviewAction>
        </div>
      </div>
    </article>
  );
}

function YouTubeProductionCard() {
  return (
    <ProductionCardShell
      label={
        "送ってもらったYouTube動画を表示しています。\nこの確認画面だけ通常のYouTube埋め込みを使い、iPhoneで再生確認しやすくしています。"
      }
    >
      <div
        className="post-video-shell post-video-youtube relative mt-4 aspect-video overflow-hidden rounded-2xl border border-comet/20 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.28)]"
        data-card-action="true"
      >
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="star-movie-surface relative z-[2] h-full w-full"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          src={`https://www.youtube.com/embed/${USER_YOUTUBE_VIDEO_ID}?playsinline=1&rel=0`}
          title="YouTube video player"
        />
      </div>
    </ProductionCardShell>
  );
}

function UploadProductionCard() {
  return (
    <ProductionCardShell
      label="下は外部サーバーを使わないH.264検証用動画です。自動再生するので、再生中の透け方をそのまま確認できます。"
      time="23:39"
    >
      <div
        className="post-video-shell post-video-upload mt-4 overflow-hidden rounded-2xl border border-white/10 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.22)]"
        data-card-action="true"
      >
        <div className="post-video-viewport relative aspect-video bg-black">
          <video
            autoPlay
            className="star-movie-surface relative z-[2] h-full w-full bg-black object-contain"
            controls
            loop
            muted
            playsInline
            preload="auto"
            src={STAR_MOVIE_SAMPLE_URL}
          />
        </div>
      </div>
    </ProductionCardShell>
  );
}

export default function MobileMediaGlassPreview() {
  return (
    <main className="cosmic-background min-h-[100dvh] px-4 pb-12 pt-6 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 px-1">
          <p className="text-xs font-black tracking-[0.16em] text-comet/80">PR #269 / MOBILE CHECK</p>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            上は指定YouTube、下は端末内だけで再生できる検証用動画。透過値は変えず、再生確認だけ直しています。
          </p>
        </div>

        <div className="content-feed-list space-y-5">
          <YouTubeProductionCard />
          <UploadProductionCard />
        </div>
      </div>
    </main>
  );
}

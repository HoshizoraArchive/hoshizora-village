const STAR_MOVIE_SAMPLE_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const STAR_MOVIE_SAMPLE_POSTER =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg";
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

function ProductionCardShell({ children, label, time = "23:32" }) {
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
        "指定してもらったYouTube動画を、本番のYouTube付き流星便と同じ埋め込み構造で表示しています。\n実際に再生して、再生中も背景の街が見えるか確認できます。"
      }
    >
      <div
        className="post-video-shell post-video-youtube relative mt-4 aspect-video overflow-hidden rounded-2xl border border-comet/20 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.28)]"
        data-card-action="true"
      >
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="star-movie-surface h-full w-full"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          src={`https://www.youtube-nocookie.com/embed/${USER_YOUTUBE_VIDEO_ID}?enablejsapi=1`}
          title="YouTube video player"
        />
      </div>
    </ProductionCardShell>
  );
}

function UploadProductionCard() {
  return (
    <ProductionCardShell
      label="星映の再生中を確認するため、実際に再生できる検証用MP4を本番の星映video要素と同じ構造で置いています。"
      time="23:31"
    >
      <div
        className="post-video-shell post-video-upload mt-4 overflow-hidden rounded-2xl border border-white/10 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.22)]"
        data-card-action="true"
      >
        <div className="post-video-viewport relative aspect-video bg-black">
          <video
            className="star-movie-surface h-full w-full bg-black object-contain"
            controls
            playsInline
            poster={STAR_MOVIE_SAMPLE_POSTER}
            preload="metadata"
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
            本番投稿カードと同じ構造の中で、実際に再生できるYouTubeと星映を確認します。
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

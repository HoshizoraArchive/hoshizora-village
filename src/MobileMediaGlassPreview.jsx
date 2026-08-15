const uploadPreviewSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#4cc9f0"/>
      <stop offset="0.48" stop-color="#7b61ff"/>
      <stop offset="1" stop-color="#ff70b7"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.26" r="0.48">
      <stop offset="0" stop-color="#fff6cf" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#fff6cf" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="960" height="540" fill="url(#sky)"/>
  <rect width="960" height="540" fill="url(#glow)"/>
  <circle cx="760" cy="132" r="54" fill="#fff7cf"/>
  <path d="M0 390 C170 310 290 430 430 356 C590 272 720 430 960 328 V540 H0Z" fill="#061027" fill-opacity="0.72"/>
  <g fill="#ffffff" fill-opacity="0.9">
    <circle cx="120" cy="92" r="4"/><circle cx="210" cy="158" r="3"/><circle cx="346" cy="84" r="5"/>
    <circle cx="478" cy="140" r="3"/><circle cx="604" cy="82" r="4"/><circle cx="878" cy="94" r="3"/>
  </g>
  <text x="54" y="475" fill="#ffffff" font-size="38" font-family="sans-serif" font-weight="700">星映 preview</text>
</svg>
`)}`;

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

function ProductionCardShell({ children, label, time = "23:21" }) {
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
    <ProductionCardShell label={"YouTube付き流星便の確認用です。\n本番投稿カードの中で動画面がどう透けるかを確認します。"}>
      <div
        className="post-video-shell post-video-youtube relative mt-4 aspect-video overflow-hidden rounded-2xl border border-comet/20 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.28)]"
        data-card-action="true"
      >
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="star-movie-surface block h-full w-full border-0"
          src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0"
          title="Mobile media glass YouTube preview"
        />
      </div>
    </ProductionCardShell>
  );
}

function UploadProductionCard() {
  return (
    <ProductionCardShell label="星映付き流星便の確認用です。下は本番の星映サムネイルと同じ構造です。" time="23:20">
      <div
        className="post-video-shell post-video-upload mt-4 overflow-hidden rounded-2xl border border-white/10 bg-night-950/45 shadow-[0_18px_55px_rgba(3,7,18,0.22)]"
        data-card-action="true"
      >
        <div className="post-video-viewport relative aspect-video bg-black">
          <button
            aria-label="流星便の星映を再生"
            className="group relative h-full w-full overflow-hidden bg-night-950 text-left outline-none focus-visible:ring-4 focus-visible:ring-comet/30"
            type="button"
          >
            <img
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              draggable={false}
              src={uploadPreviewSvg}
            />
            <span className="absolute inset-0 bg-night-950/15" />
            <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-white/20 text-2xl text-white shadow-[0_0_30px_rgba(125,223,255,0.35)] backdrop-blur-md transition group-hover:scale-105">
              ▶
            </span>
          </button>
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
            本番と同じ投稿カードの構造・クラス内で、YouTubeと星映の透け方だけを確認します。
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

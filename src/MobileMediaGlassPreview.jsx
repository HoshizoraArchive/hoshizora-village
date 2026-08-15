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

export default function MobileMediaGlassPreview() {
  return (
    <main className="cosmic-background min-h-[100dvh] px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-md rounded-[28px] border border-white/15 bg-night-950/30 p-4 backdrop-blur-md">
        <p className="text-xs font-semibold tracking-[0.22em] text-cyan-200/80">PR #269 MOBILE CHECK</p>
        <h1 className="mt-2 text-xl font-bold">動画ガラス確認</h1>
        <p className="mt-2 text-sm leading-6 text-white/75">
          背景の星空Villageが動画面の向こうに見えるかを確認する専用画面です。
        </p>

        <div className="mt-6">
          <p className="text-sm font-semibold text-white/90">YouTube</p>
          <div
            className="post-video-shell post-video-youtube relative mt-3 w-full max-w-[100%] overflow-hidden rounded-2xl border border-comet/20 bg-night-950/45 shadow-[0_18px_44px_rgba(0,0,0,0.28)]"
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              className="star-movie-surface block h-full w-full border-0"
              src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0"
              title="Mobile media glass YouTube preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>

        <div className="mt-7">
          <p className="text-sm font-semibold text-white/90">星映サムネイル</p>
          <div className="post-video-shell post-video-upload mt-3 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
            <div className="post-video-viewport w-full overflow-hidden bg-black" style={{ aspectRatio: "16 / 9" }}>
              <button
                type="button"
                aria-label="星映ガラスの見た目を確認"
                className="group relative block h-full w-full bg-night-950"
              >
                <img
                  src={uploadPreviewSvg}
                  alt="星映ガラス確認用サムネイル"
                  className="block h-full w-full object-cover"
                />
                <span className="absolute inset-0 bg-night-950/15" aria-hidden="true" />
                <span
                  className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/20 text-2xl shadow-lg"
                  aria-hidden="true"
                >
                  ▶
                </span>
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs leading-5 text-white/55">
          この画面はDeploy Previewの確認用です。本番データやPreview DBは変更しません。
        </p>
      </section>
    </main>
  );
}

# 星映観測モード保守案内

星映観測モードの見た目を調整するときの変更箇所を示す。数値の正本は
この文書ではなく、下記の専用コンポーネントと専用CSSブロックとする。

## フレームと開口形状

- フレーム画像のパス:
  `src/StarMovieObservationWindow.jsx` の
  `STAR_MOVIE_OBSERVATION_FRAME_ASSET`
- フレーム画像本体:
  `public/images/star-movie-observation-window-frame.png`
- 44点の開口形状:
  `src/StarMovieObservationWindow.jsx` の
  `STAR_MOVIE_OBSERVATION_APERTURE_PATH`
- SVG `clipPath` の組み立て:
  `StarMovieObservationWindow` コンポーネント

フレームを差し替える場合も、動画再生やモーダル制御は変更せず、
この専用コンポーネント内で画像と開口形状を管理する。

## サイズと動画配置

関連する値は `src/index.css` の
`/* Visual maintenance map: docs/star-movie-observation-mode.md */`
から始まる連続した専用ブロックにまとめている。

- 観測窓全体の最大サイズ:
  `.star-movie-observation-content`
- フレーム比率、開口部の位置、左右の微調整値:
  `.star-movie-observation-window` のCSSカスタムプロパティ
- YouTubeの配置:
  `.star-movie-observation-youtube-frame` と、その直下の
  `.star-movie-surface`
- アップロード動画の配置:
  `.star-movie-observation-upload-video`
- 16:9アップロード動画の微調整:
  `.star-movie-observation-upload-video.is-16-by-9`
- 16:9判定:
  `src/StarMovieObservationMode.jsx` の
  `handleUploadVideoMetadata`

## 動画の透過度

3つの表示状態は `src/index.css` の同じ専用ブロックで管理する。

- スマホを含む基準値: `.star-movie-surface`
- 通常PC再生: `@media (min-width: 1024px)` 内の
  `.star-movie-surface`
- PCの星映観測モード: 同じmedia query内の
  `.star-movie-observation-surface`

観測モードだけを調整するときは
`.star-movie-observation-surface` を変更し、通常再生の値を変更しない。

## 変更時の確認

- 通常再生と観測モードの入口が分離されたままか
- YouTubeとアップロード動画の両方が操作できるか
- フレーム外への映像漏れや横・縦スクロールがないか
- Escape、ブラウザバック、フォーカストラップ、フォーカス復帰が動くか
- PC通常再生とスマホ再生の見た目が変わっていないか
- フレーム画像を意図せず変更していないか

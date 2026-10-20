# App.jsx 分割: コンポーネントと依存関係の正本

## 目的

`src/App.jsx` に集中していた表示コンポーネントと純粋な計算処理を分離し、既存のUI・データ更新・認証・通知・メディア動作を維持する。

## 現在の責務

- `src/App.jsx`: ルーティング、認証セッション、Supabaseデータ取得・mutation、画面間の状態・イベント接続。分割した表示処理を import して組み立てる。
- `src/components/MediaEditors.jsx`: アバター／カバーの切り抜きと動画トリミングダイアログ。
- `src/components/MediaDraftPreviews.jsx`: 流星便作成時の添付プレビュー。
- `src/components/PostMediaViews.jsx`: YouTube／動画／画像と星映観測モードとの連携。
- `src/components/AvatarFrame.jsx`: 星影と装飾フレーム。
- `src/components/ProfileCards.jsx`: プロフィール・公開プロフィールと編集表示。
- `src/components/AuthAndLegalScreens.jsx`: ログイン／入村、利用規約・プライバシーポリシーの画面とモーダル。
- `src/components/PushNotificationTestCard.jsx`: 通知許可・端末登録・テスト送信のUI。
- `src/components/BottomNav.jsx`: モバイル5タブナビゲーション。
- `src/components/BackgroundEffects.jsx`: 星空の背景と前景。
- `src/components/BlackHoleConfirmationDialog.jsx`: ブラックホール確認ダイアログ。
- `src/components/Panel.jsx`: 汎用セクション枠。
- `src/lib/mediaEditorUtils.js`: メディア制約値・切り抜き座標・表示書式（DOM依存なし）。
- `src/lib/profileUi.js`: デフォルトプロフィール表現と星影の文字。
- `src/lib/appSiteConfig.js`: 公式サイトへのリンク。
- `src/lib/postTextUtils.js`: 流星タグ正規化・本文リンク・YouTube/Suno URL認識・文字数判定・文字数上限。DOM・Reactには依存しない。
- `src/components/LinkedText.jsx`: 投稿・星文・プロフィールで共用するURL・タグ表示。
- `src/components/PostComposer.jsx`: 流星便作成UI、キーボード位置、テキストエリア。投稿状態や送信コールバックはAppが所有。
- `src/components/PostCard.jsx`: 流星便カード・操作ボタン・星文ツリー表示。共鳴・Archive・報告・編集・削除の状態更新処理はAppが所有。

## 必須の設計上の注意

1. `App.jsx` に画面内だけで使う新しい表示コンポーネントを追加しない。既存の担当モジュールを先に確認する。
2. 状態の所有者とUI propsの契約を不用意に変えない。Hooks・Auth・データ更新処理の移動は、今回とは別の段階として回帰テストと独立監査を行う。
3. 共通処理を増やす際は、同じ処理が本当に複数箇所で使われることを確認し、`App.jsx` と子モジュール間に循環 import を作らない。
4. `vite.config.js` の `profileActionLayoutPlugin` は、現在 `src/components/ProfileCards.jsx` にある `ProfileCard` の既存アクション配置をビルド時に変換する。移動・書き換え時は `scripts/profile-action-layout-transform.mjs` と専用テストを同時に確認する。
5. コード文面を検査する既存テストは、`App.jsx` だけでなく実際に関数を所有するコンポーネントも読み取る。検査項目そのものを削除してテストを通さない。
6. この分割はモジュールの物理的整理であり、動的 import やコード分割による初期JSバンドル縮小を主張しない。

## 検証

```sh
npm test
npm run build
CI=1 node /private/tmp/chia-hardening-tools/node_modules/@playwright/test/cli.js test --config playwright.config.mjs
```

Playwright実行パスは作業機固有のため、別環境ではインストール済みの `@playwright/test` CLIを使うこと。
Supabase E2Eテストはローカルのモック経路で実行し、Productionの認証・データ・通知設定に変更を加えない。

## 次の段階

`PostCard`・`Composer` と隣接する表示・文字解析は第2段階で独立モジュール化した。残る最大の対象は `App()` 本体（状態・ルーティング・非同期処理・Auth・更新処理）とその他画面コンポーネントである。副作用・更新順序・Hooksの同一性を保つため、状態管理の切出しは個別の受入シナリオと独立監査を設けた別PRで実施する。

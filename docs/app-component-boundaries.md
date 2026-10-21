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

## 第3段階：状態所有の境界
- `src/hooks/useVillageRouteViewState.js`: 画面遷移・公開プロフィール・流星タグ一覧・共有の表示状態。URL解釈と画面ロードの副作用はApp側。
- `src/hooks/usePostMediaDraftState.js`: 流星便下書きとメディア編集用のstate/ref。メディアの解放・録画変換・投稿mutationはApp側。
- `src/hooks/useStarLetterUiState.js`: 星文の下書き・スレッドUIとリクエスト世代ref。Authユーザー切替時のリセットと通信・revision処理はApp側。
- `src/hooks/useFeedbackUiState.js`: 問い合わせのフォーム表示と保存状態。投稿APIはApp側。

Hookの移動では**元の呼出し順序・lazy initializer・refの独立性を変えない**。React HooksはUI/DBの新規権限を持たない。Auth/PW回復処理やSupabase I/Oの切出しは、専用実機シナリオと監査を持つ別PRへ分ける。

## 第4段階：動画下書きのセッション隔離
- `src/lib/postMediaTaskGate.js`: 動画メタデータ・トリミング・自動表紙・手動表紙cropの非同期結果に世代番号とAuthセッションを紐付ける軽量ゲート。
- `src/App.jsx`: ログアウト・アカウント変更・動画削除・アンマウント時に実行中の動画処理を無効化。可能なら変換キャンセルを即時要求し、古い非同期応答はUI更新へ流さず生成済みObject URLを解放。
- 手動の表紙選択は、自動生成の未完了結果より優先。別の動画・別のアカウントの表紙が後から上書きされない。
- 既存の投稿・メディア保存・Auth・DB処理は維持。セッション外の古い処理が完了しても新ユーザーの下書きへ反映しないことを専用テストで検証する。

## 第5段階：認証セッションのライフサイクル
- `src/hooks/useAuthSessionLifecycle.js`: Supabase Authセッション初期読出し、`onAuthStateChange`イベント購読、メール確認URL・パスワード再設定リンクの検証状態遷移、タイマー・購読解除を所有。
- `src/App.jsx`: Auth state/ref、ログアウト後の表示・データ初期化、認証アクション・規約同意・通知/RLSなどの状態所有を維持。
- Effect関数と依存配列は第4段階mainからバイト一致で移行。Hook呼出し位置は元のEffect位置と同じ。Auth用の新規権限・DB/API・タイミング条件変更なし。
- `src/authSessionLifecycle.test.mjs`: 元Effect全文のSHA-256契約とモックした認証イベント・サブスクリプション解除・遅延読出しを検証。既存のsignup/recoveryソース監査も移設先を参照する。

## 第6段階：Auth初期読出しの競合保護
- `src/hooks/useAuthSessionLifecycle.js`: 初期 `getSession()` より後に確定した `onAuthStateChange` の状態を常に優先する。成功・失敗の古い結果では最新ログイン/ログアウト/パスワード再設定を上書きしない。
- callback URLの処理は初期読出しが担うまま維持し、競合時には**最新イベントのsession**を渡す。確認メール・再設定リンクの表示判定を古いsessionで行わない。
- Supabase AuthやDB仕様、Auth発火タイミングは変更しない。既存の認証Effect内で局所的に世代を管理し、listener購読解除・タイマー破棄は維持する。
- `src/authSessionLifecycle.test.mjs` で、イベントより遅く戻るセッション/エラー、logout、signup、PASSWORD_RECOVERYの競合を実ハンドラにdeferred promiseを与えて固定する。

## 第7段階：初期Auth取得エラーの可視化
- Supabase Auth JS 2.107.0ではセッション初期読出しが失敗しても`INITIAL_SESSION(null)`を通知する。このケースのみ、`getSession()`のエラーを「確認エラー」としてUIへ表示する。
- パスワード再設定リンク上の失敗は、従来の失効リンク検証へ戻す。`signup_callback`や無効な確認・再設定リンクでも、失効表示とURLからのcallbackパラメータ消去を維持する。
- 認証イベントで正常なセッションが確定した場合や、`SIGNED_IN`/`SIGNED_OUT`/回復イベントが到着済みの場合、遅延した初期取得エラーをUIへ伝播させない。初期エラー表示後にAuthイベントが到着したら、stateの最新値と一致する場合に限り初期エラーを消去する。後から表示されたパスワード誤入力などのエラーは`SIGNED_OUT`通知でも消さない。
- Auth購読の順序、既存のセッション境界・DB/RLS・Auth実行権限は不変。6件のdeferred raceテストで初期失敗・recovery・通常匿名・イベント後の旧エラーを再現する。

## 第8段階：アカウント別非同期応答の隔離

- `src/App.jsx` のブラックホール管理一覧 `refreshBlackHoleItems` はリクエスト時のデータセッション（user ID＋session epoch）と最新版リクエスト番号を記録。別アカウントの旧一覧・取得エラーや、同じアカウントの先行応答が新しい一覧を上書きしない。
- `handleSubmitContentReport` は通報送信時のデータセッションとsingle-flightインスタンスを捕捉。アカウント変更・single-flight差替後の成功／例外／finallyのUI更新を破棄し、Bの通報画面・処理中表示をAの結果で更新しない。
- `handleFeedbackSubmit` は送信中のセッション切替を確認し、旧リクエストでBの下書きを消去したり、成功／失敗表示・保存中状態を書き換えたりしない。通信Promiseのrejectや同期例外でも、現ユーザーには安全なエラーを表示してsavingを解除し、旧アカウントの例外は新画面に反映しない。セッション切替時にフィードバックフォームの下書き・種別・メッセージ・保存中状態をリセットし、前アカウントの私的テキストを残さない。
- `src/dataSessionAsyncHandlers.test.mjs`: 実Appハンドラを抽出し、遅延した成功と失敗、A→Bアカウント切替、同一アカウントの要求順序、フォーム初期化をモック応答で検証。
- 既存の投稿・共鳴・Archive・星文のrevisionガードは変更しない。Supabase Auth・DB/RLS/権限・通信先/形式・Netlify設定・秘密値は不変。

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

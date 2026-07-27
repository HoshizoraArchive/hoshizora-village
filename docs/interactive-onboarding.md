# ミニちあと巡る初回オンボーディング

Issue #97の入村案内は、説明専用ページではなく、既存のMy Const.、観測、Archive、
R.Connect、流星便投稿を順番に操作するレイヤーとして実装する。

## 対象

`20260727143000_add_interactive_onboarding.sql` 適用後に作成されたAuthユーザーだけが対象になる。
`auth.users` の `AFTER INSERT` triggerが本人の
`public.user_onboarding_progress` を1行作成する。既存ユーザーはbackfillしないため、
次回ログイン時に入村案内が突然始まることはない。

進捗行がない場合、またはmigration未適用のDeploy Previewではオンボーディングを表示せず、
既存画面をそのまま利用できる。

## 状態遷移

順序は次のとおり。

1. Welcome映像の完了またはスキップ
2. ミニちあ登場
3. My Const.で表示名とプロフィール画像を保存
4. 観測で固定された対象流星便をArchive
5. Archiveページで同じ流星便を確認
6. R.Connectで通知許可
7. 有効なPush Subscriptionを端末登録
8. サーバーから現在端末へ実Web Pushを送信
9. 既存投稿フォームで最初の流星便を保存
10. 完了台詞の後、通常の観測へ戻る

通知が拒否・未対応・失敗の場合は、成功台詞を出さず通知案内だけをスキップできる。
Welcome映像は `welcome_video_status` に `completed` または `skipped` を記録し、
再生完了と利用者によるスキップを区別する。
プロフィール、Archive、端末登録、初投稿は
`public.advance_initial_onboarding` がDBの実レコードを再確認してから進める。
Push成功はブラウザから申告できず、`/api/push-subscription-test` の実送信完了後に
service role専用の `public.record_initial_onboarding_push_test` が記録する。

## Archive対象

対象は新規ユーザー作成時点の「本人以外による公開・未削除の最新流星便」をIDで固定する。
表示順には依存しない。対象が削除・非公開化された場合は、進捗RPCが次の利用可能な流星便を
再選定する。観測とArchive画面は同じ `target_post_id` を取得する。

## Welcome映像とミニちあ

Welcome映像の差し替え箇所は `src/onboarding.js` の
`ONBOARDING_WELCOME_VIDEO_SRC` だけ。URL設定時は音声を消さずに `video.play()` を試し、
ブラウザに拒否された場合は「Welcome映像を再生」ボタンから利用者操作で再試行する。
未設定、読み込み失敗、自動再生拒否でも「映像をスキップして案内へ進む」から後続導線を確認できる。
動画終了とスキップは一度だけ進捗へ記録する。

ミニちあは `public/images/onboarding/mini-chia.png` にIssue添付の透過PNGを無加工で保存する。

ログインユーザーが切り替わると、以前のユーザーの進捗stateと進行中フラグを取得前に破棄する。
取得結果、進捗RPC、画面表示はいずれも進捗の `user_id` と現在の `session.user.id` が一致する場合だけ
有効にし、切り替え前の非同期レスポンスは反映しない。

## RLSと権限

- `authenticated` は本人の進捗行だけSELECTできる。
- browser roleに進捗テーブルのINSERT / UPDATE / DELETEを付与しない。
- 状態変更は `SECURITY DEFINER`、`search_path = ''` のRPCだけを使う。
- `advance_initial_onboarding` は `auth.uid()` の行だけをlockして更新する。
- 実Push結果RPCはbrowser roleから実行できず、`service_role`だけが実行できる。

本番適用時は先に `docs/interactive-onboarding-preflight.sql` で依存テーブルと
既存ユーザー数を確認し、migrationを適用してからアプリをdeployする。適用後は
`docs/interactive-onboarding-verification.sql` を読み取り専用で実行し、RLS、権限、
trigger、進捗矛盾がないことを確認する。本PRからProduction DBへは適用しない。

## 実機確認

Pushはブラウザとインストール形態に依存するため、次を実機で確認する。

- iOS Safari: 通知未対応またはホーム画面追加案内になり、永久に停止しないこと
- iOS PWA: 許可、既存端末登録の再利用、実Push受信
- Android Chrome: 許可、端末登録、実Push受信
- Android PWA: 許可、既存端末登録の再利用、実Push受信

Deploy PreviewではVAPID設定やPushサービス制約により実送信できない場合がある。
その場合も疑似通知や成功状態は作らない。

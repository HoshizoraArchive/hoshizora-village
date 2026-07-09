# Push notifications ops

## 目的

R.Connect のスマホ通知を、段階的に本番運用へ進めるための運用メモです。

## 現在の段階

PR #82 では、スマホ Push 通知のうち「端末登録」までを実装しました。

今回のR.Connectスマホ通知配信MVPでは、`public.notifications` に保存されるR.Connect通知を全ユーザー・全通知タイプでPush配信対象にします。

- `public.push_subscriptions` に端末購読情報を保存する
- `/api/push-config` で VAPID public key を返す
- `/api/push-subscription-register` で認証済みユーザーの端末購読を保存する
- R.Connect のスマホ通知テストカードから端末登録する
- `public.notifications` の `INSERT` triggerで `public.push_notification_jobs` へ1通知1jobを積む
- `push-notification-dispatch` scheduled Functionがservice_roleでjobをclaimし、`web-push`で配信する
- 404 / 410 が返った購読は `disabled_at` を更新し、以後の配信対象から外す

ちあ通知だけに限定せず、`resonance`、`archive`、`star_letter` を含む `public.notifications` 全体を対象にします。AI観測ロジックやR.Connect画面表示は変更しません。

## Netlify environment variables

端末登録には、Netlify Functions runtime から次の環境変数が読める必要があります。

- `PUSH_VAPID_PUBLIC_KEY`

送信処理では、同じ VAPID key pair の private key も必要です。

- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT`

`PUSH_VAPID_SUBJECT` が未設定の場合、scheduled Functionは `https://hoshizora-village.netlify.app` をsubjectとして使用します。

`PUSH_VAPID_PUBLIC_KEY` を変更した後は、Function runtime が新しい値を読むように production deploy を再実行してください。

`PUSH_VAPID_PRIVATE_KEY` はserver-only envとしてNetlify UIから設定し、ブラウザや `VITE_` 変数へ置かないでください。

## 本番確認

R.Connect で以下を確認します。

1. `通知: 許可済み` になること
2. `端末登録: 未登録` が表示されること
3. `この端末を登録` を押せること
4. 成功時に `端末登録: 登録済み` になること
5. `public.notifications` へ新規通知が作成されると `public.push_notification_jobs` が `queued` で作成されること
6. scheduled Function 実行後、登録済み端末に通知が届き、jobが `succeeded` になること
7. 受信者に有効な購読がない場合、jobが `skipped` になること

`端末登録: VAPID key未設定` のままの場合は、Netlify Functions runtime から `PUSH_VAPID_PUBLIC_KEY` が読めていません。env の context/scope と、env 変更後の再deployを確認してください。

`PUSH_VAPID_PRIVATE_KEY` が未設定の場合、端末登録は継続できますがscheduled配信はfail closedします。配信開始前にNetlify UIでserver-only envを設定してください。

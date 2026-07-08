# Push notifications ops

## 目的

R.Connect のスマホ通知を、段階的に本番運用へ進めるための運用メモです。

## 現在の段階

PR #82 では、スマホ Push 通知のうち「端末登録」までを実装します。

- `public.push_subscriptions` に端末購読情報を保存する
- `/api/push-config` で VAPID public key を返す
- `/api/push-subscription-register` で認証済みユーザーの端末購読を保存する
- R.Connect のスマホ通知テストカードから端末登録する

この段階では、R.Connect 通知作成時の自動 Push 送信はまだ行いません。

## Netlify environment variables

端末登録には、Netlify Functions runtime から次の環境変数が読める必要があります。

- `PUSH_VAPID_PUBLIC_KEY`

将来の送信処理では、同じ VAPID key pair の private key も必要になります。

- `PUSH_VAPID_PRIVATE_KEY`

`PUSH_VAPID_PUBLIC_KEY` を変更した後は、Function runtime が新しい値を読むように production deploy を再実行してください。

## 本番確認

R.Connect で以下を確認します。

1. `通知: 許可済み` になること
2. `端末登録: 未登録` が表示されること
3. `この端末を登録` を押せること
4. 成功時に `端末登録: 登録済み` になること

`端末登録: VAPID key未設定` のままの場合は、Netlify Functions runtime から `PUSH_VAPID_PUBLIC_KEY` が読めていません。env の context/scope と、env 変更後の再deployを確認してください。

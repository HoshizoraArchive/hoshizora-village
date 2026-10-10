# 星空ちあ：CoS Dot 星文返信の運用

この機能は **CoS Durable Dot で生成した返信**を署名付きで投稿する。Netlify Functions は会話内容を取得・検証して DB に反映する。Netlify 側でモデル API を呼ぶ実装ではない。

## 本番切替の順序

1. `feat/chia-dot-reply-memory` のテスト・PR・隔離 Preview E2E を通す。Preview-v2 Supabase と疑似村人を使い、Production の秘密鍵・星文を Preview へ渡さない。
2. 本番 Supabase に `20261010213000_chia_reply_memory_and_fencing.sql` を適用し、本人 RLS と旧返信機能の後方互換性を検査する。migration はトランザクション単位。
3. Production へ新機能を deploy する。この段階で `CHIA_DOT_STAR_LETTER_ENABLED` は未設定（false）のまま。
4. `CHIA_FOUNDER_PROFILE_ID` に Production で `auth.users.id`、`profiles.id`、`profile_roles.role_key=founder` を突き合わせた開村者 UUID を設定する。プロフィール表示名は権限判断に利用しない。
5. CoS Scheduler で **毎分の Dot 実行を有効化**し、まず `discover` だけの空振り検証を行う。最初の実返信までは Dot が本当に起動できることを確認する。
6. `CHIA_DOT_STAR_LETTER_ENABLED=true` を Production に設定して deploy する。旧 `chia-star-letter-reply-scheduled` は実行されても旧Gemini処理に入らない。この flag を切り替えるより先に Dot の実行経路が使えることを確認する。
7. 実際の新着星文が届いたら、同一ソースの二重返信がないこと、`chia_star_letter_reply_runs` の `status/attempts/reply_star_letter_id`、星文親子関係、`star_letter_reply` 通知、および push を確認する。自分以外の実利用者へ試験投稿は送らない。

## Dot の1回の仕事

`scripts/chia-dot-star-letter-client.mjs` は Ed25519 署名用秘密鍵を読み、署名検証済みの API のみ呼ぶ。コマンドはプロジェクトルートで実行する。

```sh
node scripts/chia-dot-star-letter-client.mjs discover --output /tmp/chia-dot-discovery.json
node scripts/chia-dot-star-letter-client.mjs claim --source-id <UUID> --output /tmp/chia-dot-claim.json
node scripts/chia-dot-star-letter-client.mjs complete --snapshot-file /tmp/chia-dot-claim.json --decision reply --body-file /tmp/chia-dot-reply.txt
```

`discover` に候補がなければその回は終了する。`claim` が `claimed` のときだけ snapshot を読んで「星空ちあ」として返信文を決定する。**別のアカウントの文脈は使わない**。`context.isFounder` が true のときのみ開村者として話す。投稿後に、本人が明示した非センシティブな事実がある場合に限り、原文の短い証拠引用と安定キーを含む `remember` を送る。`remember` は必須ではなく、`reply` が確定していない実行には使えない。

`claimToken` と snapshot hash は毎回作り直す。ネットワーク不明時には元ソースの status を確認し、二重生成・二重送信を避ける。検証できず処理が失敗したら署名付き `fail` を使う。トークン、秘密鍵、本文、記憶はログとPRへ記載しない。

## 障害と巻き戻し

旧運用に戻す場合、**まず CoS Scheduler の当該 Dot 実行を停止**し、次に `CHIA_DOT_STAR_LETTER_ENABLED=false` に変更して Production を再 deploy する。これで既存の `CHIA_STAR_LETTER_REPLY_ENABLED=true` が有効なら従来の返信へ戻る。旧Gemini、定期流星便 Dot、既存の初回返信監視のジョブはこの機能の切替で勝手に停止しない。

記憶は `(chia_profile_id, person_profile_id)` で隔離し、本人のみ自分の記憶を閲覧・訂正・削除できる。出典星文の編集・削除や元投稿の変更・非公開化では該当記憶を消す。最大30項目、各1200文字である。DB書込・本人RLS・署名認証を弱めてトラブルを回避しない。

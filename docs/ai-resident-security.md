# AI住人セキュリティ基盤

この文書は「星空ちあ観測MVP」の前段として追加した、AI観測ジョブ予約基盤の設計を記録する。
このPRではGemini APIを呼び出さず、`public.observations` への観測結果保存や星文自動投稿も行わない。

## 処理フロー

1. クライアントは将来、ログイン済みoperatorのSupabase access tokenを付けて `POST /api/ai-observation-request` を呼ぶ。
2. Netlify Functionは `AI_OBSERVATION_ENABLED=true` のときだけ処理する。未設定または別値なら503でfail closedする。
3. リクエストJSONは `{ "postId": "UUID", "idempotencyKey": "32〜128文字" }` のみ許可する。
4. Functionは `SUPABASE_SERVICE_ROLE_KEY` を使い、Supabase Auth tokenをサーバー側で検証する。
5. `AI_OPERATOR_USER_IDS` に含まれるAuth UUIDだけをoperatorとして許可する。
6. FunctionはDBから対象流星便と `post_media` を取得し、公開・未削除・対応メディア条件をサーバー側で確認する。
7. 画像・動画ではStorage APIで対象オブジェクトのメタデータも取得し、DB上のMIME・サイズと一致することを確認する。
8. Functionは `public.reserve_ai_observation_job(...)` を呼び、DB側transactionでジョブ予約、上限判定、二重実行防止を行う。
9. 成功時は `queued` の `public.ai_observation_jobs` 行だけを作成し、202を返す。

## 信頼境界

- ブラウザ: `postId` と `idempotencyKey` だけを送れる。AI住人、プロンプト、投稿者ID、モデル名、星文本文は送れない。
- Netlify Function: service_role key、Gemini API key、operator UUID、利用上限を読む唯一の境界。
- Supabase DB: ジョブ状態、二重実行防止、利用上限をtransaction内で確定する。
- Gemini: 今回は未呼び出し。次PRでも秘密情報や非公開データは渡さない。

## 想定する攻撃

- 一般ユーザーがAPIを直接叩いてAI観測を実行する。
- クライアントが他人のuser idやAI住人名を送ってなりすます。
- 同じ流星便へ連打や並列リクエストでジョブを複数作る。
- idempotency keyを再利用して多重登録する。
- 非公開・削除済み・存在しない流星便を観測対象にする。
- Storage path、signed URL、投稿本文、AI生出力、API keyをログやレスポンスへ漏らす。
- 作品本文や画像内テキストからプロンプトインジェクションを行う。

## 秘密情報の配置

Netlify Functionsだけが以下を参照する。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `AI_OPERATOR_USER_IDS`
- `AI_OBSERVATION_ENABLED`
- `AI_DAILY_REQUEST_LIMIT`
- `AI_MONTHLY_REQUEST_LIMIT`
- `AI_DAILY_COST_LIMIT_MICRO_USD`
- `AI_MONTHLY_COST_LIMIT_MICRO_USD`
- `AI_OBSERVATION_TIMEOUT_MS`
- `AI_OBSERVATION_MAX_RETRIES`
- `AI_MIN_SECONDS_BETWEEN_REQUESTS`
- `AI_RESERVED_COST_MICRO_USD`

これらは `VITE_` 変数にしない。PRでは本番Netlifyへ値を設定していない。

## 運営権限

MVPでは `AI_OPERATOR_USER_IDS` をカンマ区切りAuth UUIDとして扱う。
未設定、空、UUID形式不正の場合は設定不備として503で拒否する。
許可UUID一覧はAPIレスポンスへ返さず、ログにも出さない。

## ジョブ状態遷移

`public.ai_observation_jobs.status` はPostgreSQL enumで管理する。

- `queued`: 予約済み。今回のFunctionが作成する唯一の状態。
- `processing`: 将来の観測workerが処理開始時に遷移する。
- `succeeded`: 観測結果と星文処理が完了した状態。
- `failed`: 観測失敗。
- `cancelled`: 明示的に中止された状態。

## 二重実行防止

DB側で以下を保証する。

- `idempotency_key` はunique。
- `(post_id, ai_resident_key)` について、`queued` または `processing` はpartial unique indexで1件だけ。
- `(post_id, ai_resident_key)` について、`succeeded` はpartial unique indexで1件だけ。
- `(post_id, ai_resident_key)` の `failed` 件数が `max_attempts` 以上の場合は、DB側で追加予約を拒否する。
- `reserve_ai_observation_job` はtransaction内でadvisory lockを取り、上限判定とinsertを同じ処理で行う。
- 競合はFunctionで409へ変換する。

## 利用回数・料金上限

期間基準はUTC。

- 日次: UTC 00:00以降
- 月次: UTC月初00:00以降

`queued` / `processing` / `succeeded` の `reserved_cost_micro_usd` を予約済み利用として集計する。
本PRでは実際のGemini料金計算は行わず、`AI_RESERVED_COST_MICRO_USD` を予約単価として使う。
具体的な予算値はリポジトリにハードコードしない。

## メディア検証

Functionはクライアント入力ではなくDBの `posts` / `post_media` を取得して検証する。
画像・動画では、Storage APIから取得したオブジェクトメタデータのMIMEとサイズも `post_media` と照合する。

- 画像: `image/jpeg`, `image/png`, `image/webp`, 最大8MB, 最大4枚。
- 動画: `video/mp4`, `video/quicktime`, `video/webm`, 最大100MB, 1本, 最大35秒。
- YouTube: 許可hostだけをURL parseし、video IDを再検証する。任意URL fetchはしない。
- 音声: 現schemaではserver-verifiableなMIME metadataが不足しているため、この基盤ではfail closedにする。

ファイルシグネチャ検証と動画/音声実体の再生時間検証は、Gemini実呼び出しPRで実行環境を確認して追加する。
現時点で実体検証済みとして扱わない。

## AI出力Schema検証

`netlify/functions/_shared/aiOutputSchema.mjs` に固定Schema検証を追加した。
必須キー、追加プロパティ拒否、型、文字数、配列数、`confidence` 範囲、`should_post` と `star_letter` の整合性を検証する。
Schema不正時は公開処理へ渡さない。

## ログ方針

ログに残すもの:

- request ID
- job ID
- operation
- 安全なエラーコード
- HTTP status
- 処理時間

ログに残さないもの:

- Authorization header
- Cookie
- access token
- API key
- signed URL
- Storage path
- 投稿本文全文
- 歌詞全文
- AI生レスポンス
- full error object

## 障害時の挙動

外部レスポンスは短い安全なエラーコード、日本語メッセージ、request IDのみを返す。
DBテーブル名、RLS policy名、SQL、stack trace、Supabase生エラー、secret、Storage pathは返さない。

## 次の観測MVPで使う方法

次PRでは以下を追加する。

1. `queued` ジョブを `processing` に遷移する。
2. Geminiへ必要な公開作品データだけを渡す。
3. 固定Schemaで出力を再検証する。
4. `public.observations` へ結果を保存する。
5. ちあ名義の星文を一度だけ作成する。
6. 使用量と料金をジョブへ確定記録する。
7. `succeeded` または `failed` に遷移する。

## 本番適用前の手動作業

1. `supabase/migrations/20260703_add_ai_observation_security_foundation.sql` をSupabase SQL Editorで確認後に適用する。
2. `docs/ai-resident-security-verification.sql` を読み取り専用で実行し、RLS、GRANT、index、RPC権限を確認する。
3. Netlifyへ必要な環境変数を設定する。ただし、このPR時点では本番値を未設定のままにする。
4. 明示的に有効化するまで `AI_OBSERVATION_ENABLED` は空または未設定にする。

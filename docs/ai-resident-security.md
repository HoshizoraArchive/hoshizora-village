# AI住人セキュリティ基盤

この文書はAI観測ジョブ予約基盤と、星空ちあ観測MVPで追加した実観測処理のセキュリティ設計を記録する。
詳細なMVP運用手順は `docs/ai-observation-mvp.md` を参照する。

## 処理フロー

1. クライアントはログイン済みoperatorのSupabase access tokenを付けて `GET /api/ai-observation-request` で実行可否を確認し、`POST /api/ai-observation-request` を呼ぶ。
2. Netlify Functionは `AI_OBSERVATION_ENABLED=true` のときだけ処理する。未設定または別値なら503でfail closedする。
3. リクエストJSONは `{ "postId": "UUID", "idempotencyKey": "32〜128文字" }` のみ許可する。
4. Functionは `SUPABASE_SERVICE_ROLE_KEY` を使い、Supabase Auth tokenをサーバー側で検証する。
5. `AI_OPERATOR_USER_IDS` に含まれるAuth UUIDだけをoperatorとして許可する。
6. FunctionはDBから対象流星便と `post_media` を取得し、公開・未削除・対応メディア条件をサーバー側で確認する。
7. 画像・動画ではStorage pathの先頭フォルダが投稿者UUIDと一致することをFunctionとDB制約の両方で確認する。
8. 画像・動画ではStorage APIで対象オブジェクトのメタデータも取得し、DB上のMIME・サイズと一致することを確認する。
9. Functionは `public.reserve_ai_observation_job(...)` を呼び、DB側transactionでジョブ予約、上限判定、二重実行防止を行う。
10. 成功時は `queued` の `public.ai_observation_jobs` 行を作成し、`/api/ai-observation-worker` Background Functionへ `jobId` だけをdispatchする。
11. workerはservice_roleで投稿・media・ちあprofileを再取得し、予約時fingerprintと一致する場合だけGeminiを呼び出す。
12. 検証済み出力だけを `public.complete_ai_observation_job(...)` へ渡し、`public.observations` 保存、必要時の星文insert、job成功更新を同一transactionで確定する。

## 信頼境界

- ブラウザ: `postId` と `idempotencyKey` だけを送れる。AI住人、プロンプト、投稿者ID、モデル名、星文本文は送れない。
- Netlify Function: service_role key、Gemini API key、operator UUID、利用上限を読む唯一の境界。
- Supabase DB: ジョブ状態、二重実行防止、利用上限をtransaction内で確定する。
- Gemini: 公開投稿の観測対象データだけを渡す。秘密情報、service_role key、operator UUID、非公開データは渡さない。Google Search、URL Context、Code Execution、Function Callingは使わない。

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
- `AI_OBSERVATION_MODEL`
- `AI_HOSHIZORA_CHIA_PROFILE_ID`
- `AI_WORKER_SHARED_SECRET`
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
- `reserve_ai_observation_job` はtransaction内でadvisory lockを取り、上限判定とinsertを同じ処理で行う。
- 競合はFunctionで409へ変換する。

`attempt_count` はprovider APIを実際に呼び出した回数として扱う。
`max_attempts` は1つの観測処理で許可するprovider API呼び出し総数であり、自動リトライは同じジョブ行の中で `attempt_count` を増やす前提にする。
新しい `failed` ジョブ行の件数をAPI試行回数の代わりには使わない。
将来、手動再実行を許可する場合は、通常の自動リトライとは別の明示的な処理として設計する。
現時点の通常予約RPCは、同じ `post_id` + `ai_resident_key` に `failed` がある場合も409相当で拒否し、暗黙の再実行を作らない。

## 利用回数・料金上限

期間基準はUTC。

- 日次: UTC 00:00以降
- 月次: UTC月初00:00以降

料金集計は `app_private.ai_observation_billable_cost_micro_usd` で統一する。
`queued` / `processing` は予約料金を数える。
`succeeded` は実料金があれば実料金、なければ予約料金を数える。
`failed` は `attempt_count > 0` の場合、実料金または安全側の予約料金を数える。
provider呼び出し前に失敗したジョブは `attempt_count = 0` で区別する。
本PRでは実際のGemini料金計算は行わず、`AI_RESERVED_COST_MICRO_USD` を予約単価として使う。
具体的な予算値はリポジトリにハードコードしない。
環境変数の数値は `Number.isSafeInteger` と範囲上限を検証し、巨大値やPostgreSQL integer / bigintへ安全に渡せない値は設定不備として503でfail closedする。
`AI_OBSERVATION_MAX_RETRIES` は0〜9のみ許可し、保存される `max_attempts` は1〜10に収める。

## メディア検証

Functionはクライアント入力ではなくDBの `posts` / `post_media` を取得して検証する。
`post_media.storage_path` と `thumbnail_storage_path` は、先頭フォルダが `uploader_id` / 投稿者UUIDと一致することをDB制約 `post_media_storage_path_owner_check` / `post_media_thumbnail_storage_path_owner_check` で保証する。
このCHECK制約は `app_private` の関数を呼ばず、PostgreSQL組み込み関数と演算子だけで直接判定する。通常の `authenticated` ユーザーによる既存の画像・動画投稿が、private関数のEXECUTE権限不足で失敗しないようにするため。
空パス、先頭/末尾スラッシュ、空セグメント、`.` / `..`、バックスラッシュ、`%` を含むURLエンコード回避は拒否する。
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

## 星空ちあ観測MVP

MVPでは運営ユーザーだけが手動で公開流星便1件を観測できる。
対応形式は text / image / video / YouTube。audio単体はserver-verifiableなStorage metadataがないためfail closedのままにする。
workerは `claim_ai_observation_job` で `queued -> processing` をclaimし、Gemini呼び出し直前に `start_ai_observation_attempt` で `attempt_count` を増やす。
一時的な429/5xxなどだけを同じjob行の中で再試行し、terminal jobを再処理しない。
Gemini出力は固定JSON Schemaとローカルvalidatorで再検証し、AI生レスポンスはDBにもログにも保存しない。
星文を残す場合は、service_roleから `AI_HOSHIZORA_CHIA_PROFILE_ID` の `profiles.username = 'chia_hoshizora'` をDB側でも確認し、ちあ名義の `star_letters` を作成する。星空ちあのパスワードログインは使用しない。
使用量が取得できない場合は成功扱いせず、料金はGemini 3.5 Flash Standardのpricing snapshotからmicro USD単位で推定する。

## 本番適用前の手動作業

1. `docs/ai-resident-security-preflight.sql` を読み取り専用で実行する。
2. Storage path違反件数がすべて0件であることを確認する。1件以上ある場合は、migration適用前に対象データを確認する。
3. `supabase/migrations/20260703_add_ai_observation_security_foundation.sql` が未適用なら適用する。
4. `docs/ai-observation-mvp-preflight.sql` を読み取り専用で実行する。
5. `supabase/migrations/20260704_add_chia_observation_mvp.sql` をSupabase SQL Editorで確認後に適用する。
6. `docs/ai-observation-mvp-verification.sql` を読み取り専用で実行し、RPC、RLS、GRANT、制約、job状態を確認する。
7. Netlify環境変数は、本番で観測を開始する直前まで未設定または機能OFFのまま維持する。
8. 明示的に有効化するまで `AI_OBSERVATION_ENABLED` は空または未設定にする。

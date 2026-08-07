# AI自動観測 運用確認メモ

このメモは、星空ちあの投稿後自動観測が本番で動いているかを確認するための運用手順です。
通常UIには queued / processing / failed / cancelled を出さないため、挙動確認は Netlify Function logs と Supabase SQL で行います。

## 本番成功判定

PR #68 の本番成功条件は次の通りです。

1. 全ユーザーの `public` な `text` 投稿後に `ai-observation-auto-request` が呼ばれる。
2. 通常text投稿は `public.ai_observation_jobs.observation_context = 'auto_text_post'`、最初の公開流星便は `first_post_welcome` のjobが作成される。
3. `not_before_at` 到達後、scheduled Function `ai-observation-dispatch-due` がdue jobをworkerへdispatchする。
4. worker完了時に `public.observations` が作成される。
5. 自動観測では `public.resonances` に星空ちあ名義の `silent` 共鳴が1件作成される。
6. 投稿者にはRe:Connectで「星空ちあさんがあなたの流星便に共鳴しました。」通知が届く。

星文は毎回作成しません。`star_letters` が0件でも、`observations` と `silent` 共鳴が作成されていれば自動観測MVPとしては正常です。

## Netlify Function logsで見るもの

Netlifyで次を開きます。

```text
hoshizora-village
→ Logs & metrics
→ Functions
→ ai-observation-auto-request
```

投稿直後に次のイベントが出れば、フロントから自動観測予約APIが呼ばれています。

```text
ai_observation_auto_reserved
status: 202
```

失敗時は次のイベントを探します。

```text
ai_observation_auto_failed
ai_observation_auto_skipped
```

`ai_observation_auto_reserved` が出ている場合、少なくとも投稿後auto requestとjob予約は成功しています。
その後の確認は Supabase 側で `queued` / `processing` / `succeeded` を見ます。

## Supabase確認SQL

### 最新jobの状態

```sql
select
  id,
  status,
  observation_context,
  post_id,
  not_before_at,
  started_at,
  completed_at,
  observation_id,
  star_letter_id,
  public_error_code
from public.ai_observation_jobs
order by created_at desc
limit 5;
```

見るポイント:

- `observation_context = 'auto_text_post'` は通常text投稿後自動観測、`first_post_welcome` は投稿形式を問わない初公開流星便歓迎jobです。
- `status = 'queued'` で `not_before_at > now()` なら、まだ遅延待ちです。
- `status = 'queued'` で `not_before_at <= now()` のまま長く残るなら、scheduled dispatchかworker dispatchを確認します。
- `status = 'processing'` が長く残る場合は、stale回収やworker timeoutを確認します。
- `status = 'succeeded'` なら、`observations` と `resonances` を確認します。

### DB時刻とdue判定

```sql
select
  now() as db_now,
  id,
  status,
  not_before_at,
  not_before_at <= now() as is_due
from public.ai_observation_jobs
order by created_at desc
limit 5;
```

`is_due = false` の場合、まだscheduled Functionが拾う時間ではありません。
`ai-observation-dispatch-due` は5分ごとの実行なので、`not_before_at` 到達から数分遅れることがあります。
遅延環境変数が未設定の場合の実効範囲は60〜900秒です。scheduled Function、通常Function、Background Functionはいずれも同じ `readAiObservationConfig()` とFunctions scopeを使用します。

### 自動共鳴の確認

```sql
select
  r.id,
  r.post_id,
  r.profile_id,
  r.resonance_type,
  r.created_at
from public.resonances r
join public.ai_observation_jobs j on j.post_id = r.post_id
where j.observation_context = 'auto_text_post'
order by r.created_at desc
limit 20;
```

星空ちあ名義の `resonance_type = 'silent'` が入っていれば、自動観測後の共鳴作成は成功です。

### Re:Connect通知の確認

```sql
select
  id,
  recipient_id,
  actor_id,
  post_id,
  type,
  read_at,
  created_at
from public.notifications
order by created_at desc
limit 20;
```

`type = 'resonance'` で、actorが星空ちあ、recipientが投稿者なら通知成功です。

## 投稿したのに共鳴が来ない時の切り分け

### 1. Netlify Function logに何も出ない

`ai-observation-auto-request` にログが1行も出ない場合、APIに到達していません。
よくある原因は、ブラウザが古い本番JSを読んでいるケースです。

対応:

1. 本番URLを新しいタブで開き直す。
2. iPhone Safariではタブを閉じて再度 `https://hoshizora-village.netlify.app` を開く。
3. ログイン状態を確認してから、もう一度 `public` な `text` 投稿を作る。
4. Netlify Function logsで `ai_observation_auto_reserved` が出るか確認する。

このケースでは、Supabaseの `posts` には投稿が入りますが、`ai_observation_jobs` にはjobが作られません。

### 2. `ai_observation_auto_reserved` は出たが、共鳴がまだ0

まず `ai_observation_jobs` を確認します。

- `queued` かつ `not_before_at > now()` なら正常な遅延待ちです。
- `queued` かつ `not_before_at <= now()` なら、次の5分cronを待ちます。
- `succeeded` なら `resonances` と `notifications` を確認します。

UIはリアルタイム購読ではないため、DBに共鳴や通知が入っていても画面側はリロードまで反映されない場合があります。

### 3. 星文が来ない

星文は仕様上、毎回作成しません。

自動観測では次の条件で抑制されます。

- モデルが `should_post = false` と判断した。
- confidenceが閾値未満。
- 確率ゲートに外れた。
- 星空ちあ全体の日次上限に達した。
- 投稿者単位クールダウン中。

そのため、星文が0でも、`observations` と `silent` 共鳴が作成されていれば正常です。

### 4. providerエラーの見分け方

- `GEMINI_TIMEOUT`: provider処理全体が設定時間を超え、workerが失敗確定した。
- `GEMINI_CONNECTION_FAILED`: Geminiへ接続できなかった。
- `GEMINI_REQUEST_FAILED`: Geminiが生成リクエストを拒否した。
- `GEMINI_RATE_LIMITED`: Geminiの429。
- `GEMINI_SERVICE_UNAVAILABLE`: Geminiの一時的な5xx。
- `AI_OUTPUT_INVALID`: JSON Schema、ローカルvalidator、usage検証のいずれかを通らなかった。
- `MEDIA_UNAVAILABLE`: Storage上の作品データ、MIME、signature、durationなどを確認できなかった。
- `WORKER_STALE`: worker異常終了などで通常のtimeout失敗確定ができず、最終保険の回収RPCが処理した。

text投稿の生成API失敗は `MEDIA_UNAVAILABLE` へ分類しません。失敗jobは自動で再実行せず、既存の観測結果・共鳴・星文もbackfillしません。

## 本番で触らないもの

運用確認だけなら、次は変更しません。

- Netlify環境変数
- Supabase secret / service_role key
- Gemini API key
- `AI_OBSERVATION_ENABLED`
- migration

原因調査では、まずログとSELECTだけで切り分けます。

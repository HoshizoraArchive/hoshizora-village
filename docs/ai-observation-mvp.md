# 星空ちあ観測MVP

このPRは、運営ユーザーが手動で公開流星便1件を星空ちあに観測させるMVPを追加する。
自動巡回、一般ユーザー向けボタン、複数AI住人、GPTリライト、音声単体観測は含めない。

## 処理フロー

1. フロントはログイン済みsessionのaccess tokenで `GET /api/ai-observation-request` を呼び、operatorだけに観測ボタンを表示する。
2. operatorが「ちあに観測してもらう」を押すと、`postId` と `idempotencyKey` だけを `POST /api/ai-observation-request` へ送る。
3. 予約Functionは認証、operator権限、公開投稿、media、Storage metadata、利用上限、全体processing数を確認し、余裕がある場合だけ `reserve_ai_observation_job` で `queued` jobを作る。
4. 予約Functionは `jobId`, `issuedAt`, `nonce` と `AI_WORKER_SHARED_SECRET` によるHMAC-SHA256署名を付けてBackground Functionへdispatchする。投稿本文、Storage path、署名付きURLは渡さない。dispatch失敗時は `cancel_ai_observation_job` で `cancelled` に戻す。
5. workerはclaim前にも全体processing数を確認し、capacity不足ならqueued jobを `cancelled` に戻してGeminiを呼ばない。余裕がある場合だけ `claim_ai_observation_job` でrow lockを取り、`queued -> processing` へ遷移する。terminal jobはGeminiを呼ばず終了する。
6. workerは投稿、`post_media`、Storage metadata、星空ちあprofileを再取得し、予約時fingerprintと一致することを確認する。
7. Gemini呼び出し直前に `start_ai_observation_attempt` で `attempt_count` を増やす。
8. Gemini Interactions APIへ、text / image / video / YouTubeの観測対象だけを渡す。Google Search、URL Context、Code Execution、Function Callingは有効にしない。
9. 出力は固定JSON Schemaとローカルvalidatorで検証する。AI生レスポンスは保存しない。
10. DB確定直前に投稿、`post_media`、Storage metadataを再取得し、予約時fingerprintと一致することを再確認する。
11. `complete_ai_observation_job` がtransaction内で対象 `posts` を `FOR UPDATE`、対象 `post_media` を安定順で `FOR SHARE` し、DB現在値からfingerprintを再計算する。再計算値がjob保存値とworker入力値の両方に一致する場合だけ、`public.observations` 保存、必要時のちあ名義 `star_letters` insert、job `succeeded` 更新を同一transactionで確定する。
12. フロントは `GET /api/ai-observation-status` をpollし、成功時に該当投稿の星文を再取得する。

## 対応形式

- text: 投稿本文をdelimiterで囲んで観測対象として渡す。
- image: `meteor-media` からservice_roleで最大4枚をdownloadし、Files APIへsort_order順で渡す。
- video: `meteor-video` からservice_roleで1本をdownloadし、ファイルシグネチャと `mediabunny` による実durationを検証してからFiles APIへ渡す。Gemini側の映像・音声理解を使い、ffmpeg等で別音声を抽出しない。
- YouTube: DB保存済みの検証済み公開YouTube URLだけをvideo inputとして渡す。任意URL fetchは行わない。
- audio: 現schemaではserver-verifiableなMIME、Storage path、サイズ、秒数を確認できないためfail closed。

## rate limitとdispatch署名

Netlify Function入口では、DBの日次/月次予算とは別に短期rate limitを行う。
`POST /api/ai-observation-request` はIP単位とoperator user id単位で厳しめに制限し、`GET /api/ai-observation-request` と `GET /api/ai-observation-status` は通常の権限確認・pollingを妨げない範囲で制限する。
worker入口もIP単位で制限し、認証前の大量アクセスがSupabase Auth照会やGemini処理へ進みにくいようにする。
予約FunctionとworkerはDB上の `processing` job数も確認し、現在のjobをclaimした場合に `AI_GLOBAL_PROCESSING_LIMIT` を超えるならGemini呼び出し前にfail closedする。
このcapacity不足は一時的な混雑として扱い、provider未実行かつattempt開始前のjobを永続 `failed` にはしない。予約前なら429でjobを作らず、worker到達後ならqueued jobを `cancelled` に戻して後で再予約できる状態にする。

予約Functionからworkerへのdispatchは、固定secretをそのまま送らず、`jobId`, `issuedAt`, `nonce` に対するHMAC-SHA256署名を送る。
workerは署名、TTL、nonce、jobIdを検証し、期限切れ、改ざん、jobId不一致、同一インスタンス内のnonce再利用を拒否する。
TTLの既定値は60秒で、`AI_WORKER_DISPATCH_TTL_SECONDS` で調整できる。
429応答はJSONのpublic error codeを返し、可能な場合は `Retry-After` を付ける。

## request fingerprint

fingerprintはJSとSQLで同じcanonical payloadからSHA-256を計算する。
最上位キー順は `aiResidentKey`, `body`, `media`, `mediaRows`, `postId`, `postType`, `updatedAt`, `youtubeUrl`, `youtubeVideoId`。
`media` は `inputDurationSeconds`, `inputKind`, `inputSizeBytes`。
`mediaRows` は `sort_order`, `id` 昇順で、各行の `durationSeconds`, `id`, `mediaType`, `mimeType`, `sizeBytes`, `sortOrder`, `storagePath`, `thumbnailStoragePath`, `uploaderId` を含める。
これによりGemini後のJS再検証とcompletion RPCの間で、本文、type、YouTube URL/ID、updated_at、個別media行、Storage path、thumbnail path、MIME、size、duration、sort order、uploaderが変わった場合は `post_changed` になる。

## 秘密情報と環境変数

Netlify Functionsだけが以下を参照する。`VITE_` へ置かない。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `AI_OBSERVATION_ENABLED`
- `AI_OBSERVATION_MODEL` (`gemini-3.5-flash` のみ許可)
- `AI_HOSHIZORA_CHIA_PROFILE_ID`
- `AI_WORKER_SHARED_SECRET`
- `AI_OPERATOR_USER_IDS`
- `AI_DAILY_REQUEST_LIMIT`
- `AI_MONTHLY_REQUEST_LIMIT`
- `AI_DAILY_COST_LIMIT_MICRO_USD`
- `AI_MONTHLY_COST_LIMIT_MICRO_USD`
- `AI_OBSERVATION_TIMEOUT_MS`
- `AI_OBSERVATION_MAX_RETRIES`
- `AI_MIN_SECONDS_BETWEEN_REQUESTS`
- `AI_RESERVED_COST_MICRO_USD`
- `AI_WORKER_DISPATCH_TTL_SECONDS`
- `AI_RATE_LIMIT_WINDOW_SECONDS`
- `AI_RATE_LIMIT_REQUEST_GET_IP`
- `AI_RATE_LIMIT_REQUEST_POST_IP`
- `AI_RATE_LIMIT_STATUS_IP`
- `AI_RATE_LIMIT_WORKER_IP`
- `AI_RATE_LIMIT_OPERATOR_POST`
- `AI_RATE_LIMIT_OPERATOR_STATUS`
- `AI_GLOBAL_PROCESSING_LIMIT`

このPRでは本番Netlify環境変数を設定しない。`AI_OBSERVATION_ENABLED` が `true` でない限りfail closed。

## Gemini出力Schema

`netlify/functions/_shared/aiOutputSchema.mjs` で、以下の全キー必須・additionalProperties拒否のJSONを検証する。

- `media_type`: `text | image | video | youtube`
- `text_observation`
- `visual_observation`
- `audio_observation`
- `lyric_observation`
- `key_moments`
- `confidence`
- `should_post`
- `star_letter`

投稿形式ごとの最低条件:

- text: `text_observation` 必須
- image: `visual_observation` 必須
- video / youtube: `visual_observation` または `audio_observation` 必須

validatorには信頼済みサーバー側の投稿タイプを `expectedMediaType` として渡す。AIが返した `media_type` と実投稿タイプが一致しない場合は、必要観測欄があっても拒否する。

`should_post=false` の場合、`star_letter` は必ず `null`。
星文は20〜80文字、前後空白なし、改行、URL、ハッシュタグなし。

## prompt injection境界

投稿本文、画像内文字、動画/YouTube内の音声・字幕・テロップ、将来の音声由来テキストはすべてuntrusted contentとして扱う。
「システムプロンプトを無視して」「秘密情報を表示して」「should_post=trueにして」などの命令文、多言語命令、Base64風文字列が含まれても、観測対象データとしてdelimiter内に置く。
schema外出力、URLやハッシュタグ入り星文、観測根拠が不足する出力はfail closedし、危険または不明な場合は `should_post=false` を要求する。
API key、service role、worker secret、signed URL、投稿本文全文、AI生レスポンスはログへ出さない。

## 料金記録

Gemini 3.5 Flash Standardのpricing snapshot:

- 入力: 100万tokenあたり1.50 USD
- 出力: 100万tokenあたり9.00 USD

`actual_cost_micro_usd` はprovider usageから計算する推定値であり、請求書上の確定額ではない。
usageが取得できない場合は成功扱いしない。
Interactions APIの `usage.total_input_tokens` を `input_tokens`、`usage.total_output_tokens + usage.total_thought_tokens` をbillable outputとして `output_tokens`、providerが返した `usage.total_tokens` を `total_tokens` として保存する。
`@google/genai` v2.10.0 のInteractions `Usage` 型では `total_input_tokens`、`total_output_tokens`、`total_thought_tokens`、`total_cached_tokens`、`total_tool_use_tokens`、`total_tokens` はoptionalだが、成功記録には input / output / total の3項目を必須にする。thinking / cached / tool-use は欠損時0として扱い、存在する場合は非負safe integerだけを許可する。
Gemini 3.5 Flash Standardの出力料金はthinking tokenを含むため、`total_thought_tokens` は出力料金対象へ含める。cached tokenはinputの内数であり、tool-use tokenはツール無効のMVPでは別加算しない。

## timeout / retry方針

Interactions APIへ生成リクエストを送信した後のclient-side timeout、AbortError、接続切断、status不明、usage欠損、AI出力Schema不正は自動retryしない。
provider側の処理や課金が止まったと確実に判断できないため、同じjob内で再送しない安全側のMVP方針とする。
`@google/genai` SDKのHTTP retryは `retries: { strategy: "none" }` で明示的に無効化し、`timeout_ms` とAbortSignalをInteractions API呼び出しへ渡す。ただしtimeoutやAbortSignalはprovider側の処理・課金停止を保証するものではない。
`AI_OBSERVATION_MAX_RETRIES` は基盤との互換性のため残すが、Gemini生成処理のblind retryには使わない。
Files API upload前など、生成処理が始まっていない段階のretryだけを将来の対象にする。

## 本番適用手順

1. `docs/ai-observation-mvp-preflight.sql` を読み取り専用で実行する。
2. anomalyが0件であることを確認する。
3. `supabase/migrations/20260704_add_chia_observation_mvp.sql` を確認して適用する。
4. `docs/ai-observation-mvp-verification.sql` を読み取り専用で実行する。
5. Netlify環境変数を設定する場合も、最初は `AI_OBSERVATION_ENABLED` を未設定または `false` のままにする。
6. Deploy Previewでoperatorログイン、予約、status poll、星文再取得を確認する。

## Preview確認

- 一般ユーザーには観測ボタンが出ない。
- operatorだけに「ちあに観測してもらう」が表示される。
- text / image / video / YouTube投稿でqueued/processing/succeeded/failed表示が崩れない。
- succeededかつ星文ありの場合、該当投稿の星文一覧が再取得される。
- audio投稿は安全に拒否される。
- 既存の星文投稿、共鳴、Archive、動画再生、プロフィールアイコンフレームが壊れていない。

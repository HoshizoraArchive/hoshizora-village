# 星空Village Supabase設計メモ

このドキュメントは、Re:AiSNS / 星空Village のMVP向けSupabase設計メモです。

今回は本接続前のDB設計整理です。React側のSupabase接続、ログインUI、会員登録、Netlify環境変数設定、AI API接続、Storage実装はまだ行いません。

## Supabaseで扱う範囲

### Auth

Supabase Authは、将来の会員登録とログインに使います。

MVPでは `auth.users.id` と `public.profiles.id` を1対1でつなぎ、ログインユーザーが自分のプロフィール、流星便、Archiveなどを操作できるようにします。

### Database

Databaseには以下を保存します。

- `profiles`: ユーザープロフィール
- `posts`: 流星便
- `post_media`: 流星便画像 / 短尺動画
- `profile_tags`: わたしの星座
- `post_tags`: 流星便タグ
- `meteor_tags`: 流星タグ辞書
- `post_meteor_tags`: 流星便と流星タグの関連
- `resonances`: 共鳴
- `notifications`: R.Connect通知
- `feedbacks`: 星の目安箱
- `star_letters`: 星文
- `archives`: Archive
- `observations`: 観測ログ

### Storage

Supabase Storageは、プロフィール画像アップロードMVPで `avatars` bucket、流星便画像投稿MVPで `meteor-media` bucket、流星便動画投稿MVPで `meteor-video` bucket を使います。

- bucket名: `avatars`
- public read: 有効
- 最大サイズ: 5MB
- 許可MIME type: `image/jpeg`, `image/png`, `image/webp`
- 保存パス: `{userId}/avatar-{timestamp}.{ext}`

- bucket名: `meteor-media`
- public read: 無効
- 最大サイズ: 8MB
- 許可MIME type: `image/jpeg`, `image/png`, `image/webp`
- 保存パス: `{userId}/{uploadBatchId}/{sortOrder}-{randomId}.{ext}`
- 表示方法: `post_media` と `posts` の可視性に連動したStorage RLSを通し、クライアント側で短時間のsigned URLを発行

- bucket名: `meteor-video`
- public read: 無効
- 最大サイズ: 100MB
- 許可MIME type: `video/mp4`, `video/quicktime`, `video/webm`
- 保存パス: `{userId}/{uploadBatchId}/video-{randomId}.{ext}`
- 表示方法: `post_media` と `posts` の可視性に連動したStorage RLSを通し、クライアント側で短時間のsigned URLを発行

Storage policy方針:

- 誰でも `avatars` bucket の画像をselect可能
- `meteor-media` bucket の画像は、公開中かつ削除されていない流星便、または投稿者本人の流星便に紐づく場合だけselect可能
- `meteor-video` bucket の動画は、公開中かつ削除されていない流星便、または投稿者本人の流星便に紐づく場合だけselect可能
- ログイン済みユーザーだけがinsert可能
- insertできるのは `auth.uid()` と同じ名前のフォルダ配下のみ
- `meteor-media` はログイン済みユーザーが自分のフォルダ配下だけdelete可能
- `meteor-video` はログイン済みユーザーが自分のフォルダ配下だけdelete可能
- 他人のフォルダにはアップロードできない
- `service_role` はフロントエンドでは使わない

本番Supabase SQL Editorで実行するmigration:

- `supabase/migrations/20260611_add_avatar_storage.sql`
- `supabase/migrations/20260613_add_meteor_image_media.sql`
- `supabase/migrations/20260616_add_meteor_video_media.sql`
- `supabase/migrations/20260630_add_meteor_tags.sql`
- `supabase/migrations/20260702_security_hardening.sql`

### 将来の拡張

AI住人の観測ログ、Archive分類、星文候補、おすすめ観測の判定結果を `observations` に保存できる形にします。

AI住人用の強い権限はフロントエンドに置かず、将来のサーバー側処理で `service_role` を安全に扱う前提です。

## テーブル設計

### profiles

ユーザープロフィールを保存します。

主なカラム:

- `id`: Supabase AuthのユーザーID
- `display_name`: 表示名
- `username`: ユーザー名
- `bio`: 自己紹介
- `avatar_url`: プロフィール画像URL。プロフィール画像アップロードMVPでは `avatars` bucket の公開URLを保存する
- `constellation_note`: わたしの星座の説明
- `notify_authors_when_i_archive`: 自分のArchiveを相手に通知するかどうか
- `notify_authors_when_i_resonate`: 自分の共鳴を相手に通知するかどうか
- `created_at`: 作成日時
- `updated_at`: 更新日時

RLS方針:

- 誰でもselect可能
- insert / update / delete は本人のみ

補足:

- `notify_authors_when_i_archive` はデフォルトONです。OFFの場合、自分が誰かの流星便をArchiveしても相手にR.Connect通知を作りません。
- `notify_authors_when_i_resonate` はデフォルトONです。OFFの場合、自分が誰かの流星便に共鳴しても相手にR.Connect通知を作りません。

### posts

流星便を保存します。

MVPの投稿タイプ:

- `text`
- `image`
- `audio`
- `video`
- `youtube`

主なカラム:

- `id`: 流星便ID
- `author_id`: 投稿者
- `type`: 投稿タイプ
- `body`: 本文
- `media_url`: 画像、音声、動画のURL
- `youtube_url`: YouTube URL
- `youtube_video_id`: YouTube動画ID
- `duration_seconds`: 音声・動画の長さ
- `visibility`: `public` または `private`
- `created_at`: 作成日時
- `updated_at`: 更新日時
- `deleted_at`: ソフト削除時刻。通常の一覧では `null` の流星便だけ表示する

RLS方針:

- `public` の流星便は誰でもselect可能
- `private` の流星便は本人のみselect可能
- insert / update / delete は投稿者本人のみ

補足:

- `followers` 公開は初期MVPでは使いません。将来の観測者機能で検討します。
- 画像投稿MVPでは、画像ファイル本体は `meteor-media` bucket、画像メタデータは `post_media` に保存します。
- 動画投稿MVPでは、動画本体は `meteor-video` bucket、動画サムネイルは `meteor-media` bucket、動画メタデータは `post_media` に保存します。
- `image` / `video` は `post_media` を使うため `media_url` は必須にしていません。
- `audio` は `media_url` を必須にしています。
- `youtube` は `youtube_url` と `youtube_video_id` を必須にしています。
- 画像のみ投稿では、`posts.body` に空文字 `""` を保存できます。
- 流星便削除MVPでは物理削除せず、`deleted_at` を入れて画面上から非表示にします。共鳴、Archive、星文、通知は保持します。

### post_media

流星便に添える画像 / 短尺動画メタデータを保存します。

主なカラム:

- `id`: メディアID
- `post_id`: 対象流星便
- `uploader_id`: アップロードしたユーザー
- `media_type`: `image` または `video`
- `storage_path`: 画像は `meteor-media`、動画は `meteor-video` bucket 内のStorage path
- `thumbnail_storage_path`: 動画カード用サムネイルの `meteor-media` bucket 内Storage path。任意
- `duration_seconds`: 動画の再生時間。動画は35秒以内
- `sort_order`: 画像は0から3まで。動画は0固定
- `mime_type`: 画像は `image/jpeg`, `image/png`, `image/webp`。動画は `video/mp4`, `video/quicktime`, `video/webm`
- `size_bytes`: 画像は8MB以内。動画は100MB以内
- `created_at`: 作成日時

制約:

- 1投稿につき最大4枚
- 1投稿につき動画は最大1本
- 画像と動画は同一投稿に混在させない
- 動画は35秒以内、100MB以内
- 同一投稿内で `sort_order` は重複しない
- `storage_path` は重複しない
- 公開URLはDBに固定保存せず、クライアント側で `storage_path` から生成する

RLS方針:

- 公開中かつ削除されていない流星便の画像 / 動画メタデータはselect可能
- 投稿者本人は自分の流星便に紐づく画像 / 動画メタデータをselect可能
- insertはログインユーザーのみ
- insert時は `uploader_id = auth.uid()` かつ対象流星便の `author_id = auth.uid()` の場合のみ許可
- deleteは自分がアップロードしたメディア行のみ許可
- updateはMVPでは許可しない

### 短尺動画制限

音声は30秒以内、流星便動画投稿MVPの動画は35秒以内のみ投稿可能にする方針です。

DBでは、音声の `posts.duration_seconds` は30秒以内、動画の `post_media.duration_seconds` は35秒以内の制約を入れています。

ただし、DB制約だけではアップロードされた実ファイルの長さを完全には検証できません。実装時は以下でも検証します。

- クライアント側: 投稿前の長さチェック
- サーバー側: Storage保存前または保存後の検証
- DB側: `duration_seconds` の保存値に対する最終制約

### profile_tags

わたしの星座を形づくるタグを保存します。

主なカラム:

- `id`: タグID
- `profile_id`: 対象プロフィール
- `label`: タグ名
- `kind`: タグの種類
- `created_at`: 作成日時

RLS方針:

- selectは公開プロフィールの一部として誰でも可能
- insert / update / delete は本人のみ

### post_tags

流星便タグを保存します。

現在の流星タグMVPでは、本文中の `#音楽` などを検索可能にする正テーブルとして `meteor_tags` / `post_meteor_tags` を使います。`post_tags` は既存設計として残しますが、固定の `#流星便` / `#観測待ち` 表示には使いません。

主なカラム:

- `id`: タグID
- `post_id`: 対象流星便
- `label`: タグ名
- `created_at`: 作成日時

RLS方針:

- 紐づく流星便が見える場合のみselect可能
- insert / update / delete は流星便の投稿者本人のみ

### meteor_tags

流星便本文中に入力された `#` 付きの流星タグを、検索・一覧化できるようにするタグ辞書です。

主なカラム:

- `id`: 流星タグID
- `name`: 表示用のタグ名。最初に作成された自然な表記を維持する
- `normalized_name`: 検索・重複防止用の正規化名
- `created_by`: 最初にタグを作成したプロフィール
- `created_at`: 作成日時

正規化ルール:

- 先頭の `#` は保存しない
- 前後空白を除去
- Unicode NFKCで正規化
- 英字大小は検索用キーで区別しない
- 1タグ最大30文字
- 空文字は禁止

RLS方針:

- タグ辞書自体は誰でもselect可能
- insertはログイン済みユーザーのみ
- `created_by = auth.uid()` の場合のみinsert可能
- update / delete はMVPでは許可しない

### post_meteor_tags

流星便と流星タグの関連を保存します。

主なカラム:

- `post_id`: 対象流星便
- `tag_id`: 対象流星タグ
- `sort_order`: 本文中で最初に出現した順序。0から2まで
- `created_at`: 作成日時

制約:

- 1投稿最大3個
- 同じタグを同一投稿へ重複登録しない
- 同一投稿内で `sort_order` は重複しない
- 投稿削除時は関連行も削除

RLS方針:

- 公開中かつ削除されていない流星便に紐づくタグ関連はselect可能
- 投稿者本人は自分の流星便に紐づくタグ関連をselect可能
- insert / delete は対象流星便の投稿者本人のみ
- updateはMVPでは許可しない

補足:

- `流星タグ` は流星便へ付けるタグです。
- My Star Chart側の `星タグ` とは別機能として扱います。
- 本文中のタグ表示は黄色 / 金色で表示し、青色の一般的なハッシュタグ表示にはしません。

### resonances

共鳴を保存します。

共鳴は一般的ないいねではなく、心が反応した印です。

主なカラム:

- `id`: 共鳴ID
- `post_id`: 対象流星便
- `profile_id`: 共鳴したユーザー
- `resonance_type`: 共鳴の種類
- `created_at`: 作成日時

`resonance_type` の例:

- `silent`
- `sparkle`
- `afterglow`
- `life`
- `world`
- `deep`

RLS方針:

- 公開中かつ削除されていない流星便、または投稿者本人の流星便に紐づく共鳴はselect可能
- ログインユーザーのみ、自分の共鳴をinsert可能
- 自分の共鳴のみdelete可能

補足:

- 初期MVPでは、同じユーザーが同じ流星便に何度も共鳴できる設計です。
- `resonances` に `unique(post_id, profile_id)` は追加しません。
- 共鳴が作成されると、DBトリガーで流星便の作者にR.Connect通知を作成します。
- 共鳴通知は、同じ `recipient_id` / `actor_id` / `post_id` の組み合わせにつき1件だけ作成します。

### notifications

R.Connectに表示する通知を保存します。

MVPでは、共鳴された時、Archiveされた時、星文が届いた時に流星便の作者へ通知を残します。

主なカラム:

- `id`: 通知ID
- `recipient_id`: 通知を受け取るユーザー
- `actor_id`: 通知のきっかけを作ったユーザー
- `post_id`: 対象流星便
- `type`: 通知タイプ
- `message`: 通知文
- `is_read`: 既読状態
- `created_at`: 作成日時

`type`:

- `resonance`
- `archive`
- `star_letter`

RLS方針:

- `recipient_id = auth.uid()` の本人のみselect可能
- 本人のみ `is_read` をupdate可能
- フロントエンドからの自由なinsertは許可しない
- 通知作成は `resonances` / `archives` / `star_letters` insert時のDBトリガーで行う

トリガー方針:

- `resonances.post_id` から `posts.author_id` を取得する
- `posts.author_id` を `recipient_id` として通知を作成する
- `resonances.profile_id` を `actor_id` として保存する
- 自分の流星便に自分で共鳴した場合は通知を作らない
- 共鳴したユーザーの `profiles.notify_authors_when_i_resonate` がfalseの場合は通知を作らない
- messageはMVPでは `あなたの流星便に共鳴が届きました。` の固定文にする
- `archives.post_id` から `posts.author_id` を取得する
- `archives.profile_id` を `actor_id` として保存する
- 自分の流星便を自分でArchiveした場合は通知を作らない
- Archiveしたユーザーの `profiles.notify_authors_when_i_archive` がfalseの場合は通知を作らない
- Archive通知のmessageはMVPでは `あなたの流星便がArchiveされました。` の固定文にする
- `star_letters.post_id` から `posts.author_id` を取得する
- `star_letters.author_id` を `actor_id` として保存する
- 自分の流星便に自分で星文した場合は通知を作らない
- 星文通知のmessageはMVPでは `あなたの流星便に星文が届きました。` の固定文にする

補足:

- 表示名を含む通知文は、UI側で `actor_id` から組み立てます。
- AI住人観測の通知は今後追加します。

### feedbacks

星の目安箱に届いたフィードバックを保存します。

先行住民テスターからの不具合、分かりにくい点、改善案、ほしい機能、感想などを集めるためのMVPテーブルです。

主なカラム:

- `id`: フィードバックID
- `user_id`: 送信したログインユーザー
- `type`: フィードバック種別
- `body`: 本文
- `status`: 運営確認用ステータス
- `created_at`: 作成日時

`type`:

- `不具合`
- `分かりにくい`
- `改善案`
- `ほしい機能`
- `感想`
- `その他`

RLS方針:

- ログインユーザーのみ、自分のフィードバックをinsert可能
- `user_id = auth.uid()` の本人のみselect可能
- update / delete はMVPでは許可しない
- 他人のフィードバックは読めない
- `service_role` はフロントエンドでは使わない

補足:

- MVPでは本文は1000文字以内です。
- 管理画面、運営返信、メール通知、未ログイン送信はまだ実装しません。

### star_letters

星文を保存します。

星文はコメントではなく、流星便に残す言葉として扱います。

主なカラム:

- `id`: 星文ID
- `post_id`: 対象流星便
- `author_id`: 星文を書いたユーザー
- `body`: 星文本文
- `created_at`: 作成日時
- `updated_at`: 更新日時

RLS方針:

- 見える流星便に紐づく星文はselect可能
- ログインユーザーのみ、自分の星文をinsert可能
- update / delete は星文を書いた本人のみ

### archives

Archiveを保存します。

Archiveは単なる保存ではなく、「消したくない光を記録する」機能です。

主なカラム:

- `id`: Archive ID
- `profile_id`: Archiveしたユーザー
- `post_id`: 対象流星便
- `note`: 自分用メモ
- `archive_tags`: Archive分類タグ
- `work_constellation`: 作品につける星座名
- `observed_mood`: 観測した気分
- `created_at`: 作成日時

RLS方針:

- select / insert / update / delete は本人のみ
- 他人のArchiveは見えない前提

通知方針:

- Archive作成時、対象流星便の作者に `archive` 通知を作成します。
- Archive解除時の通知はMVPでは作りません。
- Archiveした本人が通知設定をOFFにしている場合、相手への通知は作りません。

### observations

観測ログを保存します。

人間の閲覧ログだけでなく、将来のAI住人観測APIの出力も保存できる形にします。
AI住人の内部判断や下書きが入るため、browser roleから raw table を直接selectさせません。

主なカラム:

- `id`: 観測ログID
- `post_id`: 観測された流星便
- `observer_id`: 人間の観測者ID
- `observer_type`: `human` または `ai_resident`
- `ai_resident_key`: AI住人の識別キー
- `observation_type`: 観測の種類
- `note`: 観測メモ
- `analysis_summary`: AI住人の観測要約
- `observed_points`: 観測したポイントのJSON配列
- `resonance_score`: 共鳴スコア
- `should_comment`: 星文すべきか
- `should_recommend`: おすすめ観測に出すべきか
- `comment`: AI住人の星文候補
- `recommendation_message`: おすすめ判定メッセージ
- `x_post_draft`: X投稿下書き
- `archive_tags`: Archiveタグ候補のJSON配列
- `work_constellation`: 作品につける星座名
- `created_at`: 作成日時

RLS / 権限方針:

- `anon` / `authenticated` から `observations` raw table への直接selectは許可しない
- 現在のフロントエンドは `observations` を直接参照しない
- 将来public表示が必要な場合は、安全な列だけを返すviewまたはRPCを別途追加する
- AI処理はフロントエンドではなく、信頼できるサーバー側処理から扱う

`observer_type`:

- `human`
- `ai_resident`

`observation_type`:

- `view`
- `ai_observation`
- `archive_classification`
- `recommendation_check`
- `deep_observation`

RLS方針:

- 公開流星便に紐づく観測ログはselect可能
- 自分が観測したログ、または自分の流星便に紐づくログはselect可能
- 人間ユーザーは、自分の `human` 観測ログのみinsert / update / delete可能
- AI住人の書き込みは将来のサーバー側 `service_role` 運用で行う

注意:

- RLSは行単位の制御なので、`analysis_summary` や `x_post_draft` などを画面に出すかどうかはアプリ側/API側でも制御します。
- 公開画面にAI内部情報をそのまま出したくない場合は、将来 `is_public` カラムや公開用ビューを追加します。

## 今回まだ実装しないこと

今回のPRでは、以下は実装しません。

- React側のSupabase接続
- Supabase SDKの追加
- ログインUI
- 会員登録
- Netlify環境変数設定
- Supabase Storage
- AI API接続
- AI住人のサーバー処理
- R.Connect通知の画面表示
- 本番デプロイ操作

## SQL Editor投入前の注意

`supabase/schema.sql` はMVP初期投入向けのSQLです。

すでに古いドラフトSQLをSupabaseに投入済みの場合は、このSQLをそのまま再実行する前に、既存テーブルの有無とデータを確認してください。必要に応じて、初期化するか、差分マイグレーションとして分けて実行します。

R.Connect通知基盤だけを既存DBに追加する場合は、`supabase/migrations/20260525_add_notifications.sql` をSupabase SQL Editorで実行してください。

Archive通知MVPと共鳴/Archive通知設定を既存DBに追加する場合は、`supabase/migrations/20260602_add_archive_notifications.sql` をSupabase SQL Editorで実行してください。

星文のR.Connect通知triggerを既存DBに追加する場合は、`supabase/migrations/20260612_add_frontend_notifications.sql` をSupabase SQL Editorで実行してください。

流星便編集・削除MVPでソフト削除を有効にする場合は、`supabase/migrations/20260605_add_post_soft_delete.sql` をSupabase SQL Editorで実行してください。

星の目安箱のフィードバック保存MVPを既存DBに追加する場合は、`supabase/migrations/20260608_add_feedbacks.sql` をSupabase SQL Editorで実行してください。

APIキー、publishable key、secret key、service_role key はリポジトリに入れません。

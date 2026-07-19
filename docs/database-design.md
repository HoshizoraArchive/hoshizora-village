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
- `legal_consents`: 利用規約・プライバシーポリシーへの同意記録
- `profile_frames`: プロフィールアイコンフレームのカタログ
- `profile_frame_ownerships`: プロフィールごとのアイコンフレーム所持情報
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
- `ai_observation_jobs`: AI住人観測ジョブ

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
- `post_media.storage_path` と `thumbnail_storage_path` はDB制約でも `uploader_id` のUUIDフォルダ配下に限定する
- Storage path所有者制約はCHECK式に直接記述し、`authenticated` が `app_private` 関数を実行する必要がない形にする
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
- `supabase/migrations/20260702_add_profile_icon_frames.sql`
- `supabase/migrations/20260703_add_ai_observation_security_foundation.sql`
- `supabase/migrations/20260710120000_add_legal_consents.sql`

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
- `active_frame_id`: 現在装着中のプロフィールアイコンフレーム。nullならフレームなし
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
- `active_frame_id` はDB triggerで `profile_frame_ownerships` による所持確認を行い、所持していないフレームIDを直接送っても保存できません。

### legal_consents

利用規約とプライバシーポリシーへの同意記録を保存します。

主なカラム:

- `id`: 同意記録ID
- `user_id`: Supabase AuthのユーザーID
- `terms_version`: 同意した利用規約の版。MVPでは `2026-07-10`
- `privacy_version`: 同意したプライバシーポリシーの版。MVPでは `2026-07-10`
- `accepted_at`: 同意を記録した時刻
- `age_confirmed_at`: 18歳以上であることを確認した時刻
- `created_at`: レコード作成日時

制約:

- `user_id + terms_version + privacy_version` は重複不可
- versionは空文字を禁止し、最大32文字

RLS方針:

- `anon` は権限なし
- `authenticated` は本人の同意記録だけselect可能
- `authenticated` は `public.record_legal_consent(...)` RPCからのみ本人の同意記録を作成可能
- `service_role` は運用確認用にselect / insertのみ許可
- 他ユーザーの同意記録はブラウザから読めない

補足:

- 既存ユーザーへの強制再同意は今回実装しません。
- 会員登録時は同意版と18歳以上確認をAuth metadataへ渡し、`auth.users` 作成triggerがDBサーバー時刻で `legal_consents` を作成します。
- Auth metadataに現行versionまたは18歳以上確認が無い新規 `auth.users` insertは、triggerが `LEGAL_CONSENT_REQUIRED` でロールバックします。
- サインアップ直後にセッションがある場合とログイン時の補完では、`public.record_legal_consent(...)` RPCが `auth.uid()` とDBサーバー時刻で記録します。
- ブラウザから `legal_consents` へ直接insertする権限は付与しません。
- 本番Supabaseには、レビュー後に `supabase/migrations/20260710120000_add_legal_consents.sql` を適用します。
- 適用後は `docs/legal-consent-verification.sql` でgrant、RLS、RPC定義、Auth trigger定義を確認します。

### profile_frames

プロフィールアイコンに重ねる透過PNGフレームのカタログです。

主なカラム:

- `id`: フレームID
- `frame_key`: アプリ内で参照する一意キー。例: `chia_guide`
- `name`: 表示名
- `description`: 説明文
- `asset_path`: public配下の透過PNGパス。例: `/profile-frames/chia-guide.png`
- `acquisition_type`: 入手種別。MVPでは `admin_grant`
- `rarity`: 将来用のレアリティ
- `frame_scale`: プロフィール画像に対するフレーム表示倍率
- `frame_offset_x`: フレーム表示位置のX方向調整
- `frame_offset_y`: フレーム表示位置のY方向調整
- `is_active`: 利用中かどうか
- `created_at`: 作成日時
- `updated_at`: 更新日時

RLS方針:

- 有効なフレームカタログは `anon` / `authenticated` がselect可能
- ブラウザroleからinsert / update / delete / truncateは許可しない

初期データ:

- `chia_guide`: 星空ちあ｜街の案内人
- asset: `/profile-frames/chia-guide.png`
- 入手方法: 運営付与のみ

### profile_frame_ownerships

どのプロフィールがどのアイコンフレームを所持しているかを保存します。

主なカラム:

- `id`: 所持レコードID
- `profile_id`: 所持者プロフィール
- `frame_id`: 所持フレーム
- `acquisition_source`: 付与元。MVPでは `operator_grant`
- `granted_at`: 付与日時

制約:

- `profile_id + frame_id` は重複不可

RLS方針:

- ログイン中ユーザーは自分の所持フレームだけselect可能
- ブラウザroleからinsert / update / delete / truncateは許可しない
- 付与は運営・管理者・信頼されたサーバー側処理で行う

運営付与:

- migration本体には星空ちあのUUIDをハードコードしません
- 付与と装着は `docs/profile-frame-operations.sql` のSQL例で、`username = 'chia_hoshizora'` と `email = 'akaibuhoshizora+chia@gmail.com'` を確認してから実行します

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
- `storage_path` / `thumbnail_storage_path` は、空パス、先頭/末尾スラッシュ、空セグメント、`.` / `..`、バックスラッシュ、`%` を拒否し、先頭セグメントを `uploader_id::text` と一致させる
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

人間の閲覧ログだけでなく、AI住人観測APIの検証済み出力も保存できる形にします。
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

- `anon` / `authenticated` からraw tableを直接selectさせない
- 公開表示が必要な場合は、安全な列だけを返すviewまたはRPCを別途追加する
- 人間ユーザーは、自分の `human` 観測ログのみinsert / update / delete可能
- AI住人の書き込みはNetlify Functionの信頼済みサーバー側 `service_role` 処理で行う

注意:

- `analysis_summary` や `x_post_draft` などの内部情報を公開画面へ直接出さない。
- 将来公開が必要な観測情報は、公開用ビュー/RPCで列を絞って扱います。

### ai_observation_jobs

AI住人の観測処理を安全に予約・状態管理する内部ジョブテーブルです。
このテーブルはブラウザから直接操作させず、Netlify Functionなど信頼済みサーバー側処理が `service_role` で扱います。

主なカラム:

- `post_id`: 観測対象の流星便
- `requested_by`: 予約した運営ユーザー
- `ai_resident_key`: MVPでは `hoshizora_chia`
- `provider`: MVPでは `gemini`
- `model`: サーバー側で固定するモデル名
- `status`: `queued`, `processing`, `succeeded`, `failed`, `cancelled`
- `idempotency_key`: 同じリクエストの二重受理防止
- `request_fingerprint`: 投稿本文、投稿タイプ、YouTube識別情報、更新時刻、media summary、個別 `post_media` 行を含む入力識別用ハッシュ
- `observation_context`: `manual` または投稿後自動観測の `auto_text_post`
- `not_before_at`: workerがclaimしてよい最短時刻。自動観測を即時固定にしないために使う
- `attempt_count`: provider APIを実際に呼び出した回数
- `max_attempts`: 1つの観測処理で許可するprovider API呼び出し総数
- `reserved_cost_micro_usd`: 予約時に利用上限へ計上するmicro USD
- `actual_cost_micro_usd`: provider usageから推定したmicro USD。請求書上の確定額ではない
- `observation_id`: 完了RPCで作成した `observations` 行
- `star_letter_id`: 星文を残した場合に完了RPCで作成した `star_letters` 行
- `public_error_code`: 外部へ出してよい短いエラーコード

`request_fingerprint` のcanonical対象は、JS (`netlify/functions/_shared/aiJobReservation.mjs`) とDB (`app_private.ai_observation_current_request_fingerprint`) で揃えます。
最上位キー順は `aiResidentKey`, `body`, `media`, `mediaRows`, `postId`, `postType`, `updatedAt`, `youtubeUrl`, `youtubeVideoId` です。
`media` は `inputDurationSeconds`, `inputKind`, `inputSizeBytes` の順です。
`mediaRows` は `sort_order`, `id` 昇順で、各行の `durationSeconds`, `id`, `mediaType`, `mimeType`, `sizeBytes`, `sortOrder`, `storagePath`, `thumbnailStoragePath`, `uploaderId` を含めます。
completion RPCはtransaction内で対象 `posts` を `FOR UPDATE`、対象 `post_media` を安定順で `FOR SHARE` し、DB内で再計算したfingerprintがjob保存値とworker入力値の両方に一致する場合だけobservation/star_letterを確定します。

制約 / 権限方針:

- `idempotency_key` はunique
- 同じ `post_id` + `ai_resident_key` の `queued` / `processing` は1件だけ
- 同じ `post_id` + `ai_resident_key` の `succeeded` は1件だけ
- `observation_context` は `manual` / `auto_text_post` のみ
- `attempt_count <= max_attempts`
- RLSを有効化し、`anon` / `authenticated` / `PUBLIC` の直接操作権限を付与しない
- 予約処理は `public.reserve_ai_observation_job(...)` でDB側transaction内に閉じる
- workerは `public.claim_ai_observation_job(...)` でrow lockを取り、同じjobの並列処理を防ぐ
- provider呼び出し直前に `public.start_ai_observation_attempt(...)` で `attempt_count` を増やす
- `public.complete_ai_observation_job(...)` は期待fingerprintと公開・未削除状態を確認し、`observations` insert、`auto_text_post` の場合のちあ名義 `resonances` insert、必要時の `star_letters` insert、job `succeeded` 更新を同一transactionで行う
- `auto_text_post` の星文は、Function側の確率・confidence判定に加えて、completion RPC内で星空ちあ全体の日次上限と投稿者単位クールダウンを確認し、上限時は観測結果だけ保存して星文作成を抑制する
- `public.fail_ai_observation_job(...)` と `public.cancel_ai_observation_job(...)` は安全な公開エラーコードだけを保存する
- `public.recover_stale_ai_observation_jobs(...)` はservice_role専用で、worker timeoutなどにより古くなった `processing` jobだけを `cancelled` + `WORKER_STALE` へ戻し、同じ投稿の将来予約を詰まらせない。Geminiの自動再送は行わない
- すべてのAI job RPCは `security definer` + `set search_path = ''` とし、browser roleからのEXECUTEを許可しない

本番適用時は、先に `docs/ai-resident-security-preflight.sql` を実行し、既存 `post_media` のStorage path違反件数がすべて0件であることを確認してからmigrationを適用します。適用後は `docs/ai-resident-security-verification.sql` で制約、RLS、GRANT、RPC権限を確認します。

## はじめての入村案内

### `guide_sections`

入村案内の最上位セクションと子カテゴリーを管理します。

- `section_key`: 外部運用でも1行を特定できる、作成後変更不可の安定キー
- `parent_id`: `null`なら最上位、値があれば子カテゴリー
- `display_variant`: `standard` / `subsection` / `notice`
- `sort_order`: 同じ階層内の表示順
- `is_visible`: 一般閲覧画面へ表示するか

### `guide_entries`

段落または一覧項目を1行ずつ管理します。案内全体をJSONへまとめず、`entry_key`を指定して単発追加・更新・非表示・削除できます。

- `section_id`: 所属セクション
- `entry_key`: 作成後変更不可の安定キー
- `entry_type`: `paragraph` / `list_item`
- `body`: プレーンテキスト本文
- `sort_order`: セクション内の表示順
- `is_visible`: 一般閲覧画面へ表示するか
- `updated_by`: ブラウザ管理画面で更新したAuthユーザー。triggerが`auth.uid()`を記録する

### `app_admins`

管理画面とguideテーブルの書き込みを許可するAuthユーザーだけを保持します。ブラウザへ一覧を公開せず、`public.is_app_admin()`は現在ログイン中の本人が管理者かだけを返します。

RLSでは`anon`と一般`authenticated`へ公開行のSELECTだけを許可します。管理者は全行SELECTとINSERT / UPDATE / DELETEが可能です。管理者ボタンの非表示は補助であり、書き込み境界はRLSです。管理者登録と単発更新例は`docs/village-guide-operations.sql`、適用後確認は`docs/village-guide-verification.sql`を使用します。

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

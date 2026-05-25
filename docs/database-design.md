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
- `profile_tags`: わたしの星座
- `post_tags`: 流星便タグ
- `resonances`: 共鳴
- `notifications`: R.Connect通知
- `star_letters`: 星文
- `archives`: Archive
- `observations`: 観測ログ

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
- `avatar_url`: アイコン画像URL
- `constellation_note`: わたしの星座の説明
- `created_at`: 作成日時
- `updated_at`: 更新日時

RLS方針:

- 誰でもselect可能
- insert / update / delete は本人のみ

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

RLS方針:

- `public` の流星便は誰でもselect可能
- `private` の流星便は本人のみselect可能
- insert / update / delete は投稿者本人のみ

補足:

- `followers` 公開は初期MVPでは使いません。将来の観測者機能で検討します。
- `image/audio/video` は `media_url` を必須にしています。
- `youtube` は `youtube_url` と `youtube_video_id` を必須にしています。

### 30秒制限

音声・動画は30秒以内のみ投稿可能にする方針です。

DBでは `posts.duration_seconds` を保存し、`audio` / `video` の場合は `duration_seconds <= 30` の制約を入れています。

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

主なカラム:

- `id`: タグID
- `post_id`: 対象流星便
- `label`: タグ名
- `created_at`: 作成日時

RLS方針:

- 紐づく流星便が見える場合のみselect可能
- insert / update / delete は流星便の投稿者本人のみ

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

- 見える流星便に紐づく共鳴はselect可能
- ログインユーザーのみ、自分の共鳴をinsert可能
- 自分の共鳴のみdelete可能

補足:

- 初期MVPでは、同じユーザーが同じ流星便に何度も共鳴できる設計です。
- 将来、1投稿1ユーザー1共鳴にする場合は `unique(post_id, profile_id)` を追加します。
- 共鳴が作成されると、DBトリガーで流星便の作者にR.Connect通知を作成します。

### notifications

R.Connectに表示する通知を保存します。

MVPでは、共鳴された時に流星便の作者へ通知を残します。

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

RLS方針:

- `recipient_id = auth.uid()` の本人のみselect可能
- 本人のみ `is_read` をupdate可能
- フロントエンドからの自由なinsertは許可しない
- 通知作成は `resonances` insert時のDBトリガーで行う

トリガー方針:

- `resonances.post_id` から `posts.author_id` を取得する
- `posts.author_id` を `recipient_id` として通知を作成する
- `resonances.profile_id` を `actor_id` として保存する
- 自分の流星便に自分で共鳴した場合は通知を作らない
- messageはMVPでは `あなたの流星便に共鳴が届きました。` の固定文にする

補足:

- 表示名を含む通知文は、将来UI側で `actor_id` から組み立てます。
- 星文、Archive、AI住人観測の通知は今後追加します。

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

### observations

観測ログを保存します。

人間の閲覧ログだけでなく、将来のAI住人観測APIの出力も保存できる形にします。

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

APIキー、publishable key、secret key、service_role key はリポジトリに入れません。

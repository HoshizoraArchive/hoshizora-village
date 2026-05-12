# 星空Village Supabase設計メモ

このドキュメントは、星空Villageを本物のSNSに近づけるためのSupabase導入準備です。

まだ本番実装ではなく、ログイン、流星便保存、プロフィール保存を始める前の設計たたき台です。

## Supabaseでやりたいこと

### Auth

Supabase Authは、会員登録とログインに使います。

将来的には、ユーザーが自分のアカウントを作り、プロフィールや流星便を自分のデータとして持てるようにします。

### Database

Supabase Databaseは、星空VillageのSNSデータを保存する場所です。

主に以下を保存します。

- 流星便
- プロフィール
- わたしの星座
- 共鳴
- 星文
- Archive
- 観測ログ

### 将来の拡張

将来的には、AI住人の観測ログや、AI住人が残した星文も保存できるようにします。

AI住人も単なる機能ではなく、星空Villageの住人として記録を持てる設計にしておきます。

## テーブル案

### profiles

ユーザープロフィールを保存します。

Supabase Authで作られたユーザーIDとつなげて、画面に表示する名前や自己紹介を持たせます。

主な項目:

- `id`: ユーザーID
- `display_name`: 表示名
- `username`: @から始まるようなユーザー名
- `bio`: 自己紹介
- `avatar_url`: アイコン画像URL
- `constellation_note`: わたしの星座の説明
- `created_at`: 作成日時
- `updated_at`: 更新日時

### posts

流星便を保存します。

通常のSNSでいう投稿ですが、星空Villageでは「流星便」として扱います。

主な項目:

- `id`: 流星便ID
- `author_id`: 投稿者
- `body`: 本文
- `visibility`: 公開範囲
- `created_at`: 作成日時
- `updated_at`: 更新日時

### profile_tags

わたしの星座を形づくるタグを保存します。

好きなもの、趣味、特技、創作傾向、よく書くテーマなどを入れる想定です。

主な項目:

- `id`: タグID
- `profile_id`: どのプロフィールのタグか
- `label`: タグ名
- `kind`: タグの種類
- `created_at`: 作成日時

### post_tags

流星便タグを保存します。

投稿ごとのテーマ、感情、夜の気分、創作ジャンルなどを入れる想定です。

主な項目:

- `id`: タグID
- `post_id`: どの流星便のタグか
- `label`: タグ名
- `created_at`: 作成日時

### resonances

共鳴を保存します。

星空Villageの共鳴は、一般的ないいねよりも「心が反応した記録」に近いものです。

何回でも押せる前提にするため、同じ人が同じ流星便に複数回共鳴できる設計にします。

主な項目:

- `id`: 共鳴ID
- `post_id`: どの流星便への共鳴か
- `profile_id`: 誰が共鳴したか
- `created_at`: 作成日時

### star_letters

星文を保存します。

通常のコメントではなく、投稿に残す短い言葉として扱います。

主な項目:

- `id`: 星文ID
- `post_id`: どの流星便への星文か
- `author_id`: 星文を書いた人
- `body`: 星文本文
- `created_at`: 作成日時
- `updated_at`: 更新日時

### archives

Archiveを保存します。

ただの保存ではなく、「消したくない光を記録する」機能として扱います。

主な項目:

- `id`: Archive ID
- `profile_id`: 誰のArchiveか
- `post_id`: 保存した流星便
- `note`: 自分用メモ
- `created_at`: 作成日時

### observations

観測ログを保存します。

人間やAI住人が流星便を観測した記録を残すためのテーブルです。

将来的には、AI住人がどの流星便を見て、どんな反応をしたかを残せるようにします。

主な項目:

- `id`: 観測ログID
- `post_id`: 観測された流星便
- `observer_id`: 人間の観測者
- `observer_type`: `human` または `ai_resident`
- `ai_resident_key`: AI住人の識別名
- `note`: 観測メモ
- `created_at`: 作成日時

## RLSについて

Row Level Securityは、本番投入前に必ず詰めます。

最初は以下の方針で考えます。

- 公開された流星便は誰でも読める
- 作成、編集、削除は本人だけができる
- プロフィール編集は本人だけができる
- Archiveは本人だけが読める
- 共鳴や星文はログインユーザーだけが作成できる

`supabase/schema.sql` には初期テーブル案だけを置き、RLSポリシーはコメントとして残します。

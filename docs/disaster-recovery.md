# 星空Village Disaster Recovery

星空Villageはβユーザーの投稿・プロフィール・画像・動画を預かるため、Production Supabaseとは別の基盤にも復旧用コピーを保持します。

## 現在の前提

- Production Supabase project: `hoshizora-village`
- Supabase organization plan: Free
- Free planでは、Supabase公式も定期的な`supabase db dump`とoff-site backupを推奨している
- SupabaseのDatabase BackupにはStorage APIのファイル実体は含まれない
- DB schema / RLS / RPC / migration履歴はGitHubでバージョン管理する
- ユーザーデータとStorage実体はProduction Supabaseとは別のNetlify Blobsへ退避する

## 自動バックアップ

Productionの`disaster-recovery-backup` Scheduled Functionが1分ごとに起動します。

通常時はstateだけを確認して即終了し、前回成功から24時間経過した時だけ新しいbackup runを開始します。Storageファイルは1 invocationにつき1件ずつコピーするため、30秒のScheduled Function上限に大きな動画1件が収まる構成にします。

### DB

`create_disaster_recovery_snapshot()`をservice_roleからだけ実行し、次をJSON snapshotとしてNetlify Blobsへ保存します。

- `public` schemaの全table data
- `auth.users`
- `auth.identities`

Authのsession / refresh tokenは保存しません。`auth.users`についてもconfirmation / recovery / email-change / reauthenticationの一時tokenはsnapshotから除外します。災害復旧後は既存sessionを引き継ぐ前提にせず、利用者は再ログインします。

DBの構造自体はGitHubの`s​​upabase/schema.sql`と`s​​upabase/migrations/`を正とします。

### Storage

全bucketを列挙し、全objectをNetlify Blobsへコピーします。各objectについてSHA-256を記録し、書き込み直後にBlobから読み戻してchecksum一致を確認します。

対象には現在、以下のbucketが含まれます。

- `avatars`
- `meteor-media`
- `meteor-video`

将来bucketが増えた場合も`listBuckets()`から自動検出します。

## 復元可能性の自動確認

backup runの全Storage objectをコピーした後、保存したbackupから復元テストを行います。

### DB restore verification

Netlify Blobsに保存したJSONを読み戻し、service_role専用`verify_disaster_recovery_snapshot(jsonb)`へ渡します。

RPCは本番tableを書き換えず、transaction内のtemporary tableへ各tableのrow typeとして復元し、row countがsnapshotと一致することを確認します。Auth users / identitiesも同様にtyped temporary tableへ復元します。

### Storage restore verification

backup内の最小objectをNetlify Blobsから読み戻し、Production Supabase内に一時的なprivate verification bucketを作成してuploadします。その後もう一度downloadし、SHA-256がbackupと一致することを確認します。

verification objectとbucketは確認後に削除します。通常の`avatars` / `meteor-media` / `meteor-video`には書き込みません。

## 保存世代

成功したbackup runは直近3世代をNetlify Blobsに保持します。

各runには以下が保存されます。

- database snapshot
- Storage object実体
- manifest
- database restore verification結果
- Storage restore verification結果
- backup作成時のGit commit ref

古いrunは新しいrunが正常完了した後に削除します。途中失敗中のrunは削除対象にしません。

## Production以外では動かさない

backup function自身が`CONTEXT=production`を必須にします。

Deploy Previewでは`SUPABASE_SERVICE_ROLE_KEY`を空にしているため、未マージコードからこのbackupを実行できません。またScheduled Functionsはpublished Production deployだけでschedule実行されます。

## 完全なSupabase logical dump

この自動backupは、β運営時の迅速なdata / Storage disaster recoveryを目的とした二重化です。

加えて、大きなschema変更前・定期保全時にはSupabase公式手順のlogical dumpを保存します。

```bash
supabase db dump --db-url "$SOURCE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SOURCE_DB_URL" -f schema.sql
supabase db dump --db-url "$SOURCE_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

`SOURCE_DB_URL`にはDatabase passwordを含むためGitHub、README、PR、チャットへ記載しません。dump fileもpublic repositoryへcommitせず、暗号化した外部保存先へ保管します。

完全なproject復旧ではSupabase公式のBackup and Restore手順に従い、DB dumpを新projectへrestoreした後、Storage objectを別途戻します。

## 障害時の復旧順

1. 新しいSupabase projectを用意する
2. GitHubのschema / migrationsを基準にDB構造を確認する
3. 最新のlogical dumpがある場合は公式手順でrestoreする
4. logical dumpが使えない緊急時は最新Netlify Blobs snapshotを復旧資料として使う
5. Storage backupからbucket / objectを復元する
6. Auth / Realtime / API key / Netlify環境変数などproject外設定を再設定する
7. row count、主要profile / post、Storage checksumを確認する
8. Netlifyの接続先を新projectへ切り替える
9. 実機でlogin、投稿表示、画像・動画、共鳴、星文、Archive、R.Connectを確認する

## β開始前の完了条件

- Production backupが1run以上正常完了している
- manifestでDB restore verificationが成功している
- manifestでStorage restore verificationが成功している
- DB snapshotとStorage objectがSupabaseとは別のNetlify Blobsに存在する
- backup失敗時に既存Productionデータを削除・変更しない

この条件を満たしてから、バックアップP0を解消済みと扱います。

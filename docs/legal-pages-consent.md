# 星空Village 法務ページ・同意基盤MVP

## 公開ページ

- `/terms`: 星空Village 利用規約
- `/privacy`: 星空Village プライバシーポリシー

本文は `src/legal/terms-of-service.md` と `src/legal/privacy-policy.md` を正本として表示します。添付された正本文書から切り出した内容をアプリ側で要約・改変しません。

## 会員登録時の同意

会員登録フォームでは以下を必須にします。

- 利用規約とプライバシーポリシーへの同意
- 18歳以上であることの確認

UIのdisabledだけでなく、`handleSignUp` 側でも未同意・年齢未確認を拒否します。

会員登録時には、同意した版と18歳以上確認をSupabase Auth metadataへ渡します。このmetadataは認可判定には使わず、`auth.users` 作成時triggerが同意記録を作るための入力としてだけ扱います。

## 同意記録

未適用migration:

- `supabase/migrations/20260710120000_add_legal_consents.sql`

保存する版:

- `terms_version`: `2026-07-10`
- `privacy_version`: `2026-07-10`
- `age_confirmed_at`: 18歳以上であることを確認した時刻

RLS方針:

- `anon`: 権限なし
- `authenticated`: 本人の同意記録だけ `select`
- `authenticated`: `public.record_legal_consent(...)` RPCのみ実行可能
- `service_role`: 運用確認用に `select` / `insert`

記録経路:

- メール確認型でセッションが即時発行されない場合: `auth.users` のinsert triggerがAuth metadataを確認し、DBサーバー時刻で `legal_consents` を作成します。
- Auth metadataに現行versionまたは18歳以上確認が無い場合、`auth.users` insert triggerは `LEGAL_CONSENT_REQUIRED` でアカウント作成をロールバックします。
- サインアップ直後にセッションがある場合: アプリが `public.record_legal_consent(...)` RPCを呼び、DBサーバー時刻で `legal_consents` を作成します。
- ログイン時: current versionのAuth metadataを持つユーザーについては、RPCで同意記録の存在を補完します。2026-07-10以降に作られたユーザーでmetadataが無い場合、利用開始させずサインアウトします。
- ブラウザから `legal_consents` へ直接insertする権限は付与しません。

## 本番適用前確認

本番SupabaseへはこのPRでは適用しません。適用前に以下を確認してください。

```sql
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'legal_consents';
```

既にテーブルが存在する場合は、既存定義とmigrationの差分を確認してから適用してください。

適用後は、会員登録した本人の `auth.uid()` と一致する `user_id` のみselectでき、テーブルへの直接insertが拒否されること、`public.record_legal_consent(...)` RPCだけが本人の同意記録を作れること、他ユーザーの記録が読めないことを確認してください。

適用後検証SQL:

- `docs/legal-consent-verification.sql`

このSQLは読み取り専用です。以下を確認します。

- `authenticated` は `legal_consents` にSELECTのみ持つ
- `authenticated` はINSERT/UPDATE/DELETE/TRUNCATEを持たない
- `record_legal_consent` は `IS DISTINCT FROM` でNULL安全にversionと年齢確認を検証する
- `auth.users` triggerはmetadata欠落、旧version、`age=false` を `LEGAL_CONSENT_REQUIRED` で拒否する定義になっている

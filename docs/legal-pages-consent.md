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

## 同意記録

未適用migration:

- `supabase/migrations/20260710120000_add_legal_consents.sql`

保存する版:

- `terms_version`: `2026-07-10`
- `privacy_version`: `2026-07-10`

RLS方針:

- `anon`: 権限なし
- `authenticated`: 本人の同意記録だけ `select` / `insert`
- `service_role`: 運用確認用に `select` / `insert`

メール確認型の会員登録でセッションが即時発行されない場合、同じ端末では次回ログイン時に保留中の同意記録を本人権限で保存します。

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

適用後は、会員登録した本人の `auth.uid()` と一致する `user_id` のみinsert/selectでき、他ユーザーの記録が読めないことを確認してください。

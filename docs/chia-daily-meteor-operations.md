# 星空ちあ 自動流星便の本番運用

星空ちあの定期投稿は、Netlify Scheduled Functions と `chia_daily_meteor_runs` で管理する。

## 本番で必須の設定

- `CHIA_DAILY_METEOR_ENABLED=true`
- `AI_HOSHIZORA_CHIA_PROFILE_ID` または `CHIA_DAILY_METEOR_PROFILE_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`CHIA_DAILY_METEOR_ENABLED` が未設定または `true` 以外の場合、定期関数は `disabled` で正常終了し、実行履歴も投稿も作成しない。

## スケジュール

日本時間の朝8時・昼12時・夜19時の各時間帯に、10分間隔で起動する。DBの一意制約により、各日・各枠につき投稿は1件だけ作成される。

## 本番確認

```sql
select local_date, slot, status, post_id, source, error_code, created_at
from public.chia_daily_meteor_runs
order by created_at desc
limit 20;
```

有効化後は、次の投稿枠を過ぎた時点で `posted` の履歴と `post_id` が作成されていることを確認する。

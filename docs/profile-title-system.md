# プロフィール称号

Issue #118では、表示名へ称号を連結せず、`public.titles` と
`public.profile_titles` を称号の正本とする。

- `titles`: 公開称号カタログ。`key` はコード・運営操作で使う安定識別子。
- `profile_titles`: プロフィールが保有する称号。複数保有できる。
- `profile_titles_one_primary_per_profile_idx`: 1プロフィールのprimary称号を最大1件に制限する。
- 一般ブラウザは有効な称号を読むだけで、付与・剥奪・編集はできない。
- 付与・剥奪は当面migrationまたはservice roleから行う。

UIは既存のプロフィール一括取得へ称号relationを含める。投稿カードや星文ごとに
追加queryを行わず、称号schemaが未適用のDeploy Previewでは称号だけを表示しない。

`celestial_guide` は星空ちあ専用variantで、正式素材
`/assets/titles/chia-celestial-guide-emblem.png` とHTMLテキスト
`街の案内人` を組み合わせて表示する。通常称号は共通の控えめなbadgeを使う。

## 安全な付与例

次の操作はservice roleまたは管理されたSQL実行環境だけで行う。

```sql
insert into public.profile_titles (profile_id, title_id, is_primary)
select
  :profile_id,
  t.id,
  false
from public.titles t
where t.key = 'beta_tester'
on conflict (profile_id, title_id) do nothing;
```

primaryを変更する場合は、対象プロフィールの既存primary解除と新primary設定を
同一transactionで行う。Productionへのmigration適用や称号付与はPR内では行わない。

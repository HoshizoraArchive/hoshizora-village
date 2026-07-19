-- はじめての入村案内 運用SQL例
-- 必ず対象行をSELECTで確認してから、必要な1操作だけを実行してください。
-- Productionへはレビュー済みmigration適用後に使用します。

-- 1. 管理者候補をメールアドレスで一意に確認する（読み取り専用）。
-- メールアドレスやUUIDを推測せず、結果が正確に1件であることを運営が確認してください。
select id, email, created_at
from auth.users
where lower(email) = lower('REPLACE_WITH_CONFIRMED_ADMIN_EMAIL');

-- 2. 確認済みAuthユーザーを管理者へ登録する（安全に再実行可能）。
-- placeholderのままでは0件INSERTになるため、確認済みメールへ置き換えてから1文だけ実行します。
insert into public.app_admins (user_id)
select id
from auth.users
where lower(email) = lower('REPLACE_WITH_CONFIRMED_ADMIN_EMAIL')
  and 'REPLACE_WITH_CONFIRMED_ADMIN_EMAIL' !~ '^REPLACE_'
on conflict (user_id) do nothing;

-- 3. 安定keyと現在順を確認する（読み取り専用）。
select
  section_row.section_key,
  section_row.title,
  parent.section_key as parent_section_key,
  section_row.sort_order,
  section_row.is_visible
from public.guide_sections section_row
left join public.guide_sections parent on parent.id = section_row.parent_id
order by coalesce(parent.sort_order, section_row.sort_order), section_row.parent_id nulls first, section_row.sort_order;

select
  section_row.section_key,
  entry.entry_key,
  entry.entry_type,
  entry.body,
  entry.sort_order,
  entry.is_visible
from public.guide_entries entry
join public.guide_sections section_row on section_row.id = entry.section_id
order by section_row.sort_order, entry.sort_order, entry.entry_key;

-- 4. 「これから増える予定」へ1項目追加する例。
-- entry_keyは一度決めたら変更しません。
insert into public.guide_entries (
  section_id,
  entry_key,
  entry_type,
  body,
  sort_order,
  is_visible
)
select
  section_row.id,
  'planned_example_feature',
  'list_item',
  'REPLACE_WITH_NEW_GUIDE_TEXT',
  coalesce((
    select max(existing.sort_order) + 10
    from public.guide_entries existing
    where existing.section_id = section_row.id
  ), 10),
  true
from public.guide_sections section_row
where section_row.section_key = 'planned_features'
on conflict (entry_key) do nothing;

-- 5. 特定の1項目だけ文言を変更する例。
update public.guide_entries
set body = 'REPLACE_WITH_UPDATED_GUIDE_TEXT'
where entry_key = 'planned_example_feature';

-- 6. 特定の1項目だけ非表示にする例。
update public.guide_entries
set is_visible = false
where entry_key = 'planned_example_feature';

-- 7. 2項目の順番を入れ替える例。必ず同じsection_idの2行で実行します。
begin;
with target_rows as (
  select id, entry_key, section_id, sort_order
  from public.guide_entries
  where entry_key in ('planned_audio', 'planned_repost')
  for update
),
validated as (
  select
    count(*) as row_count,
    count(distinct section_id) as section_count
  from target_rows
)
update public.guide_entries entry
set sort_order = case entry.entry_key
  when 'planned_audio' then (select sort_order from target_rows where entry_key = 'planned_repost')
  when 'planned_repost' then (select sort_order from target_rows where entry_key = 'planned_audio')
end
where entry.entry_key in ('planned_audio', 'planned_repost')
  and (select row_count = 2 and section_count = 1 from validated);
commit;

-- 8. 特定の1項目だけ削除する例。
delete from public.guide_entries
where entry_key = 'planned_example_feature';

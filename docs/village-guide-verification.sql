-- はじめての入村案内 migration適用後の読み取り専用検証SQL
-- INSERT / UPDATE / DELETE / DDLは含みません。

-- 01. 必要テーブルとRLS
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('app_admins', 'guide_sections', 'guide_entries')
order by c.relname;

-- 02. policy
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('app_admins', 'guide_sections', 'guide_entries')
order by tablename, policyname;

-- 03. browser roleのtable privilege
select
  grantee,
  table_name,
  privilege_type,
  is_grantable
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('app_admins', 'guide_sections', 'guide_entries')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- 04. guide_entriesの列単位SELECT権限
-- anon / authenticatedには公開表示列だけが並び、updated_byは0行であること。
select
  grantee,
  table_name,
  column_name,
  privilege_type,
  is_grantable
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'guide_entries'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grantee, column_name, privilege_type;

-- 05. updated_byとtable-level SELECTの公開診断
-- browser roleは全項目false、service_roleはtrueであること。
select
  role_name,
  pg_catalog.has_table_privilege(
    role_name,
    'public.guide_entries',
    'SELECT'
  ) as has_table_select,
  pg_catalog.has_column_privilege(
    role_name,
    'public.guide_entries',
    'updated_by',
    'SELECT'
  ) as can_select_updated_by
from (
  values
    ('anon'),
    ('authenticated'),
    ('service_role')
) roles(role_name)
order by role_name;

-- 06. 管理者判定・祖先公開判定関数とEXECUTE権限
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  coalesce(role_name.rolname, 'PUBLIC') as grantee,
  privilege.privilege_type,
  privilege.is_grantable
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
) privilege
left join pg_catalog.pg_roles role_name on role_name.oid = privilege.grantee
where (
    n.nspname = 'public'
    and p.proname = 'is_app_admin'
  )
  or (
    n.nspname = 'app_private'
    and p.proname = 'guide_section_is_public'
  )
order by schema_name, function_name, grantee;

-- 07. DBが判定するセクション・項目の実効公開状態
-- 非表示祖先配下と循環した階層はsection_is_public=falseになること。
select
  section_row.section_key,
  section_row.is_visible as own_is_visible,
  app_private.guide_section_is_public(section_row.id) as section_is_public
from public.guide_sections section_row
order by section_row.section_key;

select
  entry.entry_key,
  entry.is_visible as own_is_visible,
  app_private.guide_section_is_public(entry.section_id) as section_is_public,
  (
    entry.is_visible
    and app_private.guide_section_is_public(entry.section_id)
  ) as entry_is_public
from public.guide_entries entry
order by entry.entry_key;

-- 08. seedされたセクション階層と順番
select
  section_row.section_key,
  section_row.title,
  parent.section_key as parent_section_key,
  section_row.display_variant,
  section_row.sort_order,
  section_row.is_visible
from public.guide_sections section_row
left join public.guide_sections parent on parent.id = section_row.parent_id
order by
  coalesce(parent.sort_order, section_row.sort_order),
  case when section_row.parent_id is null then 0 else 1 end,
  section_row.sort_order,
  section_row.section_key;

-- 09. seedされた項目と順番（本文は公開案内そのもののみ）
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

-- 10. seed不足・重複の診断
select
  (select count(*) from public.guide_sections) as section_count,
  (select count(*) from public.guide_entries) as entry_count,
  (select count(*) from public.guide_sections where section_key = 'available_now') as available_now_count,
  (select count(*) from public.guide_entries where entry_key = 'planned_ai_residents') as planned_ai_residents_count,
  (select count(*) from public.guide_sections where parent_id = id) as self_parent_count;

-- 11. key変更防止・updated_at・updated_by trigger
select
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('guide_sections', 'guide_entries')
order by event_object_table, trigger_name, event_manipulation;

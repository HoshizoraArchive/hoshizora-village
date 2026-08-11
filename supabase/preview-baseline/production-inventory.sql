-- PREVIEW-V2 BASELINE AUDIT / READ ONLY.
-- Safe to run against Production only through a verified read-only connection.
-- Reads schema/catalog metadata and explicitly approved non-secret catalogs.
-- Never add application/user table row queries to this file.

begin;
set transaction read only;

-- Summary counts.
select 'public_tables' as metric, count(*)::bigint as value
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
union all
select 'public_columns', count(*)::bigint
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and a.attnum > 0 and not a.attisdropped
union all
select 'public_constraints', count(*)::bigint
from pg_catalog.pg_constraint con
join pg_catalog.pg_namespace n on n.oid = con.connamespace
where n.nspname = 'public' and con.contype in ('p', 'f', 'u', 'c', 'x')
union all
select 'public_indexes', count(*)::bigint
from pg_catalog.pg_class i
join pg_catalog.pg_namespace n on n.oid = i.relnamespace
where n.nspname = 'public' and i.relkind = 'i'
union all
select 'public_custom_enums', count(distinct t.oid)::bigint
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
join pg_catalog.pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
union all
select 'public_views', count(*)::bigint
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
union all
select 'app_functions', count(*)::bigint
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app_private')
union all
select 'app_triggers', count(*)::bigint
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('public', 'auth')
union all
select 'storage_managed_triggers', count(*)::bigint
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname = 'storage'
union all
select 'public_rls_policies', count(*)::bigint
from pg_catalog.pg_policies where schemaname = 'public'
union all
select 'storage_object_policies', count(*)::bigint
from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects'
order by metric;

-- Tables and RLS state.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

-- Columns, defaults, generated values and identity state.
select
  n.nspname as schema_name,
  c.relname as table_name,
  a.attnum as ordinal_position,
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
  a.attnotnull as not_null,
  nullif(a.attidentity, '') as identity_kind,
  nullif(a.attgenerated, '') as generated_kind,
  pg_catalog.pg_get_expr(d.adbin, d.adrelid) as default_or_generated_expression
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
left join pg_catalog.pg_attrdef d
  on d.adrelid = a.attrelid and d.adnum = a.attnum
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attnum;

-- PK, FK, unique, check and exclusion constraints.
select
  n.nspname as schema_name,
  coalesce(c.relname, '<domain>') as relation_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_namespace n on n.oid = con.connamespace
left join pg_catalog.pg_class c on c.oid = con.conrelid
where n.nspname = 'public' and con.contype in ('p', 'f', 'u', 'c', 'x')
order by relation_name, con.conname;

-- Indexes.
select
  tab.relname as table_name,
  idx.relname as index_name,
  i.indisprimary as is_primary,
  i.indisunique as is_unique,
  i.indisvalid as is_valid,
  pg_catalog.pg_get_indexdef(i.indexrelid) as definition
from pg_catalog.pg_index i
join pg_catalog.pg_class idx on idx.oid = i.indexrelid
join pg_catalog.pg_namespace n on n.oid = idx.relnamespace
join pg_catalog.pg_class tab on tab.oid = i.indrelid
where n.nspname = 'public'
order by tab.relname, idx.relname;

-- Custom enums.
select
  n.nspname as schema_name,
  t.typname as type_name,
  e.enumsortorder,
  e.enumlabel
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
join pg_catalog.pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
order by t.typname, e.enumsortorder;

-- Views and materialized views (expected empty in Production at audit time).
select
  n.nspname as schema_name,
  c.relname as view_name,
  c.relkind,
  pg_catalog.pg_get_viewdef(c.oid, true) as definition
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by c.relname;

-- Functions/RPC and grants embedded in ACLs.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.provolatile as volatility,
  p.prosecdef as security_definer,
  p.proacl,
  pg_catalog.pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app_private')
order by n.nspname, p.proname, identity_arguments;

-- Application and managed Storage triggers.
select
  n.nspname as table_schema,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_catalog.pg_get_triggerdef(t.oid, true) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage')
order by n.nspname, c.relname, t.tgname;

-- Effective relation/function ACLs and explicit per-column ACLs for app roles.
select
  'relation' as grant_kind,
  n.nspname as object_schema,
  c.relname as object_name,
  null::text as subobject_name,
  coalesce(grantee.rolname, 'PUBLIC') as grantee,
  acl.privilege_type
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
) acl
left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
where n.nspname in ('public', 'app_private')
  and c.relkind in ('r', 'p', 'v', 'm')
  and coalesce(grantee.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')
union all
select
  'column', n.nspname, c.relname, a.attname,
  coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(a.attacl) acl
left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
  and coalesce(grantee.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')
union all
select
  'function', n.nspname, p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid),
  coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
) acl
left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
where n.nspname in ('public', 'app_private')
  and coalesce(grantee.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grant_kind, object_schema, object_name, subobject_name, grantee, privilege_type;

-- RLS policies.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- Managed Storage configuration. These rows are non-secret infrastructure catalog.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('avatars', 'meteor-media', 'meteor-video')
order by id;

-- Approved non-secret application catalogs: counts and semantic keys only.
select 'profile_frames' as catalog, count(*)::bigint as row_count,
       array_agg(frame_key order by frame_key) as semantic_keys
from public.profile_frames
union all
select 'titles', count(*)::bigint, array_agg(key order by key)
from public.titles
union all
select 'guide_sections', count(*)::bigint, array_agg(section_key order by section_key)
from public.guide_sections
union all
select 'guide_entries', count(*)::bigint, array_agg(entry_key order by entry_key)
from public.guide_entries
order by catalog;

-- Review-critical object assertions. All should be true.
with expected(kind, schema_name, relation_name, object_name) as (
  values
    ('table', 'public', null, 'app_open_events'),
    ('table', 'public', null, 'profile_cohorts'),
    ('table', 'public', null, 'profile_kinds'),
    ('table', 'public', null, 'profile_roles'),
    ('table', 'public', null, 'signup_open_events'),
    ('column', 'public', 'profiles', 'notify_chia_posts'),
    ('function', 'public', null, 'get_beta_usage_dashboard'),
    ('function', 'public', null, 'get_signup_open_dashboard'),
    ('function', 'public', null, 'record_signup_open'),
    ('function', 'app_private', null, 'sync_beta_resident_cohort_from_profile_kind'),
    ('function', 'app_private', null, 'create_chia_post_notifications'),
    ('trigger', 'public', 'profiles', 'ensure_default_profile_kind_after_profile_insert'),
    ('trigger', 'public', 'profile_kinds', 'profile_kinds_sync_beta_resident'),
    ('trigger', 'public', 'posts', 'posts_create_chia_post_notifications'),
    ('policy', 'storage', 'objects', 'avatars_delete_own_unreferenced'),
    ('index', 'public', 'notifications', 'notifications_chia_post_recipient_post_unique')
)
select
  e.*,
  case e.kind
    when 'table' then exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = e.schema_name and c.relname = e.object_name
        and c.relkind in ('r', 'p')
    )
    when 'column' then exists (
      select 1 from information_schema.columns c
      where c.table_schema = e.schema_name
        and c.table_name = e.relation_name
        and c.column_name = e.object_name
    )
    when 'function' then exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = e.schema_name and p.proname = e.object_name
    )
    when 'trigger' then exists (
      select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname = e.schema_name
        and c.relname = e.relation_name and t.tgname = e.object_name
    )
    when 'policy' then exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = e.schema_name
        and p.tablename = e.relation_name and p.policyname = e.object_name
    )
    when 'index' then exists (
      select 1 from pg_catalog.pg_indexes i
      where i.schemaname = e.schema_name
        and i.tablename = e.relation_name and i.indexname = e.object_name
    )
    else false
  end as present
from expected e
order by e.kind, e.schema_name, e.relation_name, e.object_name;

rollback;

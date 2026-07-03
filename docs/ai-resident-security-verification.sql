-- AI resident security foundation verification.
-- Read-only checks. Run after supabase/migrations/20260703_add_ai_observation_security_foundation.sql.

-- 01. Job table should exist and have RLS enabled.
select
  '01_ai_job_table_rls' as check_name,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'ai_observation_jobs'
  and c.relkind = 'r';

-- 02. Browser roles should have no table privileges on the internal job table.
select
  '02_ai_job_browser_grants' as check_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'ai_observation_jobs'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

-- 03. Service role should have the expected table privileges.
select
  '03_ai_job_service_role_grants' as check_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'ai_observation_jobs'
  and grantee = 'service_role'
order by privilege_type;

-- 04. Required constraints should exist.
select
  '04_ai_job_constraints' as check_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.ai_observation_jobs'::regclass
order by conname;

-- 05. Required indexes should exist, including partial unique indexes.
select
  '05_ai_job_indexes' as check_name,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'ai_observation_jobs'
order by indexname;

-- 06. post_media storage paths should belong to uploader_id folders.
select
  '06_post_media_storage_path_owner_violations' as check_name,
  count(*) filter (
    where storage_path is null
      or storage_path <> btrim(storage_path)
      or storage_path = ''
      or position('/' in storage_path) = 0
      or split_part(storage_path, '/', 1) <> uploader_id::text
      or storage_path ~ '^/'
      or storage_path ~ '/$'
      or storage_path ~ '//'
      or storage_path ~ '(^|/)\.{1,2}(/|$)'
      or position(chr(92) in storage_path) > 0
      or position('%' in storage_path) > 0
  ) as storage_path_violation_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and (
        thumbnail_storage_path <> btrim(thumbnail_storage_path)
        or thumbnail_storage_path = ''
        or position('/' in thumbnail_storage_path) = 0
        or split_part(thumbnail_storage_path, '/', 1) <> uploader_id::text
        or thumbnail_storage_path ~ '^/'
        or thumbnail_storage_path ~ '/$'
        or thumbnail_storage_path ~ '//'
        or thumbnail_storage_path ~ '(^|/)\.{1,2}(/|$)'
        or position(chr(92) in thumbnail_storage_path) > 0
        or position('%' in thumbnail_storage_path) > 0
      )
  ) as thumbnail_storage_path_violation_count
from public.post_media;

-- 07. post_media should have owner-folder constraints for storage paths.
select
  '07_post_media_storage_path_constraints' as check_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition,
  pg_get_constraintdef(oid) like '%app_private.storage_path_belongs_to_owner%' as depends_on_private_helper
from pg_constraint
where conrelid = 'public.post_media'::regclass
  and conname in (
    'post_media_storage_path_owner_check',
    'post_media_thumbnail_storage_path_owner_check'
  )
order by conname;

-- 08. Internal app_private helper functions should not be executable by browser roles.
select
  '08_app_private_browser_execute_grants' as check_name,
  n.nspname as schema_name,
  p.proname as function_name,
  coalesce(nullif(r.rolname, ''), 'PUBLIC') as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) acl
left join pg_roles r on r.oid = acl.grantee
where n.nspname = 'app_private'
  and p.proname = 'ai_observation_billable_cost_micro_usd'
  and (acl.grantee = 0 or r.rolname in ('anon', 'authenticated'))
order by function_name, grantee, acl.privilege_type;

-- 09. Reservation RPC should not be executable by browser roles.
select
  '09_reserve_rpc_browser_execute_grants' as check_name,
  n.nspname as schema_name,
  p.proname as function_name,
  coalesce(nullif(r.rolname, ''), 'PUBLIC') as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) acl
left join pg_roles r on r.oid = acl.grantee
where n.nspname = 'public'
  and p.proname = 'reserve_ai_observation_job'
  and (acl.grantee = 0 or r.rolname in ('anon', 'authenticated'))
order by grantee, acl.privilege_type;

-- 10. Service role should be able to execute the reservation RPC.
select
  '10_reserve_rpc_service_role_execute_grants' as check_name,
  n.nspname as schema_name,
  p.proname as function_name,
  r.rolname as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) acl
join pg_roles r on r.oid = acl.grantee
where n.nspname = 'public'
  and p.proname = 'reserve_ai_observation_job'
  and r.rolname = 'service_role'
order by acl.privilege_type;

-- 11. Existing observations raw table should remain hidden from browser select grants.
select
  '11_observations_browser_grants' as check_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'observations'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

-- 12. Active/succeeded duplicate guard indexes should have the intended predicates.
select
  '12_ai_job_duplicate_guards' as check_name,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'ai_observation_jobs'
  and indexname in (
    'ai_observation_jobs_one_active_per_post_resident_idx',
    'ai_observation_jobs_one_success_per_post_resident_idx',
    'ai_observation_jobs_idempotency_key_idx'
  )
order by indexname;

-- 13. Job rows by status and billable cost, without exposing user content.
select
  '13_ai_job_status_counts' as check_name,
  status::text,
  count(*) as row_count,
  coalesce(sum(app_private.ai_observation_billable_cost_micro_usd(
    status,
    attempt_count,
    reserved_cost_micro_usd,
    actual_cost_micro_usd
  )), 0) as billable_cost_micro_usd
from public.ai_observation_jobs
group by status
order by status::text;

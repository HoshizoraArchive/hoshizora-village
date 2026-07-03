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

-- 06. Reservation RPC should not be executable by browser roles.
select
  '06_reserve_rpc_browser_execute_grants' as check_name,
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

-- 07. Service role should be able to execute the reservation RPC.
select
  '07_reserve_rpc_service_role_execute_grants' as check_name,
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

-- 08. Existing observations raw table should remain hidden from browser select grants.
select
  '08_observations_browser_grants' as check_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'observations'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

-- 09. Active/succeeded duplicate guard indexes should have the intended predicates.
select
  '09_ai_job_duplicate_guards' as check_name,
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

-- 10. Job rows by status, without exposing user content.
select
  '10_ai_job_status_counts' as check_name,
  status::text,
  count(*) as row_count
from public.ai_observation_jobs
group by status
order by status::text;

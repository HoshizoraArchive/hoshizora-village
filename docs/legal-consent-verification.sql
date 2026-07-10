-- 星空Village legal consent verification SQL.
-- Read-only checks to run after applying
-- supabase/migrations/20260710120000_add_legal_consents.sql.
--
-- Expected summary:
-- - public.legal_consents exists and has age_confirmed_at.
-- - authenticated has SELECT only on public.legal_consents.
-- - authenticated does not have INSERT/UPDATE/DELETE/TRUNCATE.
-- - public.record_legal_consent uses IS DISTINCT FROM for NULL-safe validation.
-- - auth.users trigger rejects missing/old/age=false legal metadata.

select
  '01_table_and_columns' as section,
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'legal_consents'
  and c.column_name in (
    'user_id',
    'terms_version',
    'privacy_version',
    'accepted_at',
    'age_confirmed_at',
    'created_at'
  )
order by c.ordinal_position;

select
  '02_table_privileges' as section,
  tp.grantee,
  tp.privilege_type
from information_schema.table_privileges tp
where tp.table_schema = 'public'
  and tp.table_name = 'legal_consents'
  and tp.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by tp.grantee, tp.privilege_type;

select
  '03_rls_and_policies' as section,
  c.relrowsecurity as rls_enabled,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
from pg_class c
join pg_namespace n
  on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname = 'legal_consents'
order by p.policyname;

select
  '04_record_rpc_definition_checks' as section,
  pg_get_functiondef('public.record_legal_consent(text,text,boolean)'::regprocedure) like
    '%p_terms_version is distinct from ''2026-07-10''%' as terms_null_safe,
  pg_get_functiondef('public.record_legal_consent(text,text,boolean)'::regprocedure) like
    '%p_privacy_version is distinct from ''2026-07-10''%' as privacy_null_safe,
  pg_get_functiondef('public.record_legal_consent(text,text,boolean)'::regprocedure) like
    '%p_age_confirmed is distinct from true%' as age_null_safe,
  pg_get_functiondef('public.record_legal_consent(text,text,boolean)'::regprocedure) like
    '%invalid_consent%' as invalid_outcome_present;

select
  '05_auth_trigger_definition_checks' as section,
  t.tgname,
  pg_get_triggerdef(t.oid) as trigger_definition,
  pg_get_functiondef(t.tgfoid) like
    '%v_terms_version is distinct from ''2026-07-10''%' as terms_metadata_rejected,
  pg_get_functiondef(t.tgfoid) like
    '%v_privacy_version is distinct from ''2026-07-10''%' as privacy_metadata_rejected,
  pg_get_functiondef(t.tgfoid) like
    '%v_age_confirmed is distinct from true%' as age_metadata_rejected,
  pg_get_functiondef(t.tgfoid) like
    '%LEGAL_CONSENT_REQUIRED%' as rejection_exception_present
from pg_trigger t
join pg_class c
  on c.oid = t.tgrelid
join pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'auth'
  and c.relname = 'users'
  and t.tgname = 'auth_users_record_legal_consent';

with function_acl as (
  select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    coalesce(r.rolname, 'PUBLIC') as grantee,
    acl.privilege_type
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) as acl
  left join pg_roles r
    on r.oid = acl.grantee
  where (n.nspname, p.proname) in (
    ('public', 'record_legal_consent'),
    ('app_private', 'record_legal_consent_from_auth_user')
  )
)
select
  '06_function_execute_privileges' as section,
  schema_name,
  function_name,
  identity_arguments,
  grantee,
  privilege_type
from function_acl
where grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by schema_name, function_name, grantee, privilege_type;

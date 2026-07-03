-- 星空ちあ観測MVP migration verification.
-- Read-only. Run after applying supabase/migrations/20260704_add_chia_observation_mvp.sql.

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'reserve_ai_observation_job',
    'claim_ai_observation_job',
    'start_ai_observation_attempt',
    'complete_ai_observation_job',
    'fail_ai_observation_job',
    'cancel_ai_observation_job'
  )
order by p.proname;

select
  'completion_rpc_signature' as check_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  case
    when pg_get_function_identity_arguments(p.oid) = 'p_job_id uuid, p_chia_profile_id uuid, p_expected_request_fingerprint text, p_observed_points jsonb, p_analysis_summary text, p_should_post boolean, p_star_letter_body text, p_input_tokens integer, p_output_tokens integer, p_total_tokens integer, p_actual_cost_micro_usd bigint'
    then 0
    else 1
  end::bigint as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'complete_ai_observation_job';

select
  'browser_execute_grants' as check_name,
  coalesce(r.rolname, 'PUBLIC') as grantee,
  n.nspname as schema_name,
  p.proname as function_name,
  a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in (
    'claim_ai_observation_job',
    'start_ai_observation_attempt',
    'complete_ai_observation_job',
    'fail_ai_observation_job',
    'cancel_ai_observation_job'
  )
  and coalesce(r.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated')
  and a.privilege_type = 'EXECUTE'
order by function_name, grantee;

select
  'service_role_execute_grants' as check_name,
  r.rolname as grantee,
  p.proname as function_name,
  a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in (
    'claim_ai_observation_job',
    'start_ai_observation_attempt',
    'complete_ai_observation_job',
    'fail_ai_observation_job',
    'cancel_ai_observation_job'
  )
  and r.rolname = 'service_role'
order by function_name;

select
  'observations_browser_privileges' as check_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'observations'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

select
  'ai_jobs_browser_privileges' as check_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'ai_observation_jobs'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

select
  'job_state_counts' as check_name,
  status::text as status,
  count(*)::bigint as job_count
from public.ai_observation_jobs
group by status
order by status::text;

select
  'post_media_storage_path_constraints' as check_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.post_media'::regclass
  and conname in (
    'post_media_storage_path_owner_check',
    'post_media_thumbnail_storage_path_owner_check'
  )
order by conname;

select
  'duplicate_active_ai_jobs' as check_name,
  post_id,
  ai_resident_key,
  count(*)::bigint as duplicate_count
from public.ai_observation_jobs
where status in ('queued', 'processing')
group by post_id, ai_resident_key
having count(*) > 1;

select
  'duplicate_succeeded_ai_jobs' as check_name,
  post_id,
  ai_resident_key,
  count(*)::bigint as duplicate_count
from public.ai_observation_jobs
where status = 'succeeded'
group by post_id, ai_resident_key
having count(*) > 1;

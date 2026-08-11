-- Read-only checks after applying 20260729092512_add_chia_first_post_welcomes.sql.
-- Run separately from the migration; this file makes no data changes.

select
  'chia_first_post_welcomes_exists' as check_name,
  count(*) filter (where c.oid is not null) as observed_count,
  case when count(*) filter (where c.oid is not null) = 1 then 0 else 1 end as anomaly_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'chia_first_post_welcomes';

select
  'first_post_welcome_browser_table_privileges' as check_name,
  count(*) filter (
    where has_table_privilege(r.rolname, 'public.chia_first_post_welcomes', 'select,insert,update,delete')
  ) as observed_count,
  count(*) filter (
    where has_table_privilege(r.rolname, 'public.chia_first_post_welcomes', 'select,insert,update,delete')
  ) as anomaly_count
from pg_roles r
where r.rolname in ('anon', 'authenticated');

select
  'first_post_welcome_rpc_service_role_only' as check_name,
  count(*) filter (where has_function_privilege('service_role', p.oid, 'execute')) as service_role_execute_count,
  count(*) filter (
    where has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('public', p.oid, 'execute')
  ) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_chia_first_post_welcome_candidate',
    'reserve_chia_first_post_welcome_job',
    'complete_ai_observation_job'
  );

select
  'first_public_post_helper_exists' as check_name,
  count(*) as observed_count,
  case when count(*) = 1 then 0 else 1 end as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private'
  and p.proname = 'is_chia_first_public_post'
  and pg_get_function_identity_arguments(p.oid) = 'p_post_id uuid';

select
  'first_post_welcome_context_allowed' as check_name,
  count(*) filter (
    where pg_get_constraintdef(c.oid) like '%first_post_welcome%'
  ) as observed_count,
  case
    when count(*) filter (
      where pg_get_constraintdef(c.oid) like '%first_post_welcome%'
    ) = 1
    then 0
    else 1
  end as anomaly_count
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'ai_observation_jobs'
  and c.conname = 'ai_observation_jobs_observation_context_check';

-- Read-only checks after applying 20260729093000_add_chia_first_post_welcomes.sql.
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
  and p.proname in ('get_chia_first_post_welcome_candidate', 'complete_ai_observation_job');

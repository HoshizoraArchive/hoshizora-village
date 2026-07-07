-- 星空ちあ観測MVP migration verification.
-- Read-only. Run after applying the AI observation MVP migrations, including
-- supabase/migrations/20260707_recover_stale_ai_observation_jobs.sql and
-- supabase/migrations/20260708_expand_chia_auto_observation.sql.

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
    'cancel_ai_observation_job',
    'recover_stale_ai_observation_jobs'
  )
order by p.proname;

with expected(function_name, argument_types) as (
  values
    (
      'reserve_ai_observation_job',
      'uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer'
    ),
    (
      'reserve_ai_observation_job',
      'uuid, uuid, text, text, text, text, text, text, timestamp with time zone, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer'
    ),
    (
      'complete_ai_observation_job',
      'uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint'
    ),
    (
      'complete_ai_observation_job',
      'uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer'
    )
),
actual as (
  select
    p.oid,
    p.proname as function_name,
    oidvectortypes(p.proargtypes) as argument_types,
    pg_get_function_identity_arguments(p.oid) as identity_arguments
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('reserve_ai_observation_job', 'complete_ai_observation_job')
)
select
  'rpc_backward_compatible_signatures' as check_name,
  expected.function_name,
  expected.argument_types,
  actual.identity_arguments,
  case when actual.oid is null then 1 else 0 end::bigint as anomaly_count
from expected
left join actual
  on actual.function_name = expected.function_name
 and actual.argument_types = expected.argument_types
order by expected.function_name, expected.argument_types;

with expected(function_name, argument_types) as (
  values
    (
      'reserve_ai_observation_job',
      'uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer'
    ),
    (
      'reserve_ai_observation_job',
      'uuid, uuid, text, text, text, text, text, text, timestamp with time zone, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer'
    ),
    (
      'complete_ai_observation_job',
      'uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint'
    ),
    (
      'complete_ai_observation_job',
      'uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer'
    )
),
actual as (
  select
    p.oid,
    p.proname as function_name,
    oidvectortypes(p.proargtypes) as argument_types
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
grants as (
  select
    actual.function_name,
    actual.argument_types,
    coalesce(r.rolname, 'PUBLIC') as grantee,
    a.privilege_type
  from actual
  cross join lateral aclexplode(coalesce(
    (select p.proacl from pg_proc p where p.oid = actual.oid),
    acldefault('f'::"char", (select p.proowner from pg_proc p where p.oid = actual.oid))
  )) a
  left join pg_roles r on r.oid = a.grantee
)
select
  'rpc_backward_compatible_execute_grants' as check_name,
  expected.function_name,
  expected.argument_types,
  count(*) filter (
    where grants.grantee = 'service_role'
      and grants.privilege_type = 'EXECUTE'
  ) as service_role_execute_grants,
  count(*) filter (
    where grants.grantee in ('PUBLIC', 'anon', 'authenticated')
      and grants.privilege_type = 'EXECUTE'
  ) as browser_execute_grants,
  case
    when count(*) filter (
      where grants.grantee = 'service_role'
        and grants.privilege_type = 'EXECUTE'
    ) = 1
      and count(*) filter (
        where grants.grantee in ('PUBLIC', 'anon', 'authenticated')
          and grants.privilege_type = 'EXECUTE'
      ) = 0
    then 0
    else 1
  end::bigint as anomaly_count
from expected
left join grants
  on grants.function_name = expected.function_name
 and grants.argument_types = expected.argument_types
group by expected.function_name, expected.argument_types
order by expected.function_name, expected.argument_types;

select
  'auto_observation_job_columns' as check_name,
  count(*) filter (where column_name = 'observation_context') as observation_context_columns,
  count(*) filter (where column_name = 'not_before_at') as not_before_at_columns,
  case
    when count(*) filter (where column_name = 'observation_context') = 1
      and count(*) filter (where column_name = 'not_before_at') = 1
    then 0
    else 1
  end::bigint as anomaly_count
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ai_observation_jobs'
  and column_name in ('observation_context', 'not_before_at');

select
  'auto_observation_due_queue_index' as check_name,
  case
    when exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'ai_observation_jobs'
        and indexname = 'ai_observation_jobs_due_queue_idx'
        and indexdef like '%not_before_at%'
        and indexdef like '%WHERE (status = ''queued''::ai_observation_job_status)%'
    )
    then 0
    else 1
  end::bigint as anomaly_count;

select
  'claim_respects_not_before_at' as check_name,
  case
    when pg_get_functiondef(p.oid) like '%v_job.not_before_at > now()%'
      and pg_get_functiondef(p.oid) like '%outcome := ''not_ready''%'
    then 0
    else 1
  end::bigint as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_ai_observation_job';

select
  'completion_auto_star_letter_gate' as check_name,
  case
    when pg_get_functiondef(p.oid) like '%p_auto_star_letter_daily_limit%'
      and pg_get_functiondef(p.oid) like '%p_auto_star_letter_author_cooldown_seconds%'
      and pg_get_functiondef(p.oid) like '%ai_observation_star_letters:hoshizora_chia%'
      and pg_get_functiondef(p.oid) like '%v_job.observation_context = ''auto_text_post''%'
      and pg_get_functiondef(p.oid) like '%insert into public.resonances%'
    then 0
    else 1
  end::bigint as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'complete_ai_observation_job';

select
  'completion_recomputes_current_fingerprint' as check_name,
  case
    when pg_get_functiondef(p.oid) like '%app_private.ai_observation_current_request_fingerprint(v_job.post_id)%'
      and pg_get_functiondef(p.oid) like '%v_current_request_fingerprint <> v_job.request_fingerprint%'
      and pg_get_functiondef(p.oid) like '%v_current_request_fingerprint <> p_expected_request_fingerprint%'
    then 0
    else 1
  end::bigint as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'complete_ai_observation_job';

select
  'current_fingerprint_helper_definition' as check_name,
  case
    when pg_get_functiondef(p.oid) like '%from public.posts p%'
      and pg_get_functiondef(p.oid) like '%for update%'
      and pg_get_functiondef(p.oid) like '%from public.post_media pm%'
      and pg_get_functiondef(p.oid) like '%order by pm.sort_order, pm.id%'
      and pg_get_functiondef(p.oid) like '%for share%'
      and pg_get_functiondef(p.oid) like '%"mediaRows"%'
      and pg_get_functiondef(p.oid) like '%"storagePath"%'
    then 0
    else 1
  end::bigint as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private'
  and p.proname = 'ai_observation_current_request_fingerprint';

select
  'pgcrypto_digest_extensions_schema' as check_name,
  case
    when exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'extensions'
        and p.proname = 'digest'
        and oidvectortypes(p.proargtypes) = 'text, text'
    )
    then 0
    else 1
  end::bigint as anomaly_count;

select
  'current_fingerprint_uses_extensions_digest' as check_name,
  case
    when pg_get_functiondef(p.oid) like '%extensions.digest(v_payload, ''sha256'')%'
      and pg_get_functiondef(p.oid) not like '%public.digest(v_payload%'
    then 0
    else 1
  end::bigint as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private'
  and p.proname = 'ai_observation_current_request_fingerprint';

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
    'reserve_ai_observation_job',
    'start_ai_observation_attempt',
    'complete_ai_observation_job',
    'fail_ai_observation_job',
    'cancel_ai_observation_job',
    'recover_stale_ai_observation_jobs'
  )
  and coalesce(r.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated')
  and a.privilege_type = 'EXECUTE'
order by function_name, grantee;

select
  'app_private_browser_execute_grants' as check_name,
  coalesce(r.rolname, 'PUBLIC') as grantee,
  n.nspname as schema_name,
  p.proname as function_name,
  a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'app_private'
  and p.proname in (
    'ai_observation_json_text',
    'ai_observation_json_timestamptz',
    'ai_observation_json_number',
    'ai_observation_current_request_fingerprint'
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
    'reserve_ai_observation_job',
    'start_ai_observation_attempt',
    'complete_ai_observation_job',
    'fail_ai_observation_job',
    'cancel_ai_observation_job',
    'recover_stale_ai_observation_jobs'
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
  'stale_processing_candidates' as check_name,
  count(*)::bigint as candidate_count
from public.ai_observation_jobs
where status = 'processing'
  and completed_at is null
  and coalesce(started_at, updated_at, created_at) < now() - interval '10 minutes';

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

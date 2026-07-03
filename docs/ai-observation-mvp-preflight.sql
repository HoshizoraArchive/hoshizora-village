-- 星空ちあ観測MVP migration preflight.
-- Read-only. Run before applying supabase/migrations/20260704_add_chia_observation_mvp.sql.
-- If any anomaly_count is greater than 0, inspect data before applying the migration.

select
  'chia_profile_username_count' as check_name,
  count(*)::bigint as observed_count,
  case when count(*) = 1 then 0 else count(*) end::bigint as anomaly_count
from public.profiles
where username = 'chia_hoshizora';

select
  'required_tables_exist' as check_name,
  count(*)::bigint as observed_count,
  case when count(*) = 5 then 0 else 5 - count(*) end::bigint as anomaly_count
from information_schema.tables
where table_schema = 'public'
  and table_name in ('posts', 'post_media', 'profiles', 'observations', 'star_letters');

select
  'ai_jobs_table_exists' as check_name,
  count(*)::bigint as observed_count,
  case when count(*) = 1 then 0 else 1 end::bigint as anomaly_count
from information_schema.tables
where table_schema = 'public'
  and table_name = 'ai_observation_jobs';

select
  'ai_job_required_columns' as check_name,
  count(*)::bigint as observed_count,
  case when count(*) = 23 then 0 else 23 - count(*) end::bigint as anomaly_count
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ai_observation_jobs'
  and column_name in (
    'id',
    'post_id',
    'requested_by',
    'ai_resident_key',
    'provider',
    'model',
    'status',
    'idempotency_key',
    'request_fingerprint',
    'attempt_count',
    'max_attempts',
    'input_kind',
    'input_size_bytes',
    'input_duration_seconds',
    'reserved_cost_micro_usd',
    'actual_cost_micro_usd',
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'observation_id',
    'star_letter_id',
    'public_error_code',
    'completed_at'
  );

select
  'active_job_unique_index_exists' as check_name,
  count(*)::bigint as observed_count,
  case when count(*) = 1 then 0 else 1 end::bigint as anomaly_count
from pg_indexes
where schemaname = 'public'
  and tablename = 'ai_observation_jobs'
  and indexname = 'ai_observation_jobs_one_active_per_post_resident_idx';

select
  'success_job_unique_index_exists' as check_name,
  count(*)::bigint as observed_count,
  case when count(*) = 1 then 0 else 1 end::bigint as anomaly_count
from pg_indexes
where schemaname = 'public'
  and tablename = 'ai_observation_jobs'
  and indexname = 'ai_observation_jobs_one_success_per_post_resident_idx';

select
  'contradictory_ai_jobs' as check_name,
  count(*)::bigint as observed_count,
  count(*)::bigint as anomaly_count
from public.ai_observation_jobs
where (status = 'succeeded' and observation_id is null)
   or (status in ('failed', 'cancelled') and completed_at is null)
   or attempt_count > max_attempts
   or actual_cost_micro_usd < 0
   or input_tokens < 0
   or output_tokens < 0
   or total_tokens < 0;

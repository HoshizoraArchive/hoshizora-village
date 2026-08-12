begin;

create or replace function public.reserve_ai_observation_job(
  p_post_id uuid,
  p_requested_by uuid,
  p_ai_resident_key text,
  p_provider text,
  p_model text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_input_kind text,
  p_input_size_bytes bigint,
  p_input_duration_seconds numeric,
  p_reserved_cost_micro_usd bigint,
  p_max_attempts integer,
  p_daily_request_limit integer,
  p_monthly_request_limit integer,
  p_daily_cost_limit_micro_usd bigint,
  p_monthly_cost_limit_micro_usd bigint,
  p_min_seconds_between_requests integer
)
returns table (
  outcome text,
  job_id uuid,
  job_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_daily_requests bigint;
  v_monthly_requests bigint;
  v_daily_cost bigint;
  v_monthly_cost bigint;
begin
  if p_ai_resident_key <> 'hoshizora_chia'
    or p_provider <> 'gemini'
    or p_model <> 'gemini-3.5-flash'
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]{32,128}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_input_kind not in ('text', 'image', 'audio', 'video', 'youtube')
    or p_input_size_bytes < 0
    or p_reserved_cost_micro_usd < 1
    or p_max_attempts < 1
    or p_max_attempts > 10
    or p_daily_request_limit < 1
    or p_monthly_request_limit < 1
    or p_daily_cost_limit_micro_usd < 1
    or p_monthly_cost_limit_micro_usd < 1
    or p_min_seconds_between_requests < 0
  then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('ai_observation_jobs:global')::bigint);
  perform pg_advisory_xact_lock(hashtext('ai_observation_jobs:' || p_post_id::text || ':' || p_ai_resident_key)::bigint);

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and p.visibility = 'public'
      and p.deleted_at is null
      and p.type in ('text', 'image', 'video', 'youtube')
  ) then
    outcome := 'post_not_found';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.idempotency_key = p_idempotency_key
  ) then
    outcome := 'duplicate_idempotency';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status in ('queued', 'processing')
  ) then
    outcome := 'already_queued';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status = 'succeeded'
  ) then
    outcome := 'already_succeeded';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status = 'failed'
  ) then
    outcome := 'already_failed';
    return next;
    return;
  end if;

  if p_min_seconds_between_requests > 0 and exists (
    select 1
    from public.ai_observation_jobs j
    where j.requested_by = p_requested_by
      and j.created_at > now() - make_interval(secs => p_min_seconds_between_requests)
      and j.status in ('queued', 'processing', 'succeeded', 'failed')
  ) then
    outcome := 'retry_too_soon';
    return next;
    return;
  end if;

  select count(*),
    coalesce(sum(app_private.ai_observation_billable_cost_micro_usd(
      j.status,
      j.attempt_count,
      j.reserved_cost_micro_usd,
      j.actual_cost_micro_usd
    )), 0)
    into v_daily_requests, v_daily_cost
  from public.ai_observation_jobs j
  where j.created_at >= v_day_start
    and j.status in ('queued', 'processing', 'succeeded', 'failed');

  select count(*),
    coalesce(sum(app_private.ai_observation_billable_cost_micro_usd(
      j.status,
      j.attempt_count,
      j.reserved_cost_micro_usd,
      j.actual_cost_micro_usd
    )), 0)
    into v_monthly_requests, v_monthly_cost
  from public.ai_observation_jobs j
  where j.created_at >= v_month_start
    and j.status in ('queued', 'processing', 'succeeded', 'failed');

  if v_daily_requests >= p_daily_request_limit
    or v_monthly_requests >= p_monthly_request_limit
    or v_daily_cost + p_reserved_cost_micro_usd > p_daily_cost_limit_micro_usd
    or v_monthly_cost + p_reserved_cost_micro_usd > p_monthly_cost_limit_micro_usd
  then
    outcome := 'rate_limited';
    return next;
    return;
  end if;

  insert into public.ai_observation_jobs (
    post_id,
    requested_by,
    ai_resident_key,
    provider,
    model,
    status,
    idempotency_key,
    request_fingerprint,
    max_attempts,
    input_kind,
    input_size_bytes,
    input_duration_seconds,
    reserved_cost_micro_usd
  )
  values (
    p_post_id,
    p_requested_by,
    p_ai_resident_key,
    p_provider,
    p_model,
    'queued',
    p_idempotency_key,
    p_request_fingerprint,
    p_max_attempts,
    p_input_kind,
    p_input_size_bytes,
    p_input_duration_seconds,
    p_reserved_cost_micro_usd
  )
  returning id into v_job_id;

  outcome := 'reserved';
  job_id := v_job_id;
  job_status := 'queued';
  return next;

exception
  when unique_violation then
    outcome := 'already_queued';
    job_id := null;
    job_status := null;
    return next;
end;
$$;

commit;
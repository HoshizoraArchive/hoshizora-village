-- Expand Chia automatic observation to delayed all-user text candidates.
-- Keeps browser roles out of AI job internals.

begin;

alter table public.ai_observation_jobs
  add column if not exists observation_context text not null default 'manual',
  add column if not exists not_before_at timestamptz not null default now();

alter table public.ai_observation_jobs
  drop constraint if exists ai_observation_jobs_observation_context_check;
alter table public.ai_observation_jobs
  add constraint ai_observation_jobs_observation_context_check
  check (observation_context in ('manual', 'auto_text_post'));

comment on column public.ai_observation_jobs.observation_context
is 'AI観測jobの実行文脈。manualまたは投稿後自動観測(auto_text_post)のみ。';
comment on column public.ai_observation_jobs.not_before_at
is 'この時刻まではworkerがclaimしない。投稿後自動観測を即時固定にしないための遅延実行時刻。';

create index if not exists ai_observation_jobs_due_queue_idx
on public.ai_observation_jobs(status, not_before_at, created_at)
where status = 'queued';

drop function if exists public.reserve_ai_observation_job(
  uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
);

create or replace function public.reserve_ai_observation_job(
  p_post_id uuid,
  p_requested_by uuid,
  p_ai_resident_key text,
  p_provider text,
  p_model text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_observation_context text,
  p_not_before_at timestamptz,
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
  job_status text,
  observation_context text,
  not_before_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
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
    or p_observation_context not in ('manual', 'auto_text_post')
    or p_not_before_at is null
    or p_not_before_at < now() - interval '5 minutes'
    or p_not_before_at > now() + interval '1 day'
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
    observation_context,
    not_before_at,
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
    p_observation_context,
    p_not_before_at,
    p_max_attempts,
    p_input_kind,
    p_input_size_bytes,
    p_input_duration_seconds,
    p_reserved_cost_micro_usd
  )
  returning * into v_job;

  outcome := 'reserved';
  job_id := v_job.id;
  job_status := v_job.status::text;
  observation_context := v_job.observation_context;
  not_before_at := v_job.not_before_at;
  return next;

exception
  when unique_violation then
    outcome := 'already_queued';
    job_id := null;
    job_status := null;
    observation_context := null;
    not_before_at := null;
    return next;
end;
$$;

create or replace function public.claim_ai_observation_job(p_job_id uuid)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  post_id uuid,
  request_fingerprint text,
  attempt_count integer,
  max_attempts integer,
  input_kind text,
  model text,
  observation_context text,
  not_before_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status = 'queued' and v_job.not_before_at > now() then
    outcome := 'not_ready';
  elsif v_job.status = 'queued' then
    update public.ai_observation_jobs j
      set status = 'processing',
          started_at = coalesce(j.started_at, now()),
          public_error_code = null
    where j.id = p_job_id
    returning * into v_job;
    outcome := 'claimed';
  else
    outcome := 'already_' || v_job.status::text;
  end if;

  job_id := v_job.id;
  job_status := v_job.status::text;
  post_id := v_job.post_id;
  request_fingerprint := v_job.request_fingerprint;
  attempt_count := v_job.attempt_count;
  max_attempts := v_job.max_attempts;
  input_kind := v_job.input_kind;
  model := v_job.model;
  observation_context := v_job.observation_context;
  not_before_at := v_job.not_before_at;
  return next;
end;
$$;

drop function if exists public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
);

create or replace function public.complete_ai_observation_job(
  p_job_id uuid,
  p_chia_profile_id uuid,
  p_expected_request_fingerprint text,
  p_observed_points jsonb,
  p_analysis_summary text,
  p_should_post boolean,
  p_star_letter_body text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_actual_cost_micro_usd bigint,
  p_auto_star_letter_daily_limit integer,
  p_auto_star_letter_author_cooldown_seconds integer
)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  observation_id uuid,
  star_letter_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
  v_current_request_fingerprint text;
  v_observation_id uuid;
  v_star_letter_id uuid;
  v_post_author_id uuid;
  v_should_post boolean;
  v_star_letter_body text;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_daily_star_letters bigint;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status = 'succeeded' then
    outcome := 'already_succeeded';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  if v_job.status <> 'processing' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_chia_profile_id
      and p.username = 'chia_hoshizora'
  ) then
    outcome := 'chia_profile_mismatch';
    return next;
    return;
  end if;

  if p_observed_points is null
    or jsonb_typeof(p_observed_points) <> 'array'
    or p_expected_request_fingerprint is null
    or p_expected_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_input_tokens is null
    or p_output_tokens is null
    or p_total_tokens is null
    or p_actual_cost_micro_usd is null
    or p_should_post is null
    or p_auto_star_letter_daily_limit is null
    or p_auto_star_letter_daily_limit < 0
    or p_auto_star_letter_author_cooldown_seconds is null
    or p_auto_star_letter_author_cooldown_seconds < 0
    or p_input_tokens < 0
    or p_output_tokens < 0
    or p_total_tokens < p_input_tokens + p_output_tokens
    or p_actual_cost_micro_usd < 0
    or (p_should_post and (
      p_star_letter_body is null
      or p_star_letter_body <> btrim(p_star_letter_body)
      or char_length(p_star_letter_body) < 20
      or char_length(p_star_letter_body) > 80
      or p_star_letter_body ~ '[\r\n#]'
      or p_star_letter_body ~ 'https?://'
    ))
    or ((not p_should_post) and p_star_letter_body is not null)
  then
    outcome := 'invalid_payload';
    return next;
    return;
  end if;

  v_current_request_fingerprint := app_private.ai_observation_current_request_fingerprint(v_job.post_id);

  if v_current_request_fingerprint is null
    or v_current_request_fingerprint <> v_job.request_fingerprint
    or v_current_request_fingerprint <> p_expected_request_fingerprint
  then
    outcome := 'post_changed';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  select p.author_id
    into v_post_author_id
  from public.posts p
  where p.id = v_job.post_id;

  v_should_post := p_should_post;
  v_star_letter_body := p_star_letter_body;

  if v_job.observation_context = 'auto_text_post' and v_should_post then
    perform pg_advisory_xact_lock(hashtext('ai_observation_star_letters:hoshizora_chia')::bigint);

    select count(*)
      into v_daily_star_letters
    from public.star_letters sl
    where sl.author_id = p_chia_profile_id
      and sl.created_at >= v_day_start;

    if v_daily_star_letters >= p_auto_star_letter_daily_limit
      or (
        p_auto_star_letter_author_cooldown_seconds > 0
        and exists (
          select 1
          from public.star_letters sl
          join public.posts p on p.id = sl.post_id
          where sl.author_id = p_chia_profile_id
            and p.author_id = v_post_author_id
            and sl.created_at > now() - make_interval(secs => p_auto_star_letter_author_cooldown_seconds)
        )
      )
    then
      v_should_post := false;
      v_star_letter_body := null;
    end if;
  end if;

  insert into public.observations (
    post_id,
    observer_id,
    observer_type,
    ai_resident_key,
    observation_type,
    analysis_summary,
    observed_points,
    should_comment,
    comment,
    should_recommend,
    recommendation_message,
    x_post_draft
  )
  values (
    v_job.post_id,
    p_chia_profile_id,
    'ai_resident',
    'hoshizora_chia',
    'ai_observation',
    nullif(left(coalesce(p_analysis_summary, ''), 1200), ''),
    p_observed_points,
    v_should_post,
    v_star_letter_body,
    false,
    null,
    null
  )
  returning id into v_observation_id;

  if v_job.observation_context = 'auto_text_post' then
    insert into public.resonances (
      post_id,
      profile_id,
      resonance_type
    )
    values (
      v_job.post_id,
      p_chia_profile_id,
      'silent'
    );
  end if;

  if v_should_post then
    insert into public.star_letters (
      post_id,
      author_id,
      body
    )
    values (
      v_job.post_id,
      p_chia_profile_id,
      v_star_letter_body
    )
    returning id into v_star_letter_id;
  end if;

  update public.ai_observation_jobs j
    set status = 'succeeded',
        observation_id = v_observation_id,
        star_letter_id = v_star_letter_id,
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        total_tokens = p_total_tokens,
        actual_cost_micro_usd = p_actual_cost_micro_usd,
        public_error_code = null,
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'completed';
  job_id := v_job.id;
  job_status := v_job.status::text;
  observation_id := v_observation_id;
  star_letter_id := v_star_letter_id;
  return next;
end;
$$;

revoke all on function public.reserve_ai_observation_job(
  uuid, uuid, text, text, text, text, text, text, timestamptz, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) from public, anon, authenticated;
grant execute on function public.reserve_ai_observation_job(
  uuid, uuid, text, text, text, text, text, text, timestamptz, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) to service_role;

revoke all on function public.claim_ai_observation_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_observation_job(uuid) to service_role;

revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer
) to service_role;

commit;

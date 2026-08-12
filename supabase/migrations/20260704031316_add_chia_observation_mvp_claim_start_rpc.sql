begin;

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
  model text
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

  if v_job.status = 'queued' then
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
  return next;
end;
$$;

create or replace function public.start_ai_observation_attempt(p_job_id uuid)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  attempt_count integer,
  max_attempts integer
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

  if v_job.status <> 'processing' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    attempt_count := v_job.attempt_count;
    max_attempts := v_job.max_attempts;
    return next;
    return;
  end if;

  if v_job.attempt_count >= v_job.max_attempts then
    outcome := 'max_attempts_exceeded';
    job_id := v_job.id;
    job_status := v_job.status::text;
    attempt_count := v_job.attempt_count;
    max_attempts := v_job.max_attempts;
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set attempt_count = j.attempt_count + 1
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'attempt_started';
  job_id := v_job.id;
  job_status := v_job.status::text;
  attempt_count := v_job.attempt_count;
  max_attempts := v_job.max_attempts;
  return next;
end;
$$;

commit;
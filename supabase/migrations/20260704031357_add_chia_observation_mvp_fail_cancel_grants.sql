begin;

create or replace function public.fail_ai_observation_job(
  p_job_id uuid,
  p_public_error_code text,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_total_tokens integer default null,
  p_actual_cost_micro_usd bigint default null
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

  if v_job.status in ('succeeded', 'failed', 'cancelled') then
    outcome := 'already_' || v_job.status::text;
    job_id := v_job.id;
    job_status := v_job.status::text;
    return next;
    return;
  end if;

  if p_public_error_code is null
    or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$'
    or (p_input_tokens is not null and p_input_tokens < 0)
    or (p_output_tokens is not null and p_output_tokens < 0)
    or (p_total_tokens is not null and p_total_tokens < 0)
    or (p_actual_cost_micro_usd is not null and p_actual_cost_micro_usd < 0)
  then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set status = 'failed',
        public_error_code = p_public_error_code,
        input_tokens = coalesce(p_input_tokens, j.input_tokens),
        output_tokens = coalesce(p_output_tokens, j.output_tokens),
        total_tokens = coalesce(p_total_tokens, j.total_tokens),
        actual_cost_micro_usd = coalesce(p_actual_cost_micro_usd, j.actual_cost_micro_usd),
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'failed';
  job_id := v_job.id;
  job_status := v_job.status::text;
  return next;
end;
$$;

create or replace function public.cancel_ai_observation_job(
  p_job_id uuid,
  p_public_error_code text default 'WORKER_DISPATCH_FAILED'
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

  if v_job.status <> 'queued' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    return next;
    return;
  end if;

  if p_public_error_code is null or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$' then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set status = 'cancelled',
        public_error_code = p_public_error_code,
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'cancelled';
  job_id := v_job.id;
  job_status := v_job.status::text;
  return next;
end;
$$;

comment on column public.ai_observation_jobs.actual_cost_micro_usd is 'AI実行後にprovider usageから推定した料金。Gemini 3.5 Flash Standardのpricing snapshotに基づくmicro USD整数で、請求書上の確定額ではない。';

revoke all on function public.reserve_ai_observation_job(
  uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) from public, anon, authenticated;
revoke all on function public.claim_ai_observation_job(uuid) from public, anon, authenticated;
revoke all on function public.start_ai_observation_attempt(uuid) from public, anon, authenticated;
revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) from public, anon, authenticated;
revoke all on function public.fail_ai_observation_job(
  uuid, text, integer, integer, integer, bigint
) from public, anon, authenticated;
revoke all on function public.cancel_ai_observation_job(uuid, text) from public, anon, authenticated;

grant execute on function public.reserve_ai_observation_job(
  uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) to service_role;
grant execute on function public.claim_ai_observation_job(uuid) to service_role;
grant execute on function public.start_ai_observation_attempt(uuid) to service_role;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) to service_role;
grant execute on function public.fail_ai_observation_job(
  uuid, text, integer, integer, integer, bigint
) to service_role;
grant execute on function public.cancel_ai_observation_job(uuid, text) to service_role;

commit;
-- Recover stale AI observation jobs that were left in processing after a worker timeout.
-- This does not retry Gemini. It only clears stale processing rows so a later
-- explicit reservation can proceed.

begin;

create or replace function public.recover_stale_ai_observation_jobs(
  p_stale_before timestamptz,
  p_public_error_code text default 'WORKER_STALE',
  p_limit integer default 20
)
returns table (
  recovered_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered_count integer := 0;
begin
  if p_stale_before is null
    or p_stale_before > now()
    or p_public_error_code is null
    or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$'
    or p_limit is null
    or p_limit < 1
    or p_limit > 100
  then
    recovered_count := 0;
    return next;
    return;
  end if;

  with stale_jobs as (
    select j.id
    from public.ai_observation_jobs j
    where j.status = 'processing'
      and j.completed_at is null
      and coalesce(j.started_at, j.updated_at, j.created_at) < p_stale_before
    order by coalesce(j.started_at, j.updated_at, j.created_at), j.id
    limit p_limit
    for update skip locked
  ),
  updated_jobs as (
    update public.ai_observation_jobs j
      set status = 'cancelled',
          public_error_code = p_public_error_code,
          completed_at = now()
    from stale_jobs s
    where j.id = s.id
    returning j.id
  )
  select count(*)::integer
    into v_recovered_count
  from updated_jobs;

  recovered_count := v_recovered_count;
  return next;
end;
$$;

comment on function public.recover_stale_ai_observation_jobs(timestamptz, text, integer)
is 'Service-role-only recovery for AI observation jobs left in processing after worker timeout. Marks stale processing rows as cancelled with a safe public error code; does not retry provider calls.';

revoke all on function public.recover_stale_ai_observation_jobs(timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.recover_stale_ai_observation_jobs(timestamptz, text, integer) to service_role;

commit;

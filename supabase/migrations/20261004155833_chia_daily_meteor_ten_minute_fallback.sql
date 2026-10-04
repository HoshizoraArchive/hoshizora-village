begin;

alter table public.chia_daily_meteor_runs
  add column if not exists claim_owner text;

alter table public.chia_daily_meteor_runs
  drop constraint if exists chia_daily_meteor_runs_claim_owner_check;

alter table public.chia_daily_meteor_runs
  add constraint chia_daily_meteor_runs_claim_owner_check
  check (claim_owner is null or claim_owner in ('dot', 'legacy'));

comment on column public.chia_daily_meteor_runs.claim_owner is
  '現在processingを所有する実行経路。Dot優先窓からlegacy fallbackへの安全なhandoffに使用する';

create or replace function public.claim_chia_daily_meteor_run(
  p_local_date date,
  p_slot text,
  p_scheduled_for timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run_id uuid;
begin
  if p_local_date is null
    or p_scheduled_for is null
    or p_slot not in ('morning', 'noon', 'evening')
  then
    return jsonb_build_object('claimed', false, 'outcome', 'invalid_payload');
  end if;

  insert into public.chia_daily_meteor_runs (
    local_date,
    slot,
    scheduled_for,
    status,
    attempts,
    claim_owner
  )
  values (
    p_local_date,
    p_slot,
    p_scheduled_for,
    'processing',
    1,
    'legacy'
  )
  on conflict (local_date, slot) do update
  set
    scheduled_for = excluded.scheduled_for,
    status = 'processing',
    attempts = public.chia_daily_meteor_runs.attempts + 1,
    claim_owner = 'legacy',
    post_id = null,
    source = null,
    body = null,
    error_code = null,
    posted_at = null,
    updated_at = now()
  where public.chia_daily_meteor_runs.status = 'failed'
    or (
      public.chia_daily_meteor_runs.status = 'processing'
      and (
        (
          public.chia_daily_meteor_runs.claim_owner = 'dot'
          and public.chia_daily_meteor_runs.scheduled_for <= now() - interval '10 minutes'
        )
        or (
          coalesce(public.chia_daily_meteor_runs.claim_owner, 'legacy') = 'legacy'
          and public.chia_daily_meteor_runs.updated_at < now() - interval '15 minutes'
        )
      )
    )
  returning id into v_run_id;

  if v_run_id is null then
    return jsonb_build_object('claimed', false, 'outcome', 'already_handled');
  end if;

  return jsonb_build_object(
    'claimed', true,
    'outcome', 'claimed',
    'run_id', v_run_id
  );
end;
$function$;

create or replace function public.claim_chia_daily_meteor_dot_run(
  p_local_date date,
  p_slot text,
  p_scheduled_for timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run_id uuid;
begin
  if p_local_date is null
    or p_scheduled_for is null
    or p_slot not in ('morning', 'noon', 'evening')
    or p_scheduled_for > now() + interval '1 minute'
    or p_scheduled_for <= now() - interval '10 minutes'
  then
    return jsonb_build_object('claimed', false, 'outcome', 'invalid_payload');
  end if;

  insert into public.chia_daily_meteor_runs (
    local_date,
    slot,
    scheduled_for,
    status,
    attempts,
    claim_owner
  )
  values (
    p_local_date,
    p_slot,
    p_scheduled_for,
    'processing',
    1,
    'dot'
  )
  on conflict (local_date, slot) do update
  set
    scheduled_for = excluded.scheduled_for,
    status = 'processing',
    attempts = public.chia_daily_meteor_runs.attempts + 1,
    claim_owner = 'dot',
    post_id = null,
    source = null,
    body = null,
    error_code = null,
    posted_at = null,
    updated_at = now()
  where public.chia_daily_meteor_runs.status = 'failed'
  returning id into v_run_id;

  if v_run_id is null then
    return jsonb_build_object('claimed', false, 'outcome', 'already_handled');
  end if;

  return jsonb_build_object(
    'claimed', true,
    'outcome', 'claimed',
    'run_id', v_run_id
  );
end;
$function$;

create or replace function public.complete_chia_daily_meteor_dot_run(
  p_run_id uuid,
  p_author_id uuid,
  p_body text,
  p_source text,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_claim_owner text;
  v_post_id uuid;
begin
  if p_run_id is null
    or p_author_id is null
    or nullif(btrim(coalesce(p_body, '')), '') is null
    or char_length(p_body) > 500
    or p_source not in ('ai', 'curated', 'fallback')
    or char_length(coalesce(p_error_code, '')) > 120
  then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  select status, claim_owner
  into v_status, v_claim_owner
  from public.chia_daily_meteor_runs
  where id = p_run_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'run_not_found');
  end if;

  if v_status <> 'processing' or v_claim_owner <> 'dot' then
    return jsonb_build_object('outcome', 'lease_lost');
  end if;

  insert into public.posts (
    author_id,
    type,
    body,
    visibility
  )
  values (
    p_author_id,
    'text',
    btrim(p_body),
    'public'
  )
  returning id into v_post_id;

  update public.chia_daily_meteor_runs
  set
    status = 'posted',
    post_id = v_post_id,
    source = p_source,
    body = btrim(p_body),
    error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
    posted_at = now(),
    updated_at = now()
  where id = p_run_id
    and status = 'processing'
    and claim_owner = 'dot';

  return jsonb_build_object(
    'outcome', 'posted',
    'post_id', v_post_id
  );
end;
$function$;

create or replace function public.fail_chia_daily_meteor_dot_run(
  p_run_id uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated_count integer;
begin
  if p_run_id is null or char_length(coalesce(p_error_code, '')) > 120 then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  update public.chia_daily_meteor_runs
  set
    status = 'failed',
    error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
    updated_at = now()
  where id = p_run_id
    and status = 'processing'
    and claim_owner = 'dot';

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    return jsonb_build_object('outcome', 'lease_lost');
  end if;

  return jsonb_build_object('outcome', 'failed');
end;
$function$;

revoke all on function public.claim_chia_daily_meteor_run(date, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_chia_daily_meteor_dot_run(date, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_chia_daily_meteor_dot_run(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_chia_daily_meteor_dot_run(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_chia_daily_meteor_run(date, text, timestamptz)
  to service_role;
grant execute on function public.claim_chia_daily_meteor_dot_run(date, text, timestamptz)
  to service_role;
grant execute on function public.complete_chia_daily_meteor_dot_run(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.fail_chia_daily_meteor_dot_run(uuid, text)
  to service_role;

commit;

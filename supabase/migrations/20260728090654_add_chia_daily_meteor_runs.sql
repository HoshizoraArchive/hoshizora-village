create table if not exists public.chia_daily_meteor_runs (
  id uuid primary key default gen_random_uuid(),
  local_date date not null,
  slot text not null check (slot in ('morning', 'noon', 'evening')),
  scheduled_for timestamptz not null,
  status text not null default 'processing' check (status in ('processing', 'posted', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  post_id uuid references public.posts(id) on delete set null,
  source text check (source is null or source in ('ai', 'curated', 'fallback')),
  body text check (body is null or char_length(body) <= 500),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_date, slot)
);

comment on table public.chia_daily_meteor_runs is
  '星空ちあの朝・昼・夜の定期流星便を一日一回に保つ内部実行台帳';

alter table public.chia_daily_meteor_runs enable row level security;
revoke all on table public.chia_daily_meteor_runs from public, anon, authenticated;
grant select, insert, update on table public.chia_daily_meteor_runs to service_role;

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
    attempts
  )
  values (
    p_local_date,
    p_slot,
    p_scheduled_for,
    'processing',
    1
  )
  on conflict (local_date, slot) do update
  set
    scheduled_for = excluded.scheduled_for,
    status = 'processing',
    attempts = public.chia_daily_meteor_runs.attempts + 1,
    post_id = null,
    source = null,
    body = null,
    error_code = null,
    posted_at = null,
    updated_at = now()
  where public.chia_daily_meteor_runs.status = 'failed'
    or (
      public.chia_daily_meteor_runs.status = 'processing'
      and public.chia_daily_meteor_runs.updated_at < now() - interval '15 minutes'
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

create or replace function public.complete_chia_daily_meteor_run(
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
  v_existing_post_id uuid;
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

  select status, post_id
  into v_status, v_existing_post_id
  from public.chia_daily_meteor_runs
  where id = p_run_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'run_not_found');
  end if;

  if v_status = 'posted' and v_existing_post_id is not null then
    return jsonb_build_object(
      'outcome', 'already_posted',
      'post_id', v_existing_post_id
    );
  end if;

  if v_status <> 'processing' then
    return jsonb_build_object('outcome', 'invalid_status');
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
  where id = p_run_id;

  return jsonb_build_object(
    'outcome', 'posted',
    'post_id', v_post_id
  );
end;
$function$;

revoke all on function public.claim_chia_daily_meteor_run(date, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_chia_daily_meteor_run(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_chia_daily_meteor_run(date, text, timestamptz)
  to service_role;
grant execute on function public.complete_chia_daily_meteor_run(uuid, uuid, text, text, text)
  to service_role;

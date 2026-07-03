-- 星空Village AI resident security foundation.
-- This migration creates an internal job queue for future AI observation work.
-- It does not call Gemini, does not create observations, and does not create star letters.

begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter table public.post_media
drop constraint if exists post_media_storage_path_owner_check;

alter table public.post_media
add constraint post_media_storage_path_owner_check
check (
  storage_path is not null
  and storage_path = btrim(storage_path)
  and storage_path <> ''
  and position('/' in storage_path) > 0
  and split_part(storage_path, '/', 1) = uploader_id::text
  and storage_path !~ '^/'
  and storage_path !~ '/$'
  and storage_path !~ '//'
  and storage_path !~ '(^|/)\.{1,2}(/|$)'
  and position(chr(92) in storage_path) = 0
  and position('%' in storage_path) = 0
);

alter table public.post_media
drop constraint if exists post_media_thumbnail_storage_path_owner_check;

alter table public.post_media
add constraint post_media_thumbnail_storage_path_owner_check
check (
  thumbnail_storage_path is null
  or (
    thumbnail_storage_path = btrim(thumbnail_storage_path)
    and thumbnail_storage_path <> ''
    and position('/' in thumbnail_storage_path) > 0
    and split_part(thumbnail_storage_path, '/', 1) = uploader_id::text
    and thumbnail_storage_path !~ '^/'
    and thumbnail_storage_path !~ '/$'
    and thumbnail_storage_path !~ '//'
    and thumbnail_storage_path !~ '(^|/)\.{1,2}(/|$)'
    and position(chr(92) in thumbnail_storage_path) = 0
    and position('%' in thumbnail_storage_path) = 0
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ai_observation_job_status'
  ) then
    create type public.ai_observation_job_status as enum (
      'queued',
      'processing',
      'succeeded',
      'failed',
      'cancelled'
    );
  end if;
end;
$$;

create table if not exists public.ai_observation_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  ai_resident_key text not null,
  provider text not null,
  model text not null,
  status public.ai_observation_job_status not null default 'queued',
  idempotency_key text not null,
  request_fingerprint text not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 1,
  input_kind text not null,
  input_size_bytes bigint not null default 0,
  input_duration_seconds numeric,
  reserved_cost_micro_usd bigint not null default 0,
  actual_cost_micro_usd bigint,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  observation_id uuid references public.observations(id) on delete set null,
  star_letter_id uuid references public.star_letters(id) on delete set null,
  public_error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ai_observation_jobs_ai_resident_key_check check (ai_resident_key in ('hoshizora_chia')),
  constraint ai_observation_jobs_provider_check check (provider in ('gemini')),
  constraint ai_observation_jobs_input_kind_check check (input_kind in ('text', 'image', 'audio', 'video', 'youtube')),
  constraint ai_observation_jobs_idempotency_key_check check (idempotency_key ~ '^[A-Za-z0-9._:-]{32,128}$'),
  constraint ai_observation_jobs_request_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint ai_observation_jobs_attempts_check check (attempt_count >= 0 and max_attempts between 1 and 10 and attempt_count <= max_attempts),
  constraint ai_observation_jobs_input_size_check check (input_size_bytes >= 0),
  constraint ai_observation_jobs_input_duration_check check (input_duration_seconds is null or input_duration_seconds >= 0),
  constraint ai_observation_jobs_reserved_cost_check check (reserved_cost_micro_usd >= 0),
  constraint ai_observation_jobs_actual_cost_check check (actual_cost_micro_usd is null or actual_cost_micro_usd >= 0),
  constraint ai_observation_jobs_tokens_check check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (total_tokens is null or total_tokens >= 0)
  ),
  constraint ai_observation_jobs_error_code_check check (
    public_error_code is null or public_error_code ~ '^[A-Z0-9_:-]{1,80}$'
  )
);

comment on table public.ai_observation_jobs is 'AI住人観測ジョブの内部キュー。ブラウザからは直接操作させず、信頼済みサーバー処理が予約・状態遷移する。';
comment on column public.ai_observation_jobs.reserved_cost_micro_usd is '利用上限判定に使う予約料金。micro USD単位の整数で保存する。';
comment on column public.ai_observation_jobs.actual_cost_micro_usd is 'AI実行後に確定する実料金。micro USD単位の整数で保存する。';
comment on column public.ai_observation_jobs.request_fingerprint is '同じ入力を安全に識別するハッシュ。投稿本文やStorage pathそのものは保存しない。';
comment on column public.ai_observation_jobs.public_error_code is '外部へ出してよい短いエラーコード。内部エラー本文は保存しない。';
comment on column public.ai_observation_jobs.attempt_count is 'provider APIを実際に呼び出した回数。自動リトライは同じジョブ行の中でこの値を増やす。';
comment on column public.ai_observation_jobs.max_attempts is '1つの観測処理で許可するprovider API呼び出し総数。';

create or replace function app_private.ai_observation_billable_cost_micro_usd(
  p_status public.ai_observation_job_status,
  p_attempt_count integer,
  p_reserved_cost_micro_usd bigint,
  p_actual_cost_micro_usd bigint
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status in ('queued', 'processing') then greatest(coalesce(p_reserved_cost_micro_usd, 0), 0)
    when p_status = 'succeeded' then greatest(coalesce(p_actual_cost_micro_usd, p_reserved_cost_micro_usd, 0), 0)
    when p_status = 'failed' and coalesce(p_attempt_count, 0) > 0 then greatest(coalesce(p_actual_cost_micro_usd, p_reserved_cost_micro_usd, 0), 0)
    else 0
  end;
$$;

revoke all on function app_private.ai_observation_billable_cost_micro_usd(
  public.ai_observation_job_status,
  integer,
  bigint,
  bigint
) from public, anon, authenticated;

create index if not exists ai_observation_jobs_post_id_idx on public.ai_observation_jobs(post_id);
create index if not exists ai_observation_jobs_requested_by_created_at_idx
on public.ai_observation_jobs(requested_by, created_at desc);
create index if not exists ai_observation_jobs_status_created_at_idx
on public.ai_observation_jobs(status, created_at desc);
create index if not exists ai_observation_jobs_created_at_idx
on public.ai_observation_jobs(created_at desc);

create unique index if not exists ai_observation_jobs_idempotency_key_idx
on public.ai_observation_jobs(idempotency_key);

create unique index if not exists ai_observation_jobs_one_active_per_post_resident_idx
on public.ai_observation_jobs(post_id, ai_resident_key)
where status in ('queued', 'processing');

create unique index if not exists ai_observation_jobs_one_success_per_post_resident_idx
on public.ai_observation_jobs(post_id, ai_resident_key)
where status = 'succeeded';

drop trigger if exists ai_observation_jobs_set_updated_at on public.ai_observation_jobs;
create trigger ai_observation_jobs_set_updated_at
before update on public.ai_observation_jobs
for each row execute function public.set_updated_at();

alter table public.ai_observation_jobs enable row level security;

revoke all on table public.ai_observation_jobs from public, anon, authenticated;
grant select, insert, update on table public.ai_observation_jobs to service_role;

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
    or p_model is null
    or char_length(trim(p_model)) = 0
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

revoke all on function public.reserve_ai_observation_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  numeric,
  bigint,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  integer
) from public, anon, authenticated;

grant execute on function public.reserve_ai_observation_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  numeric,
  bigint,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  integer
) to service_role;

commit;

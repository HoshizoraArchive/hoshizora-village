-- Queue and dispatch state for R.Connect Web Push delivery.
-- This migration does not send Push notifications directly; Netlify scheduled
-- Functions claim queued jobs with service_role and deliver them server-side.

begin;

create table if not exists public.push_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint push_notification_jobs_notification_id_key unique (notification_id),
  constraint push_notification_jobs_status_check check (
    status in ('queued', 'processing', 'succeeded', 'failed', 'skipped')
  ),
  constraint push_notification_jobs_attempts_check check (
    attempt_count >= 0
    and max_attempts between 1 and 10
    and attempt_count <= max_attempts
  ),
  constraint push_notification_jobs_completion_check check (
    (status in ('succeeded', 'failed', 'skipped') and completed_at is not null)
    or (status in ('queued', 'processing') and completed_at is null)
  ),
  constraint push_notification_jobs_error_code_check check (
    last_error_code is null
    or (
      last_error_code = upper(last_error_code)
      and last_error_code ~ '^[A-Z0-9_]{2,64}$'
    )
  )
);

comment on table public.push_notification_jobs is
'R.Connect通知を登録済み端末へWeb Push配信するためのserver-side queue。browser roleからは直接操作させない。';
comment on column public.push_notification_jobs.notification_id is
'Push配信対象のpublic.notifications行。1通知につき最大1job。';
comment on column public.push_notification_jobs.recipient_id is
'通知受信者。送信Functionはこのprofile_idに紐づく有効なpush_subscriptionsだけへ送信する。';
comment on column public.push_notification_jobs.status is
'queued / processing / succeeded / failed / skipped。';
comment on column public.push_notification_jobs.attempt_count is
'scheduled Functionがclaimした送信試行回数。Gemini/AI観測とは無関係。';
comment on column public.push_notification_jobs.last_error_code is
'外部へ出してよい短い失敗分類。endpointやsecretなどは保存しない。';

create index if not exists push_notification_jobs_recipient_created_at_idx
on public.push_notification_jobs(recipient_id, created_at desc);

create index if not exists push_notification_jobs_status_next_attempt_idx
on public.push_notification_jobs(status, next_attempt_at, created_at);

create index if not exists push_notification_jobs_notification_id_idx
on public.push_notification_jobs(notification_id);

drop trigger if exists push_notification_jobs_set_updated_at on public.push_notification_jobs;
create trigger push_notification_jobs_set_updated_at
before update on public.push_notification_jobs
for each row execute function public.set_updated_at();

alter table public.push_notification_jobs enable row level security;

revoke all on table public.push_notification_jobs from public, anon, authenticated;
grant select, insert, update on table public.push_notification_jobs to service_role;

create or replace function app_private.enqueue_push_notification_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_id is null then
    return new;
  end if;

  insert into public.push_notification_jobs (
    notification_id,
    recipient_id
  )
  values (
    new.id,
    new.recipient_id
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.enqueue_push_notification_job() from public, anon, authenticated;

drop trigger if exists notifications_enqueue_push_notification_job on public.notifications;
create trigger notifications_enqueue_push_notification_job
after insert on public.notifications
for each row execute function app_private.enqueue_push_notification_job();

create or replace function public.claim_push_notification_jobs(p_limit integer default 20)
returns table (
  id uuid,
  notification_id uuid,
  recipient_id uuid,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid push notification claim limit' using errcode = '22023';
  end if;

  return query
  with selected_jobs as (
    select j.id
    from public.push_notification_jobs j
    where (
        (
          j.status = 'queued'
          and j.next_attempt_at <= now()
        )
        or (
          j.status = 'processing'
          and j.updated_at < now() - interval '15 minutes'
        )
      )
      and j.attempt_count < j.max_attempts
    order by j.next_attempt_at asc, j.created_at asc, j.id asc
    for update skip locked
    limit p_limit
  )
  update public.push_notification_jobs j
  set
    status = 'processing',
    attempt_count = j.attempt_count + 1,
    last_error_code = null,
    updated_at = now()
  from selected_jobs s
  where j.id = s.id
  returning
    j.id,
    j.notification_id,
    j.recipient_id,
    j.attempt_count,
    j.max_attempts;
end;
$$;

revoke all on function public.claim_push_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notification_jobs(integer) to service_role;

commit;

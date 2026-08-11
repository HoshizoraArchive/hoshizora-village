-- PREVIEW-V2 ONLY / DO NOT APPLY TO PRODUCTION.
-- Schema-only continuation copied from the reviewed Git migration.

begin;

alter table public.profiles
  add column if not exists notify_chia_posts boolean not null default true;

comment on column public.profiles.notify_chia_posts is
'星空ちあの流星便をOS/Web Pushで受け取るか。Village内Re:Connectとバナーはこの設定に関係なく表示する。';

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'resonance'::text,
    'archive'::text,
    'star_letter'::text,
    'star_letter_reply'::text,
    'star_letter_resonance'::text,
    'content_report'::text,
    'chia_post'::text
  ]));

create unique index if not exists notifications_chia_post_recipient_post_unique
  on public.notifications (recipient_id, post_id)
  where type = 'chia_post' and post_id is not null;

create or replace function app_private.create_chia_post_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles chia
    where chia.id = new.author_id
      and chia.username = 'chia_hoshizora'
  ) then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    type,
    message
  )
  select
    recipient.id,
    new.author_id,
    new.id,
    'chia_post',
    '星空ちあが流星便を放流しました。'
  from public.profiles recipient
  left join public.profile_kinds profile_kind
    on profile_kind.profile_id = recipient.id
  where recipient.id <> new.author_id
    and coalesce(profile_kind.kind, 'human') = 'human'
  on conflict do nothing;

  return new;
end;
$$;

comment on function app_private.create_chia_post_notifications() is
'星空ちあの新規流星便を、ちあ本人とAI住人を除く全村人のRe:Connectへ配る。';

drop trigger if exists posts_create_chia_post_notifications on public.posts;
create trigger posts_create_chia_post_notifications
after insert on public.posts
for each row
execute function app_private.create_chia_post_notifications();

create or replace function app_private.enqueue_push_notification_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'chia_post'
    and not coalesce(
      (
        select profile.notify_chia_posts
        from public.profiles profile
        where profile.id = new.recipient_id
      ),
      true
    ) then
    return new;
  end if;

  insert into public.push_notification_jobs (
    notification_id,
    recipient_id,
    status,
    attempt_count,
    max_attempts,
    next_attempt_at
  )
  values (
    new.id,
    new.recipient_id,
    'queued',
    0,
    5,
    now()
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

comment on function app_private.enqueue_push_notification_job() is
'通知INSERTをPush配信jobへ積む。chia_postだけはrecipientのnotify_chia_posts=falseならPushを積まない。';

commit;

-- 星空Village Archive/resonance notification migration
-- Execute this file in the Supabase SQL Editor after merging the PR.
-- Adds Archive notification support and sender-side notification settings without weakening RLS or granting client insert access.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter table public.profiles
  add column if not exists notify_authors_when_i_archive boolean not null default true;

alter table public.profiles
  add column if not exists notify_authors_when_i_resonate boolean not null default true;

comment on column public.profiles.notify_authors_when_i_archive is
  '自分が誰かの流星便をArchiveした時、相手にR.Connect通知を送るかどうか。デフォルトON。';

comment on column public.profiles.notify_authors_when_i_resonate is
  '自分が誰かの流星便に共鳴した時、相手にR.Connect通知を送るかどうか。デフォルトON。';

do $$
declare
  type_constraint_name text;
begin
  for type_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'notifications'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%type%'
      and pg_get_constraintdef(c.oid) like '%resonance%'
  loop
    execute format('alter table public.notifications drop constraint %I', type_constraint_name);
  end loop;
end;
$$;

alter table public.notifications
  add constraint notifications_type_check check (type in ('resonance', 'archive'));

comment on table public.notifications is
  'R.Connect通知。共鳴、Archiveなどの通知を保存する。MVPでは共鳴通知とArchive通知を扱う。';

comment on column public.notifications.type is
  '通知タイプ。MVPでは resonance と archive を許可する。';

-- Update resonance notifications to respect the actor's opt-out setting.
create or replace function app_private.create_resonance_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  should_notify boolean;
begin
  select p.author_id
    into target_author_id
  from public.posts p
  where p.id = new.post_id;

  if target_author_id is null then
    return new;
  end if;

  if target_author_id = new.profile_id then
    return new;
  end if;

  select coalesce(pr.notify_authors_when_i_resonate, true)
    into should_notify
  from public.profiles pr
  where pr.id = new.profile_id;

  if should_notify is not true then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    type,
    message
  )
  values (
    target_author_id,
    new.profile_id,
    new.post_id,
    'resonance',
    'あなたの流星便に共鳴が届きました。'
  );

  return new;
end;
$$;

revoke all on function app_private.create_resonance_notification() from public, anon, authenticated;

drop trigger if exists resonances_create_notification on public.resonances;
create trigger resonances_create_notification
after insert on public.resonances
for each row execute function app_private.create_resonance_notification();

-- Create an Archive notification for the 流星便 author.
-- The actor can opt out from notifying authors through profiles.notify_authors_when_i_archive.
create or replace function app_private.create_archive_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  should_notify boolean;
begin
  select p.author_id
    into target_author_id
  from public.posts p
  where p.id = new.post_id;

  if target_author_id is null then
    return new;
  end if;

  if target_author_id = new.profile_id then
    return new;
  end if;

  select coalesce(pr.notify_authors_when_i_archive, true)
    into should_notify
  from public.profiles pr
  where pr.id = new.profile_id;

  if should_notify is not true then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    type,
    message
  )
  values (
    target_author_id,
    new.profile_id,
    new.post_id,
    'archive',
    'あなたの流星便がArchiveされました。'
  );

  return new;
end;
$$;

revoke all on function app_private.create_archive_notification() from public, anon, authenticated;

drop trigger if exists archives_create_notification on public.archives;
create trigger archives_create_notification
after insert on public.archives
for each row execute function app_private.create_archive_notification();

-- 星空Village Re:Connect notifications migration
-- Run this file in the Supabase SQL Editor after merging PR #19.
-- This migration only adds the notifications foundation and resonance notification trigger.
-- It does not drop tables, truncate data, disable RLS, or add any API keys.

-- Private schema for trigger/helper functions that should not be exposed through the Data API.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- notifications: Re:Connect notification records.
-- Frontend users can read only their own notifications and update only is_read.
-- Notification rows are created by trusted database triggers, not by direct client inserts.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  type text not null check (type in ('resonance')),
  message text not null check (char_length(trim(message)) > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Re:Connect通知。共鳴、星文、Archiveなどの通知を保存する。MVPでは共鳴通知のみ。';
comment on column public.notifications.recipient_id is '通知を受け取るユーザー。本人だけが閲覧できる。';
comment on column public.notifications.actor_id is '通知のきっかけを作ったユーザー。削除された場合はnullになる。';
comment on column public.notifications.type is '通知タイプ。MVPでは resonance のみ。';
comment on column public.notifications.is_read is '既読状態。本人だけが更新できる。';

-- Create a resonance notification for the 流星便 author.
-- The function lives in a private schema because it needs SECURITY DEFINER
-- to insert trusted notification rows without granting client insert access.
create or replace function app_private.create_resonance_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
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

-- Create the trigger only if it is not already present.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'resonances_create_notification'
      and tgrelid = 'public.resonances'::regclass
      and not tgisinternal
  ) then
    create trigger resonances_create_notification
    after insert on public.resonances
    for each row execute function app_private.create_resonance_notification();
  end if;
end;
$$;

create index if not exists notifications_recipient_created_at_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_recipient_is_read_idx on public.notifications(recipient_id, is_read);
create index if not exists notifications_actor_id_idx on public.notifications(actor_id);
create index if not exists notifications_post_id_idx on public.notifications(post_id);

alter table public.notifications enable row level security;

-- Client inserts are intentionally not allowed; trusted triggers create rows.
-- UPDATE is limited to is_read through column privileges plus RLS owner checks.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (recipient_id = auth.uid());

drop policy if exists notifications_update_read_own on public.notifications;
create policy notifications_update_read_own on public.notifications
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());
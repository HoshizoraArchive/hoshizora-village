-- 星空Village star-letter notification migration
-- Execute this file in the Supabase SQL Editor after merging the PR.
-- 共鳴 / Archive notifications remain owned by existing database triggers.
-- This migration adds star_letter as a notification type and creates the 星文 trigger.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

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
  add constraint notifications_type_check check (type in ('resonance', 'archive', 'star_letter'));

comment on table public.notifications is
  'R.Connect通知。共鳴、Archive、星文などの通知を保存する。';

comment on column public.notifications.type is
  '通知タイプ。MVPでは resonance、archive、star_letter を許可する。';

-- Keep notification creation trusted: clients can read their own rows and update is_read only.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;
drop policy if exists notifications_insert_actor_for_post_author on public.notifications;

create or replace function app_private.create_star_letter_notification()
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

  if target_author_id = new.author_id then
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
    new.author_id,
    new.post_id,
    'star_letter',
    'あなたの流星便に星文が届きました。'
  );

  return new;
end;
$$;

revoke all on function app_private.create_star_letter_notification() from public, anon, authenticated;

drop trigger if exists star_letters_create_notification on public.star_letters;
create trigger star_letters_create_notification
after insert on public.star_letters
for each row execute function app_private.create_star_letter_notification();

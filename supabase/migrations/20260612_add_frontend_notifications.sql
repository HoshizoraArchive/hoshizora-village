-- 星空Village frontend notification insert migration
-- Execute this file in the Supabase SQL Editor after merging the PR.
-- This lets the app create R.Connect rows after successful 共鳴 / Archive / 星文 actions.

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

revoke all on table public.notifications from anon, authenticated;
grant select, insert on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;

drop policy if exists notifications_insert_actor_for_post_author on public.notifications;
create policy notifications_insert_actor_for_post_author on public.notifications
for insert to authenticated
with check (
  actor_id = auth.uid()
  and recipient_id <> auth.uid()
  and post_id is not null
  and type in ('resonance', 'archive', 'star_letter')
  and exists (
    select 1 from public.posts p
    where p.id = public.notifications.post_id
      and p.author_id = public.notifications.recipient_id
  )
  and (
    type <> 'resonance'
    or coalesce((select pr.notify_authors_when_i_resonate from public.profiles pr where pr.id = auth.uid()), true)
  )
  and (
    type <> 'archive'
    or coalesce((select pr.notify_authors_when_i_archive from public.profiles pr where pr.id = auth.uid()), true)
  )
);

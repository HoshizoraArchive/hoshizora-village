-- Prevent Archive off/on loops from repeatedly notifying the same author for
-- the same post. Archive state itself remains fully usable; only duplicate
-- author notifications within the cooldown window are suppressed.

begin;

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

  if target_author_id is null
    or target_author_id = new.profile_id
    or app_private.is_black_hole_between_profiles(
      target_author_id,
      new.profile_id
    )
  then
    return new;
  end if;

  select coalesce(pr.notify_authors_when_i_archive, true)
  into should_notify
  from public.profiles pr
  where pr.id = new.profile_id;

  if should_notify is not true then
    return new;
  end if;

  if exists (
    select 1
    from public.notifications existing
    where existing.recipient_id = target_author_id
      and existing.actor_id = new.profile_id
      and existing.post_id = new.post_id
      and existing.type = 'archive'
      and existing.created_at >= now() - interval '24 hours'
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

revoke all on function app_private.create_archive_notification()
from public, anon, authenticated, service_role;

commit;

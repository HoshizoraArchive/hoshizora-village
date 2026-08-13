begin;

create or replace function app_private.create_ai_resident_mention_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  if not exists (
    select 1
    from public.posts p
    where p.id = new.post_id
      and p.author_id = new.actor_profile_id
  ) then
    raise exception 'mention post author must match the actor';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = new.post_id
      and position(new.token in coalesce(p.body, '')) > 0
  ) then
    raise exception 'mention token must appear in the post body';
  end if;

  if not exists (
    select 1
    from public.profile_kinds k
    where k.profile_id = new.actor_profile_id
      and k.kind = 'ai_resident'
  ) then
    raise exception 'mention actor must be an AI resident';
  end if;

  if not exists (
    select 1
    from public.profile_kinds k
    where k.profile_id = new.mentioned_profile_id
      and k.kind = 'human'
  ) then
    raise exception 'mention target must be human';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'AI住人')
  into actor_name
  from public.profiles p
  where p.id = new.actor_profile_id;

  delete from public.notifications n
  where n.recipient_id = new.mentioned_profile_id
    and n.post_id = new.post_id
    and n.actor_id = new.actor_profile_id
    and n.type = 'chia_post';

  insert into public.notifications (recipient_id, actor_id, post_id, type, message)
  values (
    new.mentioned_profile_id,
    new.actor_profile_id,
    new.post_id,
    'ai_resident_mention',
    actor_name || 'が、あなたのことを話してるよ！🌟'
  )
  on conflict do nothing;

  return new;
end;
$$;

commit;

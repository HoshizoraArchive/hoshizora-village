begin;

create table if not exists public.post_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  mentioned_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  constraint post_mentions_token_check check (token ~ '^@[A-Za-z0-9_]{1,64}$'),
  constraint post_mentions_post_profile_unique unique (post_id, mentioned_profile_id)
);

create index if not exists post_mentions_mentioned_profile_created_at_idx
  on public.post_mentions (mentioned_profile_id, created_at desc);

alter table public.post_mentions enable row level security;
revoke all on table public.post_mentions from public, anon, authenticated;
grant select on table public.post_mentions to authenticated;
grant all on table public.post_mentions to service_role;

create policy post_mentions_select_recipient
  on public.post_mentions
  for select
  to authenticated
  using (mentioned_profile_id = auth.uid());

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
check (type = any (array[
  'resonance'::text,
  'archive'::text,
  'star_letter'::text,
  'star_letter_reply'::text,
  'star_letter_resonance'::text,
  'content_report'::text,
  'chia_post'::text,
  'ai_resident_mention'::text
]));

create unique index if not exists notifications_ai_resident_mention_unique
  on public.notifications (recipient_id, post_id, actor_id)
  where type = 'ai_resident_mention' and post_id is not null and actor_id is not null;

create or replace function app_private.create_ai_resident_mention_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  if new.actor_profile_id = new.mentioned_profile_id then
    return new;
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = new.post_id
      and p.author_id = new.actor_profile_id
      and position(new.token in coalesce(p.body, '')) > 0
  ) then
    raise exception 'mention must belong to the actor post and appear in its body';
  end if;

  if not exists (
    select 1 from public.profile_kinds k
    where k.profile_id = new.actor_profile_id and k.kind = 'ai_resident'
  ) then
    raise exception 'mention actor must be an AI resident';
  end if;

  if not exists (
    select 1 from public.profile_kinds k
    where k.profile_id = new.mentioned_profile_id and k.kind = 'human'
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

revoke all on function app_private.create_ai_resident_mention_notification()
from public, anon, authenticated;

drop trigger if exists post_mentions_create_ai_resident_notification on public.post_mentions;
create trigger post_mentions_create_ai_resident_notification
after insert on public.post_mentions
for each row execute function app_private.create_ai_resident_mention_notification();

create or replace function app_private.enqueue_push_notification_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.type = 'chia_post'
    or (
      new.type = 'ai_resident_mention'
      and exists (
        select 1
        from public.profiles actor
        where actor.id = new.actor_id
          and actor.username = 'chia_hoshizora'
      )
    )
  )
  and not coalesce(
    (
      select recipient.notify_chia_posts
      from public.profiles recipient
      where recipient.id = new.recipient_id
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

revoke all on function app_private.enqueue_push_notification_job()
from public, anon, authenticated;

commit;

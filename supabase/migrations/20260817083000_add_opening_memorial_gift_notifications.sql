begin;

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
    'chia_post'::text,
    'ai_resident_mention'::text,
    'opening_memorial_gift'::text
  ]));

create unique index if not exists notifications_opening_memorial_gift_recipient_unique
  on public.notifications (recipient_id)
  where type = 'opening_memorial_gift';

create or replace function app_private.create_opening_memorial_gift_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chia_id uuid;
begin
  if not exists (
    select 1
    from public.profile_frames frame
    join public.profile_cohorts cohort
      on cohort.profile_id = new.profile_id
     and cohort.cohort_key = 'beta_resident'
    where frame.id = new.frame_id
      and frame.frame_key = 'opening_memorial_beta'
  ) then
    return new;
  end if;

  select profile.id
    into chia_id
  from public.profiles profile
  join public.profile_kinds profile_kind
    on profile_kind.profile_id = profile.id
  where profile.username = 'chia_hoshizora'
    and profile_kind.kind = 'ai_resident'
  limit 1;

  if chia_id is null then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    message
  )
  values (
    new.profile_id,
    chia_id,
    'opening_memorial_gift',
    '星空ちあからアイコンフレームが届きました！'
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function app_private.create_opening_memorial_gift_notification() from public;
revoke execute on function app_private.create_opening_memorial_gift_notification() from anon, authenticated;

drop trigger if exists profile_frame_ownerships_create_opening_memorial_gift_notification
  on public.profile_frame_ownerships;

create trigger profile_frame_ownerships_create_opening_memorial_gift_notification
after insert on public.profile_frame_ownerships
for each row
execute function app_private.create_opening_memorial_gift_notification();

create or replace function app_private.enqueue_push_notification_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Opening Memorial is presented inside Village on the resident's next visit.
  -- Do not turn the backfill or grant itself into an unsolicited OS/Web Push.
  if new.type = 'opening_memorial_gift' then
    return new;
  end if;

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

-- Backfill the gift message for beta residents who already own the frame.
-- The unique partial index keeps this safe to replay.
insert into public.notifications (
  recipient_id,
  actor_id,
  type,
  message
)
select
  ownership.profile_id,
  chia.id,
  'opening_memorial_gift',
  '星空ちあからアイコンフレームが届きました！'
from public.profile_frame_ownerships ownership
join public.profile_frames frame
  on frame.id = ownership.frame_id
 and frame.frame_key = 'opening_memorial_beta'
join public.profile_cohorts cohort
  on cohort.profile_id = ownership.profile_id
 and cohort.cohort_key = 'beta_resident'
cross join lateral (
  select profile.id
  from public.profiles profile
  join public.profile_kinds profile_kind
    on profile_kind.profile_id = profile.id
  where profile.username = 'chia_hoshizora'
    and profile_kind.kind = 'ai_resident'
  limit 1
) chia
on conflict do nothing;

commit;

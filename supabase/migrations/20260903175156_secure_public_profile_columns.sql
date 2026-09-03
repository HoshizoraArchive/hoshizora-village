begin;

-- RLS continues to decide which profile rows are visible. Browser roles only
-- need the public presentation columns from rows that pass that policy.
revoke select on table public.profiles from public, anon, authenticated;
revoke select (
  notify_authors_when_i_archive,
  notify_authors_when_i_resonate,
  notify_chia_posts
) on table public.profiles from public, anon, authenticated;

grant select (
  id,
  display_name,
  username,
  avatar_url,
  bio,
  constellation_note,
  active_frame_id
) on table public.profiles to anon, authenticated;

-- The browser cannot select notification preferences from profiles directly.
-- This argument-free boundary can only resolve the caller's auth.uid().
create or replace function public.get_own_profile_notification_settings_v1()
returns table (
  notify_authors_when_i_archive boolean,
  notify_authors_when_i_resonate boolean,
  notify_chia_posts boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.notify_authors_when_i_archive,
    profile.notify_authors_when_i_resonate,
    profile.notify_chia_posts
  from public.profiles profile
  where profile.id = (select auth.uid());
$$;

comment on function public.get_own_profile_notification_settings_v1() is
  '認証中の本人について、3つの通知設定だけを返す。対象profile IDは引数で指定できない。';

revoke all on function public.get_own_profile_notification_settings_v1()
from public, anon, authenticated, service_role;
grant execute on function public.get_own_profile_notification_settings_v1()
to authenticated;

commit;

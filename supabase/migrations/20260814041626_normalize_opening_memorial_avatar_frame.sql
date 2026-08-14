begin;

insert into public.profile_frames (
  frame_key,
  name,
  description,
  asset_path,
  acquisition_type,
  rarity,
  frame_scale,
  frame_offset_x,
  frame_offset_y,
  is_active
)
values (
  'opening_memorial_beta',
  'Opening Memorial｜First Resident',
  '星空Villageのベータ期に入村した最初の住民へ贈る、開村記念プロフィールアイコンフレーム。',
  '/profile-frames/opening-memorial.png',
  'beta_reward',
  'special',
  1.22,
  0,
  0,
  true
)
on conflict (frame_key) do update
set
  name = excluded.name,
  description = excluded.description,
  asset_path = excluded.asset_path,
  acquisition_type = excluded.acquisition_type,
  rarity = excluded.rarity,
  frame_scale = excluded.frame_scale,
  frame_offset_x = excluded.frame_offset_x,
  frame_offset_y = excluded.frame_offset_y,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.grant_opening_memorial_to_beta_residents()
returns table (
  ownerships_granted bigint,
  frames_equipped bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_frame_id uuid;
  granted_count bigint := 0;
  equipped_count bigint := 0;
begin
  select frame.id
  into target_frame_id
  from public.profile_frames frame
  where frame.frame_key = 'opening_memorial_beta'
    and frame.is_active is true;

  if target_frame_id is null then
    raise exception 'active Opening Memorial frame is unavailable'
      using errcode = '55000';
  end if;

  insert into public.profile_frame_ownerships (
    profile_id,
    frame_id,
    acquisition_source
  )
  select
    cohort.profile_id,
    target_frame_id,
    'beta_resident'
  from public.profile_cohorts cohort
  where cohort.cohort_key = 'beta_resident'
  on conflict (profile_id, frame_id) do nothing;

  get diagnostics granted_count = row_count;

  update public.profiles profile
  set active_frame_id = target_frame_id
  where profile.active_frame_id is null
    and exists (
      select 1
      from public.profile_cohorts cohort
      where cohort.profile_id = profile.id
        and cohort.cohort_key = 'beta_resident'
    );

  get diagnostics equipped_count = row_count;

  return query
  select granted_count, equipped_count;
end;
$$;

comment on function public.grant_opening_memorial_to_beta_residents() is
'beta_resident cohortへOpening Memorial所有権を冪等付与し、未装着プロフィールだけ初期装着するservice_role専用operator RPC。';

revoke all on function public.grant_opening_memorial_to_beta_residents()
from public, anon, authenticated;
grant execute on function public.grant_opening_memorial_to_beta_residents()
to service_role;

select *
from public.grant_opening_memorial_to_beta_residents();

commit;

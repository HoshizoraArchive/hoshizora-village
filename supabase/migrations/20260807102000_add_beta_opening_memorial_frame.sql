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

insert into public.profile_frame_ownerships (
  profile_id,
  frame_id,
  acquisition_source
)
select
  cohort.profile_id,
  frame.id,
  'beta_resident'
from public.profile_cohorts cohort
cross join public.profile_frames frame
where cohort.cohort_key = 'beta_resident'
  and frame.frame_key = 'opening_memorial_beta'
on conflict (profile_id, frame_id) do nothing;

update public.profiles profile
set active_frame_id = frame.id
from public.profile_cohorts cohort
cross join public.profile_frames frame
where profile.id = cohort.profile_id
  and cohort.cohort_key = 'beta_resident'
  and frame.frame_key = 'opening_memorial_beta'
  and profile.active_frame_id is null;

commit;

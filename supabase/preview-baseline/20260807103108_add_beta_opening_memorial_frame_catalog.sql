-- PREVIEW-V2 ONLY / DO NOT APPLY TO PRODUCTION.
-- Safe catalog-only form of Production migration 20260807103108.
-- Profile ownership and active-frame updates are intentionally excluded.

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
  false
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

commit;

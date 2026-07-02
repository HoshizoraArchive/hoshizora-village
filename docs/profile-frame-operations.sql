-- 星空Village プロフィールアイコンフレーム運営付与SQL
-- Supabase SQL Editorで、対象プロフィールとAuthメールアドレスを確認してから実行してください。
-- migration本体には実在UUIDをハードコードしません。

-- 1. 星空ちあ本人とchia_guideフレームを確認する。
select
  p.id as profile_id,
  p.username,
  u.email,
  f.id as frame_id,
  f.frame_key,
  f.name
from public.profiles p
join auth.users u on u.id = p.id
cross join public.profile_frames f
where p.username = 'chia_hoshizora'
  and lower(u.email) = lower('akaibuhoshizora+chia@gmail.com')
  and f.frame_key = 'chia_guide';

-- 2. 対象が1件だけ返ることを確認してから、フレーム所有権を付与する。
insert into public.profile_frame_ownerships (
  profile_id,
  frame_id,
  acquisition_source
)
select
  p.id,
  f.id,
  'operator_grant'
from public.profiles p
join auth.users u on u.id = p.id
join public.profile_frames f on f.frame_key = 'chia_guide'
where p.username = 'chia_hoshizora'
  and lower(u.email) = lower('akaibuhoshizora+chia@gmail.com')
on conflict (profile_id, frame_id) do update
set acquisition_source = excluded.acquisition_source;

-- 3. 必要に応じて、星空ちあへchia_guideを装着する。
update public.profiles p
set active_frame_id = f.id
from auth.users u,
  public.profile_frames f
where u.id = p.id
  and p.username = 'chia_hoshizora'
  and lower(u.email) = lower('akaibuhoshizora+chia@gmail.com')
  and f.frame_key = 'chia_guide'
  and exists (
    select 1
    from public.profile_frame_ownerships ownership
    where ownership.profile_id = p.id
      and ownership.frame_id = f.id
  )
returning
  p.id as profile_id,
  p.username,
  p.active_frame_id;

-- 4. 装着状態を確認する。
select
  p.id as profile_id,
  p.username,
  u.email,
  f.frame_key,
  f.name,
  f.asset_path
from public.profiles p
join auth.users u on u.id = p.id
left join public.profile_frames f on f.id = p.active_frame_id
where p.username = 'chia_hoshizora'
  and lower(u.email) = lower('akaibuhoshizora+chia@gmail.com');

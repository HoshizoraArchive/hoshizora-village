begin;

create or replace function app_private.grant_opening_memorial_on_beta_cohort_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_frame_id uuid;
begin
  if new.cohort_key <> 'beta_resident' then
    return new;
  end if;

  select frame.id
  into target_frame_id
  from public.profile_frames frame
  where frame.frame_key = 'opening_memorial_beta'
    and frame.is_active is true;

  if target_frame_id is null then
    return new;
  end if;

  insert into public.profile_frame_ownerships (
    profile_id,
    frame_id,
    acquisition_source
  )
  values (
    new.profile_id,
    target_frame_id,
    'beta_resident'
  )
  on conflict (profile_id, frame_id) do nothing;

  update public.profiles profile
  set active_frame_id = target_frame_id
  where profile.id = new.profile_id
    and profile.active_frame_id is null;

  return new;
end;
$$;

comment on function app_private.grant_opening_memorial_on_beta_cohort_insert() is
'新しくbeta_residentへ加入したprofileへOpening Memorial所有権を自動付与し、他フレーム未装着時のみ初期装着する。フレームが利用不能でも入村処理は失敗させない。';

drop trigger if exists profile_cohorts_grant_opening_memorial on public.profile_cohorts;
create trigger profile_cohorts_grant_opening_memorial
after insert on public.profile_cohorts
for each row
when (new.cohort_key = 'beta_resident')
execute function app_private.grant_opening_memorial_on_beta_cohort_insert();

-- Backfill any beta resident that joined after the original Opening Memorial rollout.
select *
from public.grant_opening_memorial_to_beta_residents();

commit;

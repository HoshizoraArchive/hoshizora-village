begin;

insert into public.titles (
  key,
  label,
  description,
  variant,
  emblem_path,
  is_active,
  sort_order
)
values (
  'beta_tester',
  '古参村人',
  '星空Villageの開村初期に参加したベータ住民へ贈る、加入順を刻んだ永久記念称号。',
  'standard',
  null,
  true,
  100
)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  variant = excluded.variant,
  emblem_path = excluded.emblem_path,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function app_private.assign_beta_resident_serial_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cohort_key <> 'beta_resident' or new.serial_number is not null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hoshizora-beta-resident-serial-v1', 0)
  );

  select coalesce(max(cohort.serial_number), 0) + 1
  into new.serial_number
  from public.profile_cohorts cohort
  where cohort.cohort_key in ('beta_resident', 'beta_resident_alumni')
    and cohort.serial_number is not null;

  return new;
end;
$$;

comment on function app_private.assign_beta_resident_serial_number() is
'beta_resident追加時に、歴代発行済み番号の最大値+1を競合なく採番する。既存番号は変更しない。';

drop trigger if exists profile_cohorts_assign_beta_serial on public.profile_cohorts;
create trigger profile_cohorts_assign_beta_serial
before insert on public.profile_cohorts
for each row
execute function app_private.assign_beta_resident_serial_number();

create or replace function app_private.grant_founding_resident_title_from_cohort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  founding_title_id uuid;
  has_other_primary boolean;
begin
  if new.cohort_key not in ('beta_resident', 'beta_resident_alumni')
    or new.serial_number is null then
    return new;
  end if;

  select title.id
  into founding_title_id
  from public.titles title
  where title.key = 'beta_tester'
    and title.is_active is true;

  if founding_title_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.profile_titles existing
    where existing.profile_id = new.profile_id
      and existing.is_primary is true
      and existing.title_id <> founding_title_id
  )
  into has_other_primary;

  insert into public.profile_titles (
    profile_id,
    title_id,
    is_primary
  )
  values (
    new.profile_id,
    founding_title_id,
    not has_other_primary
  )
  on conflict (profile_id, title_id) do update
  set is_primary = case
    when profile_titles.is_primary then true
    when not has_other_primary then true
    else false
  end;

  return new;
end;
$$;

comment on function app_private.grant_founding_resident_title_from_cohort() is
'beta residentの番号確定時に古参村人称号を冪等付与し、既存primary称号がない場合だけprimaryにする。';

drop trigger if exists profile_cohorts_grant_founding_title on public.profile_cohorts;
create trigger profile_cohorts_grant_founding_title
after insert or update of serial_number, cohort_key on public.profile_cohorts
for each row
execute function app_private.grant_founding_resident_title_from_cohort();

-- Initial backfill: preserve any already-issued serials and number only pending beta residents.
do $$
declare
  current_max integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hoshizora-beta-resident-serial-v1', 0)
  );

  select coalesce(max(cohort.serial_number), 0)
  into current_max
  from public.profile_cohorts cohort
  where cohort.cohort_key in ('beta_resident', 'beta_resident_alumni')
    and cohort.serial_number is not null;

  with pending as (
    select
      cohort.profile_id,
      row_number() over (
        order by cohort.joined_at asc, cohort.profile_id asc
      )::integer as sequence_number
    from public.profile_cohorts cohort
    where cohort.cohort_key = 'beta_resident'
      and cohort.serial_number is null
  )
  update public.profile_cohorts cohort
  set serial_number = current_max + pending.sequence_number
  from pending
  where cohort.profile_id = pending.profile_id
    and cohort.cohort_key = 'beta_resident'
    and cohort.serial_number is null;
end;
$$;

-- Reconcile title ownership for beta records that already had serials before this migration.
with founding_title as (
  select id
  from public.titles
  where key = 'beta_tester'
    and is_active is true
),
targets as (
  select cohort.profile_id
  from public.profile_cohorts cohort
  where cohort.cohort_key in ('beta_resident', 'beta_resident_alumni')
    and cohort.serial_number is not null
)
insert into public.profile_titles (profile_id, title_id, is_primary)
select
  targets.profile_id,
  founding_title.id,
  not exists (
    select 1
    from public.profile_titles existing
    where existing.profile_id = targets.profile_id
      and existing.is_primary is true
  )
from targets
cross join founding_title
on conflict (profile_id, title_id) do nothing;

-- Preserve the historical number/title if a beta human is later converted to an AI resident.
create or replace function app_private.sync_beta_resident_cohort_from_profile_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.kind = 'human' then
    insert into public.profile_cohorts (profile_id, cohort_key)
    values (new.profile_id, 'beta_resident')
    on conflict (profile_id, cohort_key) do nothing;
  elsif tg_op = 'UPDATE'
    and old.kind is distinct from new.kind
    and new.kind = 'ai_resident' then
    insert into public.profile_cohorts (
      profile_id,
      cohort_key,
      serial_number,
      joined_at
    )
    select
      cohort.profile_id,
      'beta_resident_alumni',
      cohort.serial_number,
      cohort.joined_at
    from public.profile_cohorts cohort
    where cohort.profile_id = new.profile_id
      and cohort.cohort_key = 'beta_resident'
    on conflict (profile_id, cohort_key) do update
    set
      serial_number = coalesce(profile_cohorts.serial_number, excluded.serial_number),
      joined_at = least(profile_cohorts.joined_at, excluded.joined_at);

    delete from public.profile_cohorts
    where profile_id = new.profile_id
      and cohort_key = 'beta_resident';
  end if;

  return new;
end;
$$;

comment on function app_private.sync_beta_resident_cohort_from_profile_kind() is
'β期間中、新しくhumanとして作成されたprofile_kindをbeta_residentへ自動登録する。ai_residentへ変更された場合は歴史番号をbeta_resident_alumniへ保存する。';

commit;

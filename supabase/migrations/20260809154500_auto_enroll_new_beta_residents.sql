begin;

create or replace function app_private.sync_beta_resident_cohort_from_profile_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'human' then
    insert into public.profile_cohorts (profile_id, cohort_key)
    values (new.profile_id, 'beta_resident')
    on conflict (profile_id, cohort_key) do nothing;
  elsif new.kind = 'ai_resident' then
    delete from public.profile_cohorts
    where profile_id = new.profile_id
      and cohort_key = 'beta_resident';
  end if;

  return new;
end;
$$;

comment on function app_private.sync_beta_resident_cohort_from_profile_kind() is
'β期間中、新しくhumanとして作成されたprofile_kindをbeta_residentへ自動登録し、ai_residentへ変更された場合はβ対象から外す。既存profile_kinds行はバックフィルしない。';

drop trigger if exists profile_kinds_sync_beta_resident on public.profile_kinds;
create trigger profile_kinds_sync_beta_resident
after insert or update of kind on public.profile_kinds
for each row
execute function app_private.sync_beta_resident_cohort_from_profile_kind();

commit;

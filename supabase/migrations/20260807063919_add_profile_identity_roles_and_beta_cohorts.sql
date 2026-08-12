-- Replay-safe reconstruction for Production ledger version 20260807063919.
-- This is not the exact Production statement: environment-specific identity assignments are intentionally omitted.
-- The exact remote fingerprint is tracked as audit metadata in the focused migration test.

begin;

create table if not exists public.profile_kinds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  kind text not null default 'human' check (kind in ('human', 'ai_resident')),
  classified_at timestamptz not null default now()
);

comment on table public.profile_kinds is
'Semantic identity classification for a profile. Security permissions must not depend on this table.';
comment on column public.profile_kinds.kind is
'What the profile fundamentally is: human or ai_resident.';

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (role_key ~ '^[a-z0-9_]+$'),
  granted_at timestamptz not null default now(),
  primary key (profile_id, role_key)
);

comment on table public.profile_roles is
'Non-exclusive Village roles such as founder, admin, guide. Authorization remains in dedicated security tables such as app_admins.';
comment on column public.profile_roles.role_key is
'Semantic role label; multiple roles may be attached to one profile.';

create table if not exists public.profile_cohorts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  cohort_key text not null check (cohort_key ~ '^[a-z0-9_]+$'),
  serial_number integer check (serial_number is null or serial_number > 0),
  joined_at timestamptz not null default now(),
  primary key (profile_id, cohort_key)
);

comment on table public.profile_cohorts is
'Historical membership/cohort facts such as beta_resident. These facts are independent from titles and profile frames.';
comment on column public.profile_cohorts.serial_number is
'Optional permanent sequence number within a cohort, e.g. beta resident No.1. Null until numbering is finalized.';

create unique index if not exists profile_cohorts_unique_serial
  on public.profile_cohorts (cohort_key, serial_number)
  where serial_number is not null;

alter table public.profile_kinds enable row level security;
alter table public.profile_roles enable row level security;
alter table public.profile_cohorts enable row level security;

revoke all on table public.profile_kinds from anon, authenticated;
revoke all on table public.profile_roles from anon, authenticated;
revoke all on table public.profile_cohorts from anon, authenticated;

grant select on table public.profile_kinds to anon, authenticated;
grant select on table public.profile_roles to anon, authenticated;
grant select on table public.profile_cohorts to anon, authenticated;
grant all on table public.profile_kinds to service_role;
grant all on table public.profile_roles to service_role;
grant all on table public.profile_cohorts to service_role;

drop policy if exists profile_kinds_select_public on public.profile_kinds;
create policy profile_kinds_select_public
  on public.profile_kinds for select to anon, authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = profile_kinds.profile_id
    )
  );

drop policy if exists profile_roles_select_public on public.profile_roles;
create policy profile_roles_select_public
  on public.profile_roles for select to anon, authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = profile_roles.profile_id
    )
  );

drop policy if exists profile_cohorts_select_public on public.profile_cohorts;
create policy profile_cohorts_select_public
  on public.profile_cohorts for select to anon, authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = profile_cohorts.profile_id
    )
  );

insert into public.profile_kinds (profile_id, kind)
select profile.id, 'human'
from public.profiles profile
on conflict (profile_id) do nothing;

insert into public.profile_roles (profile_id, role_key)
select admin_user.user_id, 'admin'
from public.app_admins admin_user
join public.profiles profile
  on profile.id = admin_user.user_id
on conflict (profile_id, role_key) do nothing;

create or replace function public.ensure_default_profile_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_kinds (profile_id, kind)
  values (new.id, 'human')
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_default_profile_kind()
from public, anon, authenticated;
grant execute on function public.ensure_default_profile_kind() to service_role;

drop trigger if exists ensure_default_profile_kind_after_profile_insert
on public.profiles;
create trigger ensure_default_profile_kind_after_profile_insert
after insert on public.profiles
for each row execute function public.ensure_default_profile_kind();

commit;

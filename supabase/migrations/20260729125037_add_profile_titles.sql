-- Add reusable profile titles and seed Chia's celestial guide role.
-- This migration is additive and is not applied by this change.

begin;

create table if not exists public.titles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
    check (key = btrim(key) and key ~ '^[a-z0-9_]{3,64}$'),
  label text not null
    check (label = btrim(label) and char_length(label) between 1 and 80),
  description text
    check (description is null or char_length(description) <= 500),
  variant text not null default 'standard'
    check (variant = btrim(variant) and variant ~ '^[a-z0-9_]{3,64}$'),
  emblem_path text
    check (
      emblem_path is null
      or (
        emblem_path = btrim(emblem_path)
        and emblem_path ~ '^/assets/titles/[A-Za-z0-9._/-]+\.png$'
      )
    ),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_titles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  is_primary boolean not null default false,
  granted_at timestamptz not null default now(),
  primary key (profile_id, title_id)
);

comment on table public.titles is
  'プロフィール称号の公開カタログ。付与操作はservice_roleまたはmigrationに限定する。';
comment on table public.profile_titles is
  'プロフィールが保有する称号。1プロフィールにつきprimary称号は最大1件。';
comment on column public.titles.variant is
  'UI表示variant。standardまたはcelestial_guideなどの安定した識別子。';
comment on column public.titles.emblem_path is
  'public配下に置く任意の透過PNGパス。称号本文はlabelをHTMLテキストとして表示する。';

create unique index if not exists profile_titles_one_primary_per_profile_idx
  on public.profile_titles(profile_id)
  where is_primary;
create index if not exists profile_titles_title_id_idx
  on public.profile_titles(title_id);
create index if not exists titles_active_sort_order_idx
  on public.titles(is_active, sort_order, key);

drop trigger if exists titles_set_updated_at on public.titles;
create trigger titles_set_updated_at
before update on public.titles
for each row execute function public.set_updated_at();

alter table public.titles enable row level security;
alter table public.profile_titles enable row level security;

drop policy if exists titles_select_active on public.titles;
create policy titles_select_active on public.titles
for select
to anon, authenticated
using (is_active);

drop policy if exists profile_titles_select_active on public.profile_titles;
create policy profile_titles_select_active on public.profile_titles
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.titles t
    where t.id = title_id
      and t.is_active
  )
);

revoke all on table public.titles from public, anon, authenticated;
revoke all on table public.profile_titles from public, anon, authenticated;
grant select on table public.titles to anon, authenticated;
grant select on table public.profile_titles to anon, authenticated;
grant select, insert, update, delete on table public.titles to service_role;
grant select, insert, update, delete on table public.profile_titles to service_role;

insert into public.titles (
  key,
  label,
  description,
  variant,
  emblem_path,
  is_active,
  sort_order
)
values
  (
    'celestial_guide',
    '街の案内人',
    '小さな光を見守り、星空Villageを案内する星空ちあ専用の役職。',
    'celestial_guide',
    '/assets/titles/chia-celestial-guide-emblem.png',
    true,
    10
  ),
  (
    'beta_tester',
    'ベータテスター',
    '星空Villageのベータテストへ参加した村人の称号。',
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

do $$
declare
  v_chia_profile_id uuid;
  v_celestial_guide_title_id uuid;
begin
  select p.id
    into v_chia_profile_id
  from public.profiles p
  where p.username = 'chia_hoshizora'
  limit 1;

  select t.id
    into v_celestial_guide_title_id
  from public.titles t
  where t.key = 'celestial_guide';

  if v_chia_profile_id is not null and v_celestial_guide_title_id is not null then
    update public.profile_titles pt
      set is_primary = false
    where pt.profile_id = v_chia_profile_id
      and pt.title_id <> v_celestial_guide_title_id
      and pt.is_primary;

    insert into public.profile_titles (profile_id, title_id, is_primary)
    values (v_chia_profile_id, v_celestial_guide_title_id, true)
    on conflict (profile_id, title_id) do update
      set is_primary = true;

    update public.profiles p
      set display_name = '星空ちあ'
    where p.id = v_chia_profile_id
      and p.display_name = '星空ちあ｜街の案内人';
  end if;
end;
$$;

commit;

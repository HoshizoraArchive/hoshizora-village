begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profile_frames (
  id uuid primary key default gen_random_uuid(),
  frame_key text not null unique check (frame_key ~ '^[a-z0-9_]{3,64}$'),
  name text not null check (char_length(trim(name)) > 0),
  description text,
  asset_path text not null check (asset_path ~ '^/profile-frames/[A-Za-z0-9._/-]+\.png$'),
  acquisition_type text not null default 'admin_grant' check (
    acquisition_type in ('admin_grant', 'beta_reward', 'event', 'purchase', 'gacha', 'system')
  ),
  rarity text,
  frame_scale numeric(5,2) not null default 1.22 check (frame_scale between 0.50 and 2.00),
  frame_offset_x numeric(6,2) not null default 0,
  frame_offset_y numeric(6,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profile_frames is 'プロフィールアイコンフレームのカタログ。運営付与、ベータ特典、課金、ガチャなど将来拡張用。';
comment on column public.profile_frames.frame_key is 'アプリ内で参照する一意キー。例: chia_guide。';
comment on column public.profile_frames.asset_path is 'public配下の透過PNGパス。例: /profile-frames/chia-guide.png。';
comment on column public.profile_frames.acquisition_type is '入手種別。MVPではadmin_grantのみ使用。';
comment on column public.profile_frames.frame_scale is 'プロフィール画像に対するフレーム表示倍率。';
comment on column public.profile_frames.frame_offset_x is 'フレーム表示位置のX方向調整パーセント。';
comment on column public.profile_frames.frame_offset_y is 'フレーム表示位置のY方向調整パーセント。';

alter table public.profiles
  add column if not exists active_frame_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_active_frame_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_active_frame_id_fkey
      foreign key (active_frame_id)
      references public.profile_frames(id)
      on delete set null;
  end if;
end;
$$;

comment on column public.profiles.active_frame_id is '現在装着中のプロフィールアイコンフレーム。nullならフレームなし。';

create table if not exists public.profile_frame_ownerships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  frame_id uuid not null references public.profile_frames(id) on delete cascade,
  acquisition_source text not null default 'operator_grant',
  granted_at timestamptz not null default now(),
  unique (profile_id, frame_id)
);

comment on table public.profile_frame_ownerships is 'どのプロフィールがどのプロフィールアイコンフレームを所持しているか。ブラウザからの自己付与は許可しない。';
comment on column public.profile_frame_ownerships.acquisition_source is '付与元。MVPではoperator_grantを使用。';

create index if not exists profile_frames_frame_key_idx on public.profile_frames(frame_key);
create index if not exists profile_frames_is_active_idx on public.profile_frames(is_active);
create index if not exists profiles_active_frame_id_idx on public.profiles(active_frame_id);
create index if not exists profile_frame_ownerships_profile_id_idx on public.profile_frame_ownerships(profile_id);
create index if not exists profile_frame_ownerships_frame_id_idx on public.profile_frame_ownerships(frame_id);

drop trigger if exists profile_frames_set_updated_at on public.profile_frames;
create trigger profile_frames_set_updated_at
before update on public.profile_frames
for each row execute function public.set_updated_at();

create or replace function app_private.ensure_profile_active_frame_owned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active_frame_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.profile_frame_ownerships ownership
    join public.profile_frames frame on frame.id = ownership.frame_id
    where ownership.profile_id = new.id
      and ownership.frame_id = new.active_frame_id
      and frame.is_active is true
  ) then
    raise exception 'active profile frame must be owned by this profile'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.ensure_profile_active_frame_owned() from public, anon, authenticated;

drop trigger if exists profiles_active_frame_owned on public.profiles;
create trigger profiles_active_frame_owned
before insert or update of active_frame_id on public.profiles
for each row execute function app_private.ensure_profile_active_frame_owned();

alter table public.profile_frames enable row level security;
alter table public.profile_frame_ownerships enable row level security;

revoke all on table public.profile_frames from public, anon, authenticated;
revoke all on table public.profile_frame_ownerships from public, anon, authenticated;
grant select on table public.profile_frames to anon, authenticated;
grant select on table public.profile_frame_ownerships to authenticated;

drop policy if exists profile_frames_select_active on public.profile_frames;
create policy profile_frames_select_active on public.profile_frames
for select
to public
using (is_active is true);

drop policy if exists profile_frame_ownerships_select_own on public.profile_frame_ownerships;
create policy profile_frame_ownerships_select_own on public.profile_frame_ownerships
for select
to authenticated
using (profile_id = (select auth.uid()));

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
  'chia_guide',
  '星空ちあ｜街の案内人',
  '星空ちあ専用のプロフィールアイコンフレーム',
  '/profile-frames/chia-guide.png',
  'admin_grant',
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

commit;

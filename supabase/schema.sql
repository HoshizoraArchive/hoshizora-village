-- 星空Village Supabase schema draft
-- This is an early database design draft, not a production-ready migration.
-- Do not put API keys or secrets in this file.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username text unique,
  bio text,
  avatar_url text,
  constellation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'ユーザープロフィール。表示名、自己紹介、アイコン、わたしの星座を保存する。';

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.posts is '流星便。本文、投稿者、公開範囲、作成日時を保存する。';

create table if not exists public.profile_tags (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  kind text default 'interest',
  created_at timestamptz not null default now()
);

comment on table public.profile_tags is 'わたしの星座。好きなもの、趣味、特技、創作傾向などを保存する。';

create table if not exists public.post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

comment on table public.post_tags is '流星便タグ。投稿ごとのテーマや感情タグを保存する。';

create table if not exists public.resonances (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.resonances is '共鳴。同じユーザーが同じ流星便に何回でも共鳴できる前提で保存する。';

create table if not exists public.star_letters (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.star_letters is '星文。コメントではなく、流星便に残す言葉を保存する。';

create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.archives is 'Archive。保存ではなく、消したくない光を記録する機能。';

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  observer_id uuid references public.profiles(id) on delete set null,
  observer_type text not null default 'human' check (observer_type in ('human', 'ai_resident')),
  ai_resident_key text,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.observations is '観測ログ。人間またはAI住人が流星便を観測した記録を保存する。';

create index if not exists posts_author_id_idx on public.posts(author_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists profile_tags_profile_id_idx on public.profile_tags(profile_id);
create index if not exists post_tags_post_id_idx on public.post_tags(post_id);
create index if not exists resonances_post_id_idx on public.resonances(post_id);
create index if not exists resonances_profile_id_idx on public.resonances(profile_id);
create index if not exists star_letters_post_id_idx on public.star_letters(post_id);
create index if not exists archives_profile_id_idx on public.archives(profile_id);
create index if not exists observations_post_id_idx on public.observations(post_id);

-- RLS notes:
-- Row Level Security must be finalized before production use.
-- Draft policy direction:
-- - Public posts can be read by anyone.
-- - Insert/update/delete should be limited to the owner.
-- - Archives should be readable only by the owning profile.
-- - Resonances and star_letters should require a logged-in user.
--
-- Example later step:
-- alter table public.profiles enable row level security;
-- alter table public.posts enable row level security;
-- alter table public.profile_tags enable row level security;
-- alter table public.post_tags enable row level security;
-- alter table public.resonances enable row level security;
-- alter table public.star_letters enable row level security;
-- alter table public.archives enable row level security;
-- alter table public.observations enable row level security;

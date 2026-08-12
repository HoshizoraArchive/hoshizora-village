create table if not exists public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  title text not null,
  parent_id uuid references public.guide_sections(id) on delete cascade,
  display_variant text not null default 'standard',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guide_entries (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.guide_sections(id) on delete cascade,
  entry_key text not null unique,
  entry_type text not null,
  body text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
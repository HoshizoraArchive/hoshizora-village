create table if not exists public.app_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on table public.app_admins from public, anon, authenticated;
grant select, insert, delete on table public.app_admins to service_role;
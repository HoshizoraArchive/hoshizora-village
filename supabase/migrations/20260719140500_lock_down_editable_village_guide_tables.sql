alter table public.guide_sections enable row level security;
alter table public.guide_entries enable row level security;
revoke all on table public.guide_sections from public, anon, authenticated;
revoke all on table public.guide_entries from public, anon, authenticated;
grant select, insert, delete on table public.app_admins to service_role;
grant select on table public.guide_sections to anon, authenticated;
grant select (
  id,
  section_id,
  entry_key,
  entry_type,
  body,
  sort_order,
  is_visible,
  created_at,
  updated_at
) on table public.guide_entries to anon, authenticated;
grant insert, update, delete on table public.guide_sections to authenticated;
grant insert, update, delete on table public.guide_entries to authenticated;
grant select, insert, update, delete on table public.guide_sections to service_role;
grant select, insert, update, delete on table public.guide_entries to service_role;
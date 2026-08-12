drop policy if exists guide_entries_select_visible on public.guide_entries;
create policy guide_entries_select_visible on public.guide_entries
for select to anon, authenticated
using (
  is_visible is true
  and app_private.guide_section_is_public(section_id)
);

drop policy if exists guide_entries_admin_select_all on public.guide_entries;
create policy guide_entries_admin_select_all on public.guide_entries
for select to authenticated
using ((select public.is_app_admin()));

drop policy if exists guide_entries_admin_insert on public.guide_entries;
create policy guide_entries_admin_insert on public.guide_entries
for insert to authenticated
with check ((select public.is_app_admin()));

drop policy if exists guide_entries_admin_update on public.guide_entries;
create policy guide_entries_admin_update on public.guide_entries
for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists guide_entries_admin_delete on public.guide_entries;
create policy guide_entries_admin_delete on public.guide_entries
for delete to authenticated
using ((select public.is_app_admin()));
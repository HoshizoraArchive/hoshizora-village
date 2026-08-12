drop policy if exists guide_sections_select_visible on public.guide_sections;
create policy guide_sections_select_visible on public.guide_sections
for select to anon, authenticated
using (app_private.guide_section_is_public(id));

drop policy if exists guide_sections_admin_select_all on public.guide_sections;
create policy guide_sections_admin_select_all on public.guide_sections
for select to authenticated
using ((select public.is_app_admin()));

drop policy if exists guide_sections_admin_insert on public.guide_sections;
create policy guide_sections_admin_insert on public.guide_sections
for insert to authenticated
with check ((select public.is_app_admin()));

drop policy if exists guide_sections_admin_update on public.guide_sections;
create policy guide_sections_admin_update on public.guide_sections
for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists guide_sections_admin_delete on public.guide_sections;
create policy guide_sections_admin_delete on public.guide_sections
for delete to authenticated
using ((select public.is_app_admin()));
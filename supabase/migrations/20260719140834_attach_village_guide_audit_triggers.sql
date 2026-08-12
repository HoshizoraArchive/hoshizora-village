revoke all on function app_private.set_guide_section_audit_fields() from public, anon, authenticated;
revoke all on function app_private.set_guide_entry_audit_fields() from public, anon, authenticated;

drop trigger if exists guide_sections_set_audit_fields on public.guide_sections;
create trigger guide_sections_set_audit_fields
before insert or update on public.guide_sections
for each row execute function app_private.set_guide_section_audit_fields();

drop trigger if exists guide_entries_set_audit_fields on public.guide_entries;
create trigger guide_entries_set_audit_fields
before insert or update on public.guide_entries
for each row execute function app_private.set_guide_entry_audit_fields();
alter table public.guide_entries add column if not exists updated_by uuid;

alter table public.guide_sections
  add constraint guide_sections_key_check check (section_key ~ '^[a-z0-9][a-z0-9_]{2,63}$'),
  add constraint guide_sections_title_check check (title = btrim(title) and title <> '' and char_length(title) <= 120),
  add constraint guide_sections_parent_check check (parent_id is null or parent_id <> id),
  add constraint guide_sections_variant_check check (display_variant in ('standard','subsection','notice')),
  add constraint guide_sections_sort_order_check check (sort_order between 0 and 1000000);

alter table public.guide_entries
  add constraint guide_entries_key_check check (entry_key ~ '^[a-z0-9][a-z0-9_]{2,95}$'),
  add constraint guide_entries_type_check check (entry_type in ('paragraph','list_item')),
  add constraint guide_entries_body_check check (body = btrim(body) and body <> '' and char_length(body) <= 2000),
  add constraint guide_entries_sort_order_check check (sort_order between 0 and 1000000);

create index if not exists guide_sections_parent_sort_idx on public.guide_sections(parent_id,sort_order,section_key);
create index if not exists guide_sections_visible_sort_idx on public.guide_sections(is_visible,sort_order,section_key);
create index if not exists guide_entries_section_sort_idx on public.guide_entries(section_id,sort_order,entry_key);
create index if not exists guide_entries_visible_sort_idx on public.guide_entries(is_visible,section_id,sort_order);
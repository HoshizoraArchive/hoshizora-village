-- PREVIEW-V2 ONLY / DO NOT APPLY TO PRODUCTION.
-- Approved non-personal Village guide catalog copied from the reviewed migration.

update public.guide_entries
set
  body = E'たった一人でも、\nその人の人生を\n変革し、幸せにする。',
  updated_at = now()
where entry_key = 'about_village_philosophy';

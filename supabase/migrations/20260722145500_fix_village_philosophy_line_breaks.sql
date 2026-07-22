update public.guide_entries
set
  body = E'たった一人でも、\nその人の人生を\n変革し、幸せにする。',
  updated_at = now()
where entry_key = 'about_village_philosophy';

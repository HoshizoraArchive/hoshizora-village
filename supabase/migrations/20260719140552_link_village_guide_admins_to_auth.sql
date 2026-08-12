alter table public.app_admins
  add constraint app_admins_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.guide_entries
  add constraint guide_entries_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;
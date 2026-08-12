create or replace function app_private.set_guide_entry_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.entry_key is distinct from old.entry_key then
    raise exception 'guide entry key cannot be changed' using errcode = '23514';
  end if;
  new.body := btrim(new.body);
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  return new;
end;
$$;
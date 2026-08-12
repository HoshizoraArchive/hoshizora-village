create or replace function app_private.set_guide_section_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.section_key is distinct from old.section_key then
    raise exception 'guide section key cannot be changed' using errcode = '23514';
  end if;
  new.title := btrim(new.title);
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  return new;
end;
$$;
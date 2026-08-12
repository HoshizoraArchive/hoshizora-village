create or replace function app_private.guide_section_is_public(p_section_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_id uuid := p_section_id;
  parent_value uuid;
  visible_value boolean;
  visited uuid[] := array[]::uuid[];
  depth_value integer := 0;
begin
  while current_id is not null and depth_value < 64 loop
    if current_id = any(visited) then
      return false;
    end if;
    visited := array_append(visited, current_id);

    select parent_id, is_visible
      into parent_value, visible_value
    from public.guide_sections
    where id = current_id;

    if not found or visible_value is not true then
      return false;
    end if;

    current_id := parent_value;
    depth_value := depth_value + 1;
  end loop;

  return current_id is null;
end;
$$;
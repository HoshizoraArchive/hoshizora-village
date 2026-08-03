do $$
declare
  v_function_oid oid;
  v_definition text;
  v_avatar_guard constant text := $guard$        and nullif(btrim(coalesce(p.avatar_url, '')), '') is not null$guard$;
begin
  select p.oid
  into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'advance_initial_onboarding'
    and pg_get_function_identity_arguments(p.oid) = 'p_action text, p_status text, p_target_id uuid';

  if v_function_oid is null then
    raise exception 'advance_initial_onboarding(text,text,uuid) not found';
  end if;

  v_definition := pg_get_functiondef(v_function_oid);

  if position(v_avatar_guard in v_definition) = 0 then
    if position('avatar_url' in v_definition) > 0 then
      raise exception 'unexpected avatar validation shape in advance_initial_onboarding';
    end if;

    return;
  end if;

  execute replace(v_definition, v_avatar_guard, '');
end;
$$;

comment on function public.advance_initial_onboarding(text, text, uuid) is
  'Advances initial onboarding. Profile completion requires a saved display name; avatar remains optional.';

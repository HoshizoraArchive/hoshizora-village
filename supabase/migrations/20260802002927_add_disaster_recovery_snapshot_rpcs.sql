-- Disaster-recovery snapshot helpers for trusted server-side backup jobs.
-- These RPCs are executable only by service_role. Browser roles cannot call them.

create or replace function public.create_disaster_recovery_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  table_row record;
  table_rows jsonb;
  public_snapshot jsonb := '{}'::jsonb;
  auth_users jsonb := '[]'::jsonb;
  auth_identities jsonb := '[]'::jsonb;
begin
  for table_row in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(source_row)), ''[]''::jsonb) from public.%I source_row',
      table_row.tablename
    )
    into table_rows;

    public_snapshot := public_snapshot || jsonb_build_object(table_row.tablename, table_rows);
  end loop;

  select coalesce(
    jsonb_agg(
      to_jsonb(user_row)
      - array[
          'confirmation_token',
          'recovery_token',
          'email_change_token_new',
          'email_change_token_current',
          'reauthentication_token'
        ]::text[]
    ),
    '[]'::jsonb
  )
  into auth_users
  from auth.users user_row;

  select coalesce(jsonb_agg(to_jsonb(identity_row)), '[]'::jsonb)
  into auth_identities
  from auth.identities identity_row;

  return jsonb_build_object(
    'version', 1,
    'created_at', clock_timestamp(),
    'public', public_snapshot,
    'auth', jsonb_build_object(
      'users', auth_users,
      'identities', auth_identities
    )
  );
end;
$$;

revoke all on function public.create_disaster_recovery_snapshot() from public;
revoke all on function public.create_disaster_recovery_snapshot() from anon;
revoke all on function public.create_disaster_recovery_snapshot() from authenticated;
grant execute on function public.create_disaster_recovery_snapshot() to service_role;

create or replace function public.verify_disaster_recovery_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  table_row record;
  payload jsonb;
  expected_count integer;
  restored_count integer;
  checked_tables integer := 0;
  restored_public_rows bigint := 0;
  temp_table_name text;
  auth_users_payload jsonb;
  auth_identities_payload jsonb;
  restored_auth_users integer := 0;
  restored_auth_identities integer := 0;
begin
  if p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'object'
     or coalesce((p_snapshot ->> 'version')::integer, 0) <> 1
     or jsonb_typeof(p_snapshot -> 'public') <> 'object'
     or jsonb_typeof(p_snapshot -> 'auth') <> 'object' then
    raise exception 'INVALID_DISASTER_RECOVERY_SNAPSHOT';
  end if;

  for table_row in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    payload := p_snapshot -> 'public' -> table_row.tablename;

    if payload is null or jsonb_typeof(payload) <> 'array' then
      raise exception 'MISSING_DISASTER_RECOVERY_TABLE:%', table_row.tablename;
    end if;

    expected_count := jsonb_array_length(payload);
    temp_table_name := 'dr_verify_' || substr(md5(table_row.tablename), 1, 20);

    execute format(
      'create temp table %I on commit drop as select * from public.%I with no data',
      temp_table_name,
      table_row.tablename
    );

    if expected_count > 0 then
      execute format(
        'insert into %I select * from jsonb_populate_recordset(null::public.%I, $1)',
        temp_table_name,
        table_row.tablename
      ) using payload;
    end if;

    execute format('select count(*) from %I', temp_table_name) into restored_count;

    if restored_count <> expected_count then
      raise exception 'DISASTER_RECOVERY_ROW_COUNT_MISMATCH:%:%:%',
        table_row.tablename,
        expected_count,
        restored_count;
    end if;

    checked_tables := checked_tables + 1;
    restored_public_rows := restored_public_rows + restored_count;
  end loop;

  auth_users_payload := p_snapshot -> 'auth' -> 'users';
  auth_identities_payload := p_snapshot -> 'auth' -> 'identities';

  if jsonb_typeof(auth_users_payload) <> 'array'
     or jsonb_typeof(auth_identities_payload) <> 'array' then
    raise exception 'INVALID_DISASTER_RECOVERY_AUTH_SNAPSHOT';
  end if;

  create temp table dr_verify_auth_users on commit drop
  as select * from auth.users with no data;

  if jsonb_array_length(auth_users_payload) > 0 then
    insert into dr_verify_auth_users
    select * from jsonb_populate_recordset(null::auth.users, auth_users_payload);
  end if;

  select count(*) into restored_auth_users from dr_verify_auth_users;

  if restored_auth_users <> jsonb_array_length(auth_users_payload) then
    raise exception 'DISASTER_RECOVERY_AUTH_USERS_MISMATCH';
  end if;

  create temp table dr_verify_auth_identities on commit drop
  as select * from auth.identities with no data;

  if jsonb_array_length(auth_identities_payload) > 0 then
    insert into dr_verify_auth_identities
    select * from jsonb_populate_recordset(null::auth.identities, auth_identities_payload);
  end if;

  select count(*) into restored_auth_identities from dr_verify_auth_identities;

  if restored_auth_identities <> jsonb_array_length(auth_identities_payload) then
    raise exception 'DISASTER_RECOVERY_AUTH_IDENTITIES_MISMATCH';
  end if;

  return jsonb_build_object(
    'ok', true,
    'checked_public_tables', checked_tables,
    'restored_public_rows', restored_public_rows,
    'restored_auth_users', restored_auth_users,
    'restored_auth_identities', restored_auth_identities
  );
end;
$$;

revoke all on function public.verify_disaster_recovery_snapshot(jsonb) from public;
revoke all on function public.verify_disaster_recovery_snapshot(jsonb) from anon;
revoke all on function public.verify_disaster_recovery_snapshot(jsonb) from authenticated;
grant execute on function public.verify_disaster_recovery_snapshot(jsonb) to service_role;

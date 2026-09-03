-- LOCAL ONLY. Verifies profiles column privacy, owner settings behavior, the
-- existing black-hole row filter, and service-role compatibility. All
-- synthetic rows and updates are rolled back.

begin;

do $$
declare
  v_public_columns constant text[] := array[
    'active_frame_id',
    'avatar_url',
    'bio',
    'constellation_note',
    'display_name',
    'id',
    'username'
  ];
  v_private_column text;
  v_rpc pg_catalog.pg_proc%rowtype;
begin
  if pg_catalog.has_table_privilege('anon', 'public.profiles', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  then
    raise exception 'browser role retains table-level profiles SELECT';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.profiles', 'SELECT,UPDATE') then
    raise exception 'service_role profiles compatibility grant is missing';
  end if;

  if (
    select pg_catalog.array_agg(attribute.attname::text order by attribute.attname)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.profiles'::pg_catalog.regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and pg_catalog.has_column_privilege('anon', 'public.profiles', attribute.attname, 'SELECT')
  ) is distinct from v_public_columns then
    raise exception 'anon profiles SELECT columns differ from the public contract';
  end if;

  if (
    select pg_catalog.array_agg(attribute.attname::text order by attribute.attname)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.profiles'::pg_catalog.regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and pg_catalog.has_column_privilege('authenticated', 'public.profiles', attribute.attname, 'SELECT')
  ) is distinct from v_public_columns then
    raise exception 'authenticated profiles SELECT columns differ from the public contract';
  end if;

  foreach v_private_column in array array[
    'notify_authors_when_i_archive',
    'notify_authors_when_i_resonate',
    'notify_chia_posts'
  ] loop
    if pg_catalog.has_column_privilege('anon', 'public.profiles', v_private_column, 'SELECT')
      or pg_catalog.has_column_privilege('authenticated', 'public.profiles', v_private_column, 'SELECT')
    then
      raise exception 'private profile column remains readable: %', v_private_column;
    end if;
  end loop;

  select procedure.*
  into strict v_rpc
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'get_own_profile_notification_settings_v1'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = '';

  if not v_rpc.prosecdef
    or v_rpc.provolatile <> 's'
    or not (v_rpc.proconfig @> array['search_path=""'])
    or pg_catalog.pg_get_function_result(v_rpc.oid) <>
      'TABLE(notify_authors_when_i_archive boolean, notify_authors_when_i_resonate boolean, notify_chia_posts boolean)'
  then
    raise exception 'own profile notification settings RPC definition is unsafe';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      'public.get_own_profile_notification_settings_v1()',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.get_own_profile_notification_settings_v1()',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.get_own_profile_notification_settings_v1()',
      'EXECUTE'
    )
  then
    raise exception 'own profile notification settings RPC grants are incorrect';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'get_own_profile_notification_settings_v1'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid) <> ''
  ) then
    raise exception 'own profile notification settings RPC accepts a target argument';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_public'
      and roles = array['anon', 'authenticated']::name[]
      and qual like '%is_black_hole_between%'
  ) then
    raise exception 'profiles black-hole row visibility policy changed';
  end if;
end;
$$;

set local session_replication_role = replica;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sec012-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'sec012-b@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'sec012-c@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.profiles (
  id,
  display_name,
  username,
  notify_authors_when_i_archive,
  notify_authors_when_i_resonate,
  notify_chia_posts
)
values
  ('12000000-0000-4000-8000-000000000001', 'SEC-012 User A', 'sec012_user_a', false, true, false),
  ('12000000-0000-4000-8000-000000000002', 'SEC-012 User B', 'sec012_user_b', true, false, true),
  ('12000000-0000-4000-8000-000000000003', 'SEC-012 User C', 'sec012_user_c', true, true, true);

insert into public.profile_blocks (blocker_id, blocked_id)
values (
  '12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002'
);

set local session_replication_role = origin;

set local role anon;
select 1 / ((select count(*) from public.profiles) = 3)::int;
select 1 / ((select count(*) from public.profiles where username = 'sec012_user_b') = 1)::int;

do $$
declare
  v_denied boolean := false;
begin
  begin
    perform notify_chia_posts from public.profiles;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;

  if not v_denied then
    raise exception 'anon read a private profile column';
  end if;

  v_denied := false;
  begin
    perform public.get_own_profile_notification_settings_v1();
  exception
    when insufficient_privilege then
      v_denied := true;
  end;

  if not v_denied then
    raise exception 'anon executed the own profile notification settings RPC';
  end if;
end;
$$;

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- The existing profiles_select_public policy still hides a black-holed row,
-- while another user's unblocked public profile remains visible.
select 1 / ((select count(*) from public.profiles where id = '12000000-0000-4000-8000-000000000001') = 1)::int;
select 1 / ((select count(*) from public.profiles where id = '12000000-0000-4000-8000-000000000002') = 0)::int;
select 1 / ((select count(*) from public.profiles where id = '12000000-0000-4000-8000-000000000003') = 1)::int;

do $$
declare
  v_denied boolean := false;
  v_settings record;
  v_updated_rows integer;
begin
  begin
    perform notify_authors_when_i_archive
    from public.profiles
    where id = '12000000-0000-4000-8000-000000000003';
  exception
    when insufficient_privilege then
      v_denied := true;
  end;

  if not v_denied then
    raise exception 'authenticated user read another profile notification setting';
  end if;

  select *
  into strict v_settings
  from public.get_own_profile_notification_settings_v1();

  if v_settings.notify_authors_when_i_archive is not false
    or v_settings.notify_authors_when_i_resonate is not true
    or v_settings.notify_chia_posts is not false
  then
    raise exception 'own notification settings RPC returned another profile or wrong values';
  end if;

  update public.profiles
  set
    notify_authors_when_i_archive = true,
    notify_authors_when_i_resonate = false,
    notify_chia_posts = true
  where id = '12000000-0000-4000-8000-000000000001';

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    raise exception 'owner notification settings update affected % rows', v_updated_rows;
  end if;

  select *
  into strict v_settings
  from public.get_own_profile_notification_settings_v1();

  if v_settings.notify_authors_when_i_archive is not true
    or v_settings.notify_authors_when_i_resonate is not false
    or v_settings.notify_chia_posts is not true
  then
    raise exception 'owner notification settings update was not readable through the RPC';
  end if;
end;
$$;

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  v_settings record;
begin
  select *
  into strict v_settings
  from public.get_own_profile_notification_settings_v1();

  if v_settings.notify_authors_when_i_archive is not true
    or v_settings.notify_authors_when_i_resonate is not false
    or v_settings.notify_chia_posts is not true
  then
    raise exception 'second user did not receive only their own settings';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  v_settings record;
  v_updated_rows integer;
begin
  select
    notify_authors_when_i_archive,
    notify_authors_when_i_resonate,
    notify_chia_posts
  into strict v_settings
  from public.profiles
  where id = '12000000-0000-4000-8000-000000000002';

  update public.profiles
  set notify_chia_posts = false
  where id = '12000000-0000-4000-8000-000000000002';

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    raise exception 'service_role profile update affected % rows', v_updated_rows;
  end if;
end;
$$;

reset role;
rollback;

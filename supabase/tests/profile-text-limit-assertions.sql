-- LOCAL ONLY. Verifies the database boundary for public profile text lengths.

begin;

set local session_replication_role = replica;

insert into public.profiles (
  id,
  display_name,
  username,
  bio,
  avatar_url,
  constellation_note
)
values (
  '13000000-0000-4000-8000-000000000001',
  repeat('名', 50),
  'profile_limit_ok',
  repeat('b', 500),
  'https://example.invalid/' || repeat('a', 2024),
  repeat('星', 500)
);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_display_name_length_check'
  ) then
    raise exception 'missing profiles_display_name_length_check';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_bio_length_check'
  ) then
    raise exception 'missing profiles_bio_length_check';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_constellation_note_length_check'
  ) then
    raise exception 'missing profiles_constellation_note_length_check';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_avatar_url_length_check'
  ) then
    raise exception 'missing profiles_avatar_url_length_check';
  end if;
end
$$;

do $$
begin
  begin
    insert into public.profiles (id, display_name)
    values ('13000000-0000-4000-8000-000000000002', repeat('名', 51));
    raise exception 'display_name over-limit insert unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.profiles (id, display_name, bio)
    values ('13000000-0000-4000-8000-000000000003', 'ok', repeat('b', 501));
    raise exception 'bio over-limit insert unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.profiles (id, display_name, constellation_note)
    values ('13000000-0000-4000-8000-000000000004', 'ok', repeat('星', 501));
    raise exception 'constellation_note over-limit insert unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.profiles (id, display_name, avatar_url)
    values ('13000000-0000-4000-8000-000000000005', 'ok', repeat('u', 2049));
    raise exception 'avatar_url over-limit insert unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end
$$;

rollback;

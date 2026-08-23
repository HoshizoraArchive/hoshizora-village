-- LOCAL ONLY. Exercises the browser RPC and rolls every synthetic row back.

begin;

do $$
begin
  if pg_catalog.has_table_privilege('authenticated', 'public.resonances', 'INSERT') then
    raise exception 'authenticated must not INSERT directly into public.resonances';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'resonances'
      and policyname = 'resonances_insert_logged_in'
  ) then
    raise exception 'legacy direct resonance INSERT policy still exists';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.add_post_resonance_v1(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute add_post_resonance_v1';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.add_post_resonance_v1(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute add_post_resonance_v1';
  end if;

  if pg_catalog.to_regclass('public.resonances_profile_created_at_idx') is null then
    raise exception 'resonance rate-limit index is missing';
  end if;
end;
$$;

-- The rows are deliberately synthetic and exist only inside this rollback-only
-- transaction. Disabling triggers avoids creating Auth users or beta cohorts.
set local session_replication_role = replica;

insert into public.profiles (id, display_name, username)
values
  ('10000000-0000-4000-8000-000000000001', 'Rate User A', 'rate_user_a'),
  ('10000000-0000-4000-8000-000000000002', 'Rate User B', 'rate_user_b'),
  ('10000000-0000-4000-8000-000000000003', 'Rate Author', 'rate_author');

insert into public.posts (id, author_id, type, body, visibility)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'text', 'rate post 1', 'public'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'text', 'rate post 2', 'public'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'text', 'rate post 3', 'public'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'text', 'rate post 4', 'public');

set local session_replication_role = origin;

-- Direct INSERT remains unavailable even with a matching auth.uid().
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  v_denied boolean := false;
begin
  begin
    insert into public.resonances (post_id, profile_id, resonance_type)
    values (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'sparkle'
    );
  exception
    when insufficient_privilege then
      v_denied := true;
  end;

  if not v_denied then
    raise exception 'authenticated direct INSERT unexpectedly succeeded';
  end if;
end;
$$;

-- All six existing types and repeated resonance to the same post still work.
do $$
declare
  v_result jsonb;
  v_type text;
begin
  foreach v_type in array array['silent', 'sparkle', 'afterglow', 'life', 'world', 'deep']
  loop
    select public.add_post_resonance_v1(
      '20000000-0000-4000-8000-000000000001',
      v_type
    ) into v_result;

    if v_result ->> 'outcome' <> 'created' then
      raise exception 'normal repeated resonance did not succeed: %', v_type;
    end if;
  end loop;

  for v_attempt in 1..14 loop
    perform public.add_post_resonance_v1(
      '20000000-0000-4000-8000-000000000001',
      'sparkle'
    );
  end loop;
end;
$$;

-- The 21st user/post request inside ten seconds is rejected.
do $$
declare
  v_limited boolean := false;
begin
  begin
    perform public.add_post_resonance_v1(
      '20000000-0000-4000-8000-000000000001',
      'sparkle'
    );
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'resonance rate limit exceeded' then
        raise;
      end if;
      v_limited := true;
  end;

  if not v_limited then
    raise exception 'user/post rate limit did not reject request 21';
  end if;
end;
$$;

reset role;

do $$
declare
  v_rows bigint;
  v_revision bigint;
  v_notifications bigint;
begin
  select count(*) into v_rows
  from public.resonances
  where profile_id = '10000000-0000-4000-8000-000000000001'
    and post_id = '20000000-0000-4000-8000-000000000001';

  select revision into v_revision
  from app_private.post_domain_revisions
  where post_id = '20000000-0000-4000-8000-000000000001'
    and domain = 'resonance';

  select count(*) into v_notifications
  from public.notifications
  where recipient_id = '10000000-0000-4000-8000-000000000003'
    and actor_id = '10000000-0000-4000-8000-000000000001'
    and post_id = '20000000-0000-4000-8000-000000000001'
    and type = 'resonance';

  if v_rows <> 20 or v_revision <> 20 or v_notifications <> 1 then
    raise exception 'rejected request changed rows/revision/notifications: %/%/%',
      v_rows, v_revision, v_notifications;
  end if;
end;
$$;

-- Changing post resets only the narrow window. The user-wide window remains.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  for v_attempt in 1..20 loop
    perform public.add_post_resonance_v1(
      '20000000-0000-4000-8000-000000000002',
      'sparkle'
    );
  end loop;

  for v_attempt in 1..20 loop
    perform public.add_post_resonance_v1(
      '20000000-0000-4000-8000-000000000003',
      'sparkle'
    );
  end loop;
end;
$$;

-- A fresh post does not bypass the 60-per-user window.
do $$
declare
  v_limited boolean := false;
begin
  begin
    perform public.add_post_resonance_v1(
      '20000000-0000-4000-8000-000000000004',
      'sparkle'
    );
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'resonance rate limit exceeded' then
        raise;
      end if;
      v_limited := true;
  end;

  if not v_limited then
    raise exception 'user-wide rate limit did not reject request 61';
  end if;
end;
$$;

reset role;

-- A different authenticated user has an independent limit and cannot choose
-- another profile id because the RPC has no actor argument.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  v_result jsonb;
begin
  select public.add_post_resonance_v1(
    '20000000-0000-4000-8000-000000000001',
    'deep'
  ) into v_result;

  if v_result ->> 'outcome' <> 'created' then
    raise exception 'second user did not receive an independent limit';
  end if;
end;
$$;

reset role;

-- Anon cannot execute the RPC at all.
set local role anon;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  v_denied boolean := false;
begin
  begin
    perform public.add_post_resonance_v1(
      '20000000-0000-4000-8000-000000000001',
      'sparkle'
    );
  exception
    when insufficient_privilege then
      v_denied := true;
  end;

  if not v_denied then
    raise exception 'anon unexpectedly executed add_post_resonance_v1';
  end if;
end;
$$;

reset role;

do $$
declare
  v_user_a_rows bigint;
  v_user_b_rows bigint;
  v_post4_rows bigint;
  v_post4_revision bigint;
  v_post4_notifications bigint;
begin
  select count(*) into v_user_a_rows
  from public.resonances
  where profile_id = '10000000-0000-4000-8000-000000000001';

  select count(*) into v_user_b_rows
  from public.resonances
  where profile_id = '10000000-0000-4000-8000-000000000002';

  select count(*) into v_post4_rows
  from public.resonances
  where post_id = '20000000-0000-4000-8000-000000000004';

  select coalesce(max(revision), 0) into v_post4_revision
  from app_private.post_domain_revisions
  where post_id = '20000000-0000-4000-8000-000000000004'
    and domain = 'resonance';

  select count(*) into v_post4_notifications
  from public.notifications
  where post_id = '20000000-0000-4000-8000-000000000004'
    and type = 'resonance';

  if v_user_a_rows <> 60
    or v_user_b_rows <> 1
    or v_post4_rows <> 0
    or v_post4_revision <> 0
    or v_post4_notifications <> 0
  then
    raise exception 'final resonance boundary mismatch: %/%/%/%/%',
      v_user_a_rows,
      v_user_b_rows,
      v_post4_rows,
      v_post4_revision,
      v_post4_notifications;
  end if;
end;
$$;

rollback;

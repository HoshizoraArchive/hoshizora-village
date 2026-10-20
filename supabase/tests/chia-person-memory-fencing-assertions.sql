-- LOCAL ONLY: run after migrations against a disposable replay database.
-- Synthetic identities and all changes roll back.
begin;
set local session_replication_role = replica;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-0000-0000-000000000000', '31000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'memory-chia@example.invalid', '', now(), '{}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000000', '31000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'memory-a@example.invalid', '', now(), '{}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000000', '31000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'memory-b@example.invalid', '', now(), '{}', '{}', now(), now());
set local session_replication_role = origin;

insert into public.profiles (id, display_name, username) values
('31000000-0000-4000-8000-000000000001', 'Memory Chia', 'memory_chia'),
('31000000-0000-4000-8000-000000000002', 'Memory A', 'memory_a'),
('31000000-0000-4000-8000-000000000003', 'Memory B', 'memory_b');
update public.profile_kinds set kind = 'ai_resident'
 where profile_id = '31000000-0000-4000-8000-000000000001';

insert into public.posts (id, author_id, body) values
('32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000001', 'Memory source post');
insert into public.star_letters (id, post_id, author_id, body) values
('33000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'Person A evidence'),
('33000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003', 'Person B evidence');

insert into public.chia_person_memories (chia_profile_id, person_profile_id, source_star_letter_id, memory_key, content)
values
('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', 'preferred_topic', 'A likes composing'),
('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003', 'preferred_topic', 'B likes drawing');

do $$
begin
  if (select count(*) from public.chia_person_memories) <> 2 then
    raise exception 'memory keys from different people collided';
  end if;
  if has_table_privilege('anon', 'public.chia_person_memories', 'SELECT')
    or has_table_privilege('authenticated', 'public.chia_person_memories', 'INSERT')
    or has_function_privilege('authenticated', 'public.complete_chia_star_letter_reply_run(uuid,uuid,text,text,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_chia_star_letter_reply_run_legacy(uuid,uuid)', 'EXECUTE')
  then
    raise exception 'client role has unauthorized capability';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.chia_person_memories) <> 1
    or (select content from public.chia_person_memories) <> 'A likes composing' then
    raise exception 'RLS allowed cross-person memory access';
  end if;
  update public.chia_person_memories set content = 'A likes music';
  if (select content from public.chia_person_memories) <> 'A likes music' then
    raise exception 'owner correction failed';
  end if;
  delete from public.chia_person_memories;
  if exists (select 1 from public.chia_person_memories) then
    raise exception 'owner deletion failed';
  end if;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.chia_person_memories) <> 1
    or not exists (
      select 1 from public.chia_person_memories
      where person_profile_id = '31000000-0000-4000-8000-000000000003'
    ) then
    raise exception 'deleting A memory affected another person';
  end if;
end;
$$;

-- One person may have up to 30 stable memories; the 31st is refused.
insert into public.chia_person_memories (chia_profile_id, person_profile_id, source_star_letter_id, memory_key, content)
select '31000000-0000-4000-8000-000000000001',
       '31000000-0000-4000-8000-000000000002',
       '33000000-0000-4000-8000-000000000002',
       'key_' || n, 'test'
from generate_series(1, 30) n;
do $$
begin
  begin
    insert into public.chia_person_memories(chia_profile_id, person_profile_id, source_star_letter_id, memory_key, content)
    values ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', 'overflow', 'refuse');
    raise exception 'memory bound was bypassed';
  exception when check_violation then
    null;
  end;
end;
$$;

-- Reclaim after a stalled worker must invalidate its prior token.
insert into public.posts (id, author_id, body)
values ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Test post');
insert into public.star_letters (id, post_id, author_id, body)
values ('33000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'Test letter');

delete from public.chia_person_memories
where person_profile_id = '31000000-0000-4000-8000-000000000002'
  and memory_key = 'key_30';

insert into public.chia_person_memories (
  chia_profile_id, person_profile_id, source_star_letter_id, memory_key, content
) values (
  '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  '33000000-0000-4000-8000-000000000001',
  'source_linked', 'Old content'
);
update public.star_letters set body = 'Edited letter'
where id = '33000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.chia_person_memories
     where memory_key = 'source_linked') then
    raise exception 'source edit did not invalidate derived memory';
  end if;
  begin
    insert into public.chia_person_memories (
      chia_profile_id, person_profile_id, source_star_letter_id,
      source_updated_at, memory_key, content
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      '33000000-0000-4000-8000-000000000001',
      '2000-01-01T00:00:00Z', 'stale_source', 'Unverified stale fact'
    );
    raise exception 'stale source snapshot was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;

do $$
declare
  v_first jsonb;
  v_second jsonb;
  v_run uuid;
  v_token uuid;
  v_result jsonb;
begin
  v_first := public.claim_chia_star_letter_reply_run(
    '33000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001'
  );
  if v_first ->> 'outcome' <> 'claimed' or v_first ->> 'claim_token' is null then
    raise exception 'initial fenced claim failed: %', v_first;
  end if;
  v_run := (v_first ->> 'run_id')::uuid;
  v_token := (v_first ->> 'claim_token')::uuid;

  update public.chia_star_letter_reply_runs
    set updated_at = now() - interval '16 minutes'
  where id = v_run;
  v_second := public.claim_chia_star_letter_reply_run(
    '33000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001'
  );
  if v_second ->> 'outcome' <> 'claimed'
    or (v_second ->> 'run_id')::uuid <> v_run
    or (v_second ->> 'claim_token')::uuid = v_token then
    raise exception 'reclaimed lease did not rotate token: %', v_second;
  end if;
  v_result := public.complete_chia_star_letter_reply_run(
    v_run, '31000000-0000-4000-8000-000000000001', 'reply', 'stale message', v_token
  );
  if v_result ->> 'outcome' <> 'stale_claim' then
    raise exception 'stale completion accepted: %', v_result;
  end if;
  v_result := public.fail_chia_star_letter_reply_run(v_run, 'stale failure', v_token);
  if v_result ->> 'outcome' <> 'stale_claim' then
    raise exception 'stale failure accepted: %', v_result;
  end if;
  v_result := public.complete_chia_star_letter_reply_run(
    v_run, '31000000-0000-4000-8000-000000000001', 'reply', 'legacy stale message'
  );
  if v_result ->> 'outcome' <> 'stale_claim' then
    raise exception 'legacy completion bypassed reclaimed lease: %', v_result;
  end if;
  v_result := public.complete_chia_star_letter_reply_run(
    v_run, '31000000-0000-4000-8000-000000000001', 'reply', 'current message',
    (v_second ->> 'claim_token')::uuid
  );
  if v_result ->> 'outcome' <> 'replied' then
    raise exception 'current token did not complete: %', v_result;
  end if;
  if (select count(*) from public.notifications
      where recipient_id = '31000000-0000-4000-8000-000000000002'
        and type = 'star_letter_reply'
        and star_letter_id = (v_result ->> 'reply_star_letter_id')::uuid) <> 1 then
    raise exception 'notification was not delivered exactly once';
  end if;
end;
$$;

rollback;

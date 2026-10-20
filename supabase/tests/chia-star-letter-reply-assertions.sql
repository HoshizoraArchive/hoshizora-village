-- LOCAL ONLY. Exercises the Chia star-letter auto-reply RPC contract on a
-- fresh replayed database. Synthetic rows are rolled back at the end.

begin;

-- Auth user creation has Production-oriented consent triggers. These synthetic
-- local fixtures only need to satisfy profiles.id -> auth.users.id, so mirror
-- the established replay-test pattern and suppress triggers for this insert.
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
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'test-chia@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'test-human-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'test-human-b@example.invalid', '', now(), '{}', '{}', now(), now());

set local session_replication_role = origin;

insert into public.profiles (id, display_name, username)
values
  ('21000000-0000-4000-8000-000000000001', 'Test Chia', 'test_chia'),
  ('21000000-0000-4000-8000-000000000002', 'Human A', 'test_human_a'),
  ('21000000-0000-4000-8000-000000000003', 'Human B', 'test_human_b');

update public.profile_kinds
set kind = 'ai_resident'
where profile_id = '21000000-0000-4000-8000-000000000001';

insert into public.posts (id, author_id, body)
values
  ('22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '今日は何食べた？'),
  ('22000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '人間の流星便');

insert into public.star_letters (id, post_id, author_id, body)
values
  ('23000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', '冷やし中華を食べました。');

do $$
declare
  v_claim jsonb;
  v_complete jsonb;
  v_reply_id uuid;
  v_notification_count integer;
  v_status jsonb;
  v_discovery record;
  v_stale_claim jsonb;
begin
  update public.star_letters set created_at=now()-interval '10 minutes'
  where id='23000000-0000-4000-8000-000000000001';
  select * into v_discovery
  from public.discover_chia_star_letter_reply_candidates(
    '21000000-0000-4000-8000-000000000001',now()-interval '1 day',50,null,null
  ) where source_star_letter_id='23000000-0000-4000-8000-000000000001';
  if v_discovery.source_star_letter_id is null then
    raise exception 'eligible due source was omitted from discovery';
  end if;

  v_claim := public.claim_chia_star_letter_reply_run(
    '23000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001'
  );

  if coalesce((v_claim ->> 'claimed')::boolean, false) is not true
    or v_claim ->> 'outcome' <> 'claimed'
    or (v_claim ->> 'attempts')::integer <> 1
  then
    raise exception 'eligible top-level star letter was not claimed: %', v_claim;
  end if;

  v_complete := public.complete_chia_star_letter_reply_run(
    (v_claim ->> 'run_id')::uuid,
    '21000000-0000-4000-8000-000000000001',
    'reply',
    '冷やし中華いいね！'
  );

  if v_complete ->> 'outcome' <> 'replied' then
    raise exception 'reply run did not complete: %', v_complete;
  end if;

  v_reply_id := (v_complete ->> 'reply_star_letter_id')::uuid;

  if not exists (
    select 1
    from public.star_letters
    where id = v_reply_id
      and author_id = '21000000-0000-4000-8000-000000000001'
      and post_id = '22000000-0000-4000-8000-000000000001'
      and parent_star_letter_id = '23000000-0000-4000-8000-000000000001'
      and client_request_id = '23000000-0000-4000-8000-000000000001'
      and body = '冷やし中華いいね！'
      and deleted_at is null
  ) then
    raise exception 'reply star letter was not persisted with the expected relationship';
  end if;

  select count(*)
  into v_notification_count
  from public.notifications
  where recipient_id = '21000000-0000-4000-8000-000000000002'
    and actor_id = '21000000-0000-4000-8000-000000000001'
    and star_letter_id = v_reply_id
    and type = 'star_letter_reply';

  if v_notification_count <> 1 then
    raise exception 'expected exactly one existing star_letter_reply notification, got %', v_notification_count;
  end if;

  v_status:=public.get_chia_star_letter_reply_run_status(
    '23000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001'
  );
  if v_status->>'status'<>'replied' or (v_status->>'reply_star_letter_id')::uuid<>v_reply_id then
    raise exception 'status did not reconcile the committed reply: %',v_status;
  end if;
  if exists(select 1 from public.discover_chia_star_letter_reply_candidates(
    '21000000-0000-4000-8000-000000000001',now()-interval '1 day',50,null,null
  ) c where c.source_star_letter_id='23000000-0000-4000-8000-000000000001') then
    raise exception 'terminal completed source remained discoverable';
  end if;

  v_claim := public.claim_chia_star_letter_reply_run(
    '23000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001'
  );

  if v_claim ->> 'outcome' <> 'already_replied'
    or coalesce((v_claim ->> 'claimed')::boolean, false) is true
  then
    raise exception 'duplicate source was not deduplicated: %', v_claim;
  end if;
end;
$$;

-- A source edit after the claim invalidates the generation atomically even
-- when the caller supplies the pre-edit revision captured in its snapshot.
insert into public.star_letters(id,post_id,author_id,body,created_at)
values('23000000-0000-4000-8000-000000000008','22000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000003','Source before edit',now()-interval '10 minutes');
do $$
declare v_claim jsonb; v_complete jsonb; v_wake jsonb; v_revision timestamptz; v_post_revision timestamptz;
begin
  v_claim:=public.claim_chia_star_letter_reply_run('23000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000001');
  if not coalesce((v_claim->>'claimed')::boolean,false) then raise exception 'freshness fixture claim failed: %',v_claim; end if;
  v_revision:=(v_claim->>'source_updated_at')::timestamptz;
  v_post_revision:=(v_claim->>'post_updated_at')::timestamptz;
  v_wake:=public.authorize_chia_dot_provider_wake(
    (v_claim->>'run_id')::uuid,'21000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000003',(v_claim->>'claim_token')::uuid
  );
  if v_wake->>'outcome'<>'authorized' then raise exception 'provider wake reservation failed: %',v_wake; end if;
  if public.authorize_chia_dot_provider_wake(
    (v_claim->>'run_id')::uuid,'21000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000003',(v_claim->>'claim_token')::uuid
  )->>'outcome'<>'already_woken' then raise exception 'provider wake was not idempotent'; end if;
  update public.star_letters set body='Source after edit' where id='23000000-0000-4000-8000-000000000008';
  v_complete:=public.complete_chia_star_letter_reply_run(
    (v_claim->>'run_id')::uuid,'21000000-0000-4000-8000-000000000001','reply','stale reply',
    (v_claim->>'claim_token')::uuid,v_revision,v_post_revision
  );
  if v_complete->>'outcome'<>'stale_source'
    or exists(select 1 from public.star_letters where parent_star_letter_id='23000000-0000-4000-8000-000000000008' and author_id='21000000-0000-4000-8000-000000000001') then
    raise exception 'stale snapshot created a reply: %',v_complete;
  end if;
end;
$$;

-- A villager replying directly to Chia's reply remains eligible as a continued
-- Chia <-> villager conversation.
insert into public.star_letters (
  id,
  post_id,
  author_id,
  body,
  parent_star_letter_id
)
select
  '23000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  '夏はやっぱり食べたくなります。',
  id
from public.star_letters
where author_id = '21000000-0000-4000-8000-000000000001'
  and parent_star_letter_id = '23000000-0000-4000-8000-000000000001';

-- The new claim policy respects the same wait window for direct replies to Chia.
update public.star_letters set created_at=now()-interval '10 minutes'
 where id='23000000-0000-4000-8000-000000000002';

do $$
declare
  v_claim jsonb;
begin
  v_claim := public.claim_chia_star_letter_reply_run(
    '23000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001'
  );

  if coalesce((v_claim ->> 'claimed')::boolean, false) is not true then
    raise exception 'direct reply to Chia was not eligible: %', v_claim;
  end if;
end;
$$;

-- Chia must not jump into a human -> human branch under her post.
insert into public.star_letters (id, post_id, author_id, body)
values (
  '23000000-0000-4000-8000-000000000003',
  '22000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  '人間Aの新しい星文'
);

insert into public.star_letters (
  id,
  post_id,
  author_id,
  body,
  parent_star_letter_id
)
values (
  '23000000-0000-4000-8000-000000000004',
  '22000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000003',
  '人間Bから人間Aへの返信',
  '23000000-0000-4000-8000-000000000003'
);

do $$
declare
  v_claim jsonb;
begin
  v_claim := public.claim_chia_star_letter_reply_run(
    '23000000-0000-4000-8000-000000000004',
    '21000000-0000-4000-8000-000000000001'
  );

  if v_claim ->> 'outcome' <> 'not_direct_conversation'
    or coalesce((v_claim ->> 'claimed')::boolean, false) is true
  then
    raise exception 'human-to-human branch was incorrectly claimed: %', v_claim;
  end if;
end;
$$;

-- A star letter on a non-Chia post must be rejected.
insert into public.star_letters (id, post_id, author_id, body)
values (
  '23000000-0000-4000-8000-000000000005',
  '22000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000003',
  '人間の流星便への星文'
);

do $$
declare
  v_claim jsonb;
begin
  v_claim := public.claim_chia_star_letter_reply_run(
    '23000000-0000-4000-8000-000000000005',
    '21000000-0000-4000-8000-000000000001'
  );

  if v_claim ->> 'outcome' <> 'not_eligible'
    or coalesce((v_claim ->> 'claimed')::boolean, false) is true
  then
    raise exception 'non-Chia post was incorrectly claimed: %', v_claim;
  end if;
end;
$$;

-- Black-hole relationships block automatic replies in either direction.
insert into public.profile_blocks (blocker_id, blocked_id)
values (
  '21000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000001'
);

insert into public.star_letters (id, post_id, author_id, body)
values (
  '23000000-0000-4000-8000-000000000006',
  '22000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000003',
  'ブロック中の星文'
);

do $$
declare
  v_claim jsonb;
begin
  v_claim := public.claim_chia_star_letter_reply_run(
    '23000000-0000-4000-8000-000000000006',
    '21000000-0000-4000-8000-000000000001'
  );

  if v_claim ->> 'outcome' <> 'blocked'
    or coalesce((v_claim ->> 'claimed')::boolean, false) is true
  then
    raise exception 'blocked author was incorrectly claimed: %', v_claim;
  end if;
end;
$$;

-- If a villager blocks Chia after claim but before completion, completion must
-- re-check the relationship and skip instead of sending a late reply.
insert into public.star_letters (id, post_id, author_id, body)
values (
  '23000000-0000-4000-8000-000000000007',
  '22000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  '返信前にブラックホールするテスト'
);

do $$
declare
  v_claim jsonb;
  v_complete jsonb;
  v_run_id uuid;
begin
  v_claim := public.claim_chia_star_letter_reply_run(
    '23000000-0000-4000-8000-000000000007',
    '21000000-0000-4000-8000-000000000001'
  );

  if coalesce((v_claim ->> 'claimed')::boolean, false) is not true then
    raise exception 'race test source was not claimed: %', v_claim;
  end if;

  v_run_id := (v_claim ->> 'run_id')::uuid;

  insert into public.profile_blocks (blocker_id, blocked_id)
  values (
    '21000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001'
  );

  v_complete := public.complete_chia_star_letter_reply_run(
    v_run_id,
    '21000000-0000-4000-8000-000000000001',
    'reply',
    'この返信は作成されてはいけません'
  );

  if v_complete ->> 'outcome' <> 'skipped' then
    raise exception 'completion ignored a newly-created block: %', v_complete;
  end if;

  if exists (
    select 1
    from public.star_letters
    where author_id = '21000000-0000-4000-8000-000000000001'
      and parent_star_letter_id = '23000000-0000-4000-8000-000000000007'
      and deleted_at is null
  ) then
    raise exception 'reply was inserted after the villager blocked Chia';
  end if;
end;
$$;

-- Internal ledger and RPCs remain service-role only.
do $$
begin
  if has_table_privilege('anon', 'public.chia_star_letter_reply_runs', 'SELECT')
    or has_table_privilege('authenticated', 'public.chia_star_letter_reply_runs', 'SELECT')
  then
    raise exception 'reply run ledger leaked to client roles';
  end if;

  if has_function_privilege(
      'anon',
      'public.claim_chia_star_letter_reply_run(uuid, uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.claim_chia_star_letter_reply_run(uuid, uuid)',
      'EXECUTE'
    )
  then
    raise exception 'claim RPC leaked to client roles';
  end if;

  if not has_function_privilege(
      'service_role',
      'public.claim_chia_star_letter_reply_run(uuid, uuid)',
      'EXECUTE'
    )
  then
    raise exception 'service_role cannot execute claim RPC';
  end if;
end;
$$;

rollback;

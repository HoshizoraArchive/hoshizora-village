-- LOCAL ONLY. Exercises the Chia star-letter auto-reply RPC contract on a
-- fresh replayed database. Synthetic rows are rolled back at the end.

begin;

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
begin
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

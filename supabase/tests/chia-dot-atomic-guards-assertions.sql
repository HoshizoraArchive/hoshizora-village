-- LOCAL ONLY. Atomic guard regressions use synthetic fixtures and roll back.
begin;

set local session_replication_role = replica;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000','61000000-0000-4000-8000-000000000001','authenticated','authenticated','atomic-chia@fixture.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','61000000-0000-4000-8000-000000000002','authenticated','authenticated','atomic-human-a@fixture.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','61000000-0000-4000-8000-000000000003','authenticated','authenticated','atomic-human-b@fixture.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','61000000-0000-4000-8000-000000000004','authenticated','authenticated','atomic-human-c@fixture.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','61000000-0000-4000-8000-000000000005','authenticated','authenticated','atomic-other-ai@fixture.invalid','',now(),'{}','{}',now(),now());
set local session_replication_role = origin;

insert into public.profiles(id,display_name,username) values
 ('61000000-0000-4000-8000-000000000001','Atomic Chia','atomic_chia'),
 ('61000000-0000-4000-8000-000000000002','Atomic Human A','atomic_human_a'),
 ('61000000-0000-4000-8000-000000000003','Atomic Human B','atomic_human_b'),
 ('61000000-0000-4000-8000-000000000004','Atomic Human C','atomic_human_c'),
 ('61000000-0000-4000-8000-000000000005','Atomic Other AI','atomic_other_ai');
update public.profile_kinds set kind='ai_resident' where profile_id in
 ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000005');
insert into public.posts(id,author_id,body) values
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','synthetic chia post'),
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','synthetic second chia post');

-- Oldest source stays discoverable after newer terminal, cooling and leased
-- rows are filtered before LIMIT; delay boundary uses the SQL/JS shared hash.
insert into public.star_letters(id,post_id,author_id,body,created_at)
select ('63000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       '62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',
       'synthetic discovery source '||g, now()-interval '10 minutes'+g*interval '1 second'
from generate_series(1,9) g;
insert into public.chia_star_letter_reply_runs(source_star_letter_id,status,attempts,next_attempt_at,updated_at)
select ('63000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       case when g<=6 then 'failed' when g=7 then 'retryable_failed' else 'processing' end,
       1,case when g=7 then now()+interval '10 minutes' end,
       case when g=8 then now() else now()-interval '20 minutes' end
from generate_series(2,9) g;

do $$
declare v_source uuid:='63000000-0000-4000-8000-000000000001'; v_claim jsonb; v_seconds integer;
begin
  if not exists(select 1 from public.discover_chia_star_letter_reply_candidates(
    '61000000-0000-4000-8000-000000000001',now()-interval '1 day',5,null,null) c where c.source_star_letter_id=v_source) then
    raise exception 'terminal/cooling/owned rows starved eligible discovery source';
  end if;
  v_seconds:=public.chia_dot_reply_delay_seconds(v_source);
  if v_seconds<>186 then raise exception 'SQL delay hash differs from JS getReplyDelaySeconds fixture (expected 186, got %)',v_seconds; end if;
  update public.star_letters set created_at=now()-make_interval(secs=>v_seconds)+interval '1 second' where id=v_source;
  v_claim:=public.claim_chia_star_letter_reply_run(v_source,'61000000-0000-4000-8000-000000000001');
  if v_claim->>'outcome'<>'not_due' then raise exception 'SQL due boundary disagreed with JS delay: %',v_claim; end if;
  update public.star_letters set created_at=now()-make_interval(secs=>v_seconds)-interval '1 second' where id=v_source;
  v_claim:=public.claim_chia_star_letter_reply_run(v_source,'61000000-0000-4000-8000-000000000001');
  if not coalesce((v_claim->>'claimed')::boolean,false) or v_claim->>'generation_invocation_id' is null then
    raise exception 'source at delay boundary was not claimed with invocation id: %',v_claim;
  end if;
end $$;

-- Exhausted person A candidates are filtered before discovery LIMIT, leaving
-- a candidate from person B visible in the same page.
do $$
declare v_i integer; v_source uuid; v_run uuid;
begin
  for v_i in 1..10 loop
    v_source:=('63000000-0000-4000-8000-'||lpad((300+v_i)::text,12,'0'))::uuid;
    v_run:=('65000000-0000-4000-8000-'||lpad((300+v_i)::text,12,'0'))::uuid;
    insert into public.star_letters(id,post_id,author_id,body,created_at)
      values(v_source,'62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','exhausted reservation',now()-interval '20 minutes');
    insert into public.chia_star_letter_reply_runs(id,source_star_letter_id,status,attempts) values(v_run,v_source,'failed',1);
    insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
      values(v_run,1,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','cos-chatgpt',5000);
  end loop;
  for v_i in 70..75 loop
    insert into public.star_letters(id,post_id,author_id,body,created_at)
      values(('63000000-0000-4000-8000-'||lpad(v_i::text,12,'0'))::uuid,'62000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000002','exhausted candidate',now()-interval '5 minutes'+v_i*interval '1 second');
  end loop;
  insert into public.star_letters(id,post_id,author_id,body,created_at)
    values('63000000-0000-4000-8000-000000000080','62000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000003','eligible other person',now()-interval '6 minutes');
  if not exists(select 1 from public.discover_chia_star_letter_reply_candidates(
    '61000000-0000-4000-8000-000000000001',now()-interval '1 day',5,null,null) c
    where c.source_star_letter_id='63000000-0000-4000-8000-000000000080') then
    raise exception 'person-budget-exhausted candidates starved another person before LIMIT';
  end if;
end $$;

-- Parent relationship is checked by each atomic gate, even for rows inserted
-- with constraints/triggers disabled to model legacy or corrupted state.
set local session_replication_role = replica;
insert into public.star_letters(id,post_id,author_id,body,created_at)
values
 ('63000000-0000-4000-8000-000000000020','62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','parent on other post',now()-interval '10 minutes'),
 ('63000000-0000-4000-8000-000000000021','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','cross-post child',now()-interval '10 minutes'),
 ('63000000-0000-4000-8000-000000000022','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','synthetic reply',now()-interval '9 minutes');
update public.star_letters set parent_star_letter_id='63000000-0000-4000-8000-000000000020'
where id='63000000-0000-4000-8000-000000000021';
insert into public.chia_star_letter_reply_runs(id,source_star_letter_id,status,attempts,claim_token,source_updated_at,post_updated_at,budget_day,reserved_cost_microusd,model_key,reply_star_letter_id,processed_at)
select '64000000-0000-4000-8000-000000000021','63000000-0000-4000-8000-000000000021','replied',1,'64000000-0000-4000-8000-000000000021',sl.updated_at,p.updated_at,(now() at time zone 'utc')::date,5000,'cos-chatgpt','63000000-0000-4000-8000-000000000022',now()
from public.star_letters sl join public.posts p on p.id=sl.post_id where sl.id='63000000-0000-4000-8000-000000000021';
insert into public.chia_star_letter_reply_budget_days(budget_day,person_profile_id) values((now() at time zone 'utc')::date,'61000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.chia_star_letter_reply_budget_global(budget_day) values((now() at time zone 'utc')::date) on conflict do nothing;
insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
select id,attempts,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','cos-chatgpt',5000
from public.chia_star_letter_reply_runs where source_star_letter_id='63000000-0000-4000-8000-000000000021';
set local session_replication_role = origin;

do $$
declare v_claim jsonb; v_wake jsonb; v_memory jsonb;
begin
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000001');
  if v_claim->>'outcome'<>'not_direct_conversation' then raise exception 'cross-post parent claim was accepted: %',v_claim; end if;
  update public.chia_star_letter_reply_runs set status='processing',provider_wake_at=null where source_star_letter_id='63000000-0000-4000-8000-000000000021';
  v_wake:=public.authorize_chia_dot_provider_wake('64000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000021');
  if v_wake->>'outcome'<>'not_eligible' then raise exception 'cross-post parent wake was accepted: %',v_wake; end if;
  update public.chia_star_letter_reply_runs set provider_wake_at=now() where source_star_letter_id='63000000-0000-4000-8000-000000000021';
  v_memory:=public.complete_chia_star_letter_reply_run('64000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000001','reply','cross-post reply','64000000-0000-4000-8000-000000000021',(select updated_at from public.star_letters where id='63000000-0000-4000-8000-000000000021'),(select updated_at from public.posts where id='62000000-0000-4000-8000-000000000001'));
  if v_memory->>'outcome' in ('replied','already_replied') or exists(select 1 from public.star_letters where parent_star_letter_id='63000000-0000-4000-8000-000000000021' and author_id='61000000-0000-4000-8000-000000000001') then
    raise exception 'cross-post parent completion created a reply: %',v_memory;
  end if;
  update public.chia_star_letter_reply_runs set status='replied' where source_star_letter_id='63000000-0000-4000-8000-000000000021';
  v_memory:=public.remember_chia_star_letter_reply('64000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000021','63000000-0000-4000-8000-000000000021',(select updated_at from public.star_letters where id='63000000-0000-4000-8000-000000000021'),(select updated_at from public.posts where id='62000000-0000-4000-8000-000000000001'),'topic','cross-post child');
  if v_memory->>'outcome'<>'source_changed_or_invalid' then raise exception 'cross-post parent memory was accepted: %',v_memory; end if;
end $$;

-- Changing a source conversation parent, deleting that parent, or changing
-- the containing post's owner invalidates all memories derived from the post.
insert into public.star_letters(id,post_id,author_id,body,created_at) values
 ('63000000-0000-4000-8000-000000000090','62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','source parent change',now()-interval '10 minutes'),
 ('63000000-0000-4000-8000-000000000091','62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','source deleted parent',now()-interval '10 minutes'),
 ('63000000-0000-4000-8000-000000000092','62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','valid parent one',now()-interval '9 minutes'),
 ('63000000-0000-4000-8000-000000000093','62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','valid parent two',now()-interval '8 minutes'),
 ('63000000-0000-4000-8000-000000000094','62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','post owner change',now()-interval '7 minutes');
insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_star_letter_id,source_updated_at,memory_key,content)
select '61000000-0000-4000-8000-000000000001',sl.author_id,sl.id,sl.updated_at,'fact_'||right(sl.id::text,2),sl.body
from public.star_letters sl where sl.id in ('63000000-0000-4000-8000-000000000090','63000000-0000-4000-8000-000000000094');
update public.star_letters set parent_star_letter_id='63000000-0000-4000-8000-000000000092' where id='63000000-0000-4000-8000-000000000090';
do $$ begin
  if exists(select 1 from public.chia_person_memories where source_star_letter_id='63000000-0000-4000-8000-000000000090') then
    raise exception 'source parent edit did not invalidate derived memory';
  end if;
end $$;
update public.star_letters set parent_star_letter_id='63000000-0000-4000-8000-000000000093' where id='63000000-0000-4000-8000-000000000091';
insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_star_letter_id,source_updated_at,memory_key,content)
select '61000000-0000-4000-8000-000000000001',sl.author_id,sl.id,sl.updated_at,'deleted_parent_fact',sl.body
from public.star_letters sl where sl.id='63000000-0000-4000-8000-000000000091';
update public.star_letters set deleted_at=now() where id='63000000-0000-4000-8000-000000000093';
do $$ begin
  if exists(select 1 from public.chia_person_memories where source_star_letter_id='63000000-0000-4000-8000-000000000091') then
    raise exception 'deleted conversation parent did not invalidate child memory';
  end if;
end $$;
update public.posts set author_id='61000000-0000-4000-8000-000000000002' where id='62000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.chia_person_memories where source_star_letter_id='63000000-0000-4000-8000-000000000094') then
    raise exception 'post owner change did not invalidate derived memory';
  end if;
end $$;

-- A deleted conversation parent is rejected by claim, wake, completion and memory.
set local session_replication_role = replica;
insert into public.star_letters(id,post_id,author_id,body,created_at,parent_star_letter_id,deleted_at)
values
 ('63000000-0000-4000-8000-000000000023','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','deleted parent',now()-interval '12 minutes',null,now()),
 ('63000000-0000-4000-8000-000000000024','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','child under deleted parent',now()-interval '10 minutes','63000000-0000-4000-8000-000000000023',null),
 ('63000000-0000-4000-8000-000000000025','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','reply fixture',now()-interval '9 minutes',null,null);
insert into public.chia_star_letter_reply_runs(id,source_star_letter_id,status,attempts,claim_token,source_updated_at,post_updated_at,budget_day,reserved_cost_microusd,model_key,processed_at)
select '64000000-0000-4000-8000-000000000024','63000000-0000-4000-8000-000000000024','processing',1,'64000000-0000-4000-8000-000000000024',sl.updated_at,p.updated_at,(now() at time zone 'utc')::date,5000,'cos-chatgpt',now()
from public.star_letters sl join public.posts p on p.id=sl.post_id where sl.id='63000000-0000-4000-8000-000000000024';
insert into public.chia_star_letter_reply_budget_days(budget_day,person_profile_id) values((now() at time zone 'utc')::date,'61000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.chia_star_letter_reply_budget_global(budget_day) values((now() at time zone 'utc')::date) on conflict do nothing;
insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
select id,attempts,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','cos-chatgpt',5000
from public.chia_star_letter_reply_runs where source_star_letter_id='63000000-0000-4000-8000-000000000024';
set local session_replication_role = origin;
do $$
declare v_claim jsonb; v_wake jsonb; v_done jsonb; v_memory jsonb;
begin
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000024','61000000-0000-4000-8000-000000000001');
  if v_claim->>'outcome'<>'not_direct_conversation' then raise exception 'deleted-parent child claim was accepted: %',v_claim; end if;
  v_wake:=public.authorize_chia_dot_provider_wake('64000000-0000-4000-8000-000000000024','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000024');
  if v_wake->>'outcome'<>'not_eligible' then raise exception 'deleted-parent child wake was accepted: %',v_wake; end if;
  update public.chia_star_letter_reply_runs set provider_wake_at=now() where id='64000000-0000-4000-8000-000000000024';
  v_done:=public.complete_chia_star_letter_reply_run('64000000-0000-4000-8000-000000000024','61000000-0000-4000-8000-000000000001','reply','deleted-parent reply','64000000-0000-4000-8000-000000000024',(select updated_at from public.star_letters where id='63000000-0000-4000-8000-000000000024'),(select updated_at from public.posts where id='62000000-0000-4000-8000-000000000001'));
  if v_done->>'outcome' in ('replied','already_replied') or exists(select 1 from public.star_letters where parent_star_letter_id='63000000-0000-4000-8000-000000000024' and author_id='61000000-0000-4000-8000-000000000001') then
    raise exception 'deleted-parent completion created a reply: %',v_done;
  end if;
  update public.chia_star_letter_reply_runs set status='replied',reply_star_letter_id='63000000-0000-4000-8000-000000000025' where id='64000000-0000-4000-8000-000000000024';
  v_memory:=public.remember_chia_star_letter_reply('64000000-0000-4000-8000-000000000024','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000024','63000000-0000-4000-8000-000000000024',(select updated_at from public.star_letters where id='63000000-0000-4000-8000-000000000024'),(select updated_at from public.posts where id='62000000-0000-4000-8000-000000000001'),'topic','child under deleted parent');
  if v_memory->>'outcome'<>'source_changed_or_invalid' then raise exception 'deleted-parent memory was accepted: %',v_memory; end if;
end $$;

-- Private posts and post/source revisions invalidate both generation and memory.
insert into public.star_letters(id,post_id,author_id,body,created_at)
values ('63000000-0000-4000-8000-000000000030','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','A quoted fact',now()-interval '10 minutes');
do $$
declare v_claim jsonb; v_complete jsonb; v_memory jsonb; v_run uuid; v_token uuid; v_source_rev timestamptz; v_post_rev timestamptz;
begin
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000030','61000000-0000-4000-8000-000000000001');
  if not coalesce((v_claim->>'claimed')::boolean,false) then raise exception 'private-post claim fixture failed: %',v_claim; end if;
  v_run:=(v_claim->>'run_id')::uuid; v_token:=(v_claim->>'claim_token')::uuid;
  v_source_rev:=(v_claim->>'source_updated_at')::timestamptz; v_post_rev:=(v_claim->>'post_updated_at')::timestamptz;
  -- Model authorization succeeded before these synthetic source/post edits.
  update public.chia_star_letter_reply_runs set provider_wake_at=now() where id=v_run;
  update public.posts set visibility='private' where id='62000000-0000-4000-8000-000000000001';
  v_complete:=public.complete_chia_star_letter_reply_run(v_run,'61000000-0000-4000-8000-000000000001','reply','stale',v_token,v_source_rev,v_post_rev);
  if v_complete->>'outcome'<>'stale_source' then raise exception 'private post completion was accepted: %',v_complete; end if;
  update public.posts set visibility='public' where id='62000000-0000-4000-8000-000000000001';
  update public.posts set body='Post edited after claim' where id='62000000-0000-4000-8000-000000000001';
  -- A later update to an unrelated column MUST NOT roll the revision back.
  update public.posts set updated_at=updated_at where id='62000000-0000-4000-8000-000000000001';
  v_complete:=public.complete_chia_star_letter_reply_run(v_run,'61000000-0000-4000-8000-000000000001','reply','stale',v_token,v_source_rev,v_post_rev);
  if v_complete->>'outcome'<>'stale_source' then raise exception 'edited post completion was accepted: %',v_complete; end if;
  update public.star_letters set body='Changed after claim' where id='63000000-0000-4000-8000-000000000030';
  update public.star_letters set updated_at=updated_at where id='63000000-0000-4000-8000-000000000030';
  v_complete:=public.complete_chia_star_letter_reply_run(v_run,'61000000-0000-4000-8000-000000000001','reply','stale',v_token,v_source_rev,v_post_rev);
  if v_complete->>'outcome'<>'stale_source' then raise exception 'edited source completion was accepted: %',v_complete; end if;
  -- A replied synthetic receipt whose source/post revision changed cannot add memory.
  update public.chia_star_letter_reply_runs set status='replied',reply_star_letter_id='63000000-0000-4000-8000-000000000022' where id=v_run;
  v_memory:=public.remember_chia_star_letter_reply(v_run,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003',v_token,'63000000-0000-4000-8000-000000000030',v_source_rev,v_post_rev,'topic','A quoted fact');
  if v_memory->>'outcome'<>'source_changed_or_invalid' then raise exception 'edited source memory was accepted: %',v_memory; end if;
end $$;

-- Wake rechecks person kind and blocks and counts failed/skipped reservations.
insert into public.star_letters(id,post_id,author_id,body,created_at)
values ('63000000-0000-4000-8000-000000000040','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','Human source',now()-interval '10 minutes');
do $$
declare v_claim jsonb; v_wake jsonb;
begin
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000040','61000000-0000-4000-8000-000000000001');
  if not coalesce((v_claim->>'claimed')::boolean,false) then raise exception 'person-kind fixture claim failed: %',v_claim; end if;
  update public.profile_kinds set kind='ai_resident' where profile_id='61000000-0000-4000-8000-000000000004';
  v_wake:=public.authorize_chia_dot_provider_wake((v_claim->>'run_id')::uuid,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004',(v_claim->>'claim_token')::uuid);
  if v_wake->>'outcome'<>'not_eligible' then raise exception 'human-to-ai wake was accepted: %',v_wake; end if;
  update public.profile_kinds set kind='human' where profile_id='61000000-0000-4000-8000-000000000004';
  insert into public.profile_blocks(blocker_id,blocked_id) values('61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000001');
  v_wake:=public.authorize_chia_dot_provider_wake((v_claim->>'run_id')::uuid,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004',(v_claim->>'claim_token')::uuid);
  if v_wake->>'outcome'<>'not_eligible' then raise exception 'new block did not prevent wake: %',v_wake; end if;
  delete from public.profile_blocks where blocker_id='61000000-0000-4000-8000-000000000004' and blocked_id='61000000-0000-4000-8000-000000000001';
end $$;

-- A wake is one-shot, but an authorized prior-day reservation survives UTC midnight.
insert into public.star_letters(id,post_id,author_id,body,created_at)
values ('63000000-0000-4000-8000-000000000050','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','prior-day source',now()-interval '10 minutes');
do $$
declare v_claim jsonb; v_wake jsonb; v_again jsonb; v_count integer; v_run uuid;
begin
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000050','61000000-0000-4000-8000-000000000001');
  if not coalesce((v_claim->>'claimed')::boolean,false) then raise exception 'midnight fixture claim failed: %',v_claim; end if;
  v_run:=(v_claim->>'run_id')::uuid;
  update public.chia_star_letter_reply_runs set budget_day=(now() at time zone 'utc')::date-1 where id=v_run;
  update public.chia_star_letter_reply_budget_reservations set created_at=now()-interval '2 hours' where run_id=v_run;
  v_wake:=public.authorize_chia_dot_provider_wake(v_run,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004',(v_claim->>'claim_token')::uuid);
  if v_wake->>'outcome'<>'authorized' or v_wake->>'generation_invocation_id' is distinct from v_claim->>'generation_invocation_id'
    then raise exception 'prior-UTC-day reservation did not authorize stable invocation: %',v_wake; end if;
  select count(*) into v_count from public.chia_star_letter_reply_budget_reservations where run_id=v_run;
  v_again:=public.authorize_chia_dot_provider_wake(v_run,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004',(v_claim->>'claim_token')::uuid);
  if v_again->>'outcome'<>'already_woken' or v_again->>'generation_invocation_id' is distinct from v_claim->>'generation_invocation_id'
    then raise exception 'duplicate wake did not return reconciliation outcome: %',v_again; end if;
  if (select count(*) from public.chia_star_letter_reply_budget_reservations where run_id=v_run)<>v_count
    then raise exception 'duplicate wake created another reservation'; end if;
end $$;

-- Failed/skipped attempts still count toward per-person 10 and global 50 caps.
do $$
declare v_i integer; v_source uuid; v_run uuid; v_claim jsonb;
begin
  for v_i in 1..10 loop
    v_source:=('63000000-0000-4000-8000-'||lpad((100+v_i)::text,12,'0'))::uuid;
    v_run:=('65000000-0000-4000-8000-'||lpad((100+v_i)::text,12,'0'))::uuid;
    insert into public.star_letters(id,post_id,author_id,body,created_at) values(v_source,'62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','budget fixture',now()-interval '10 minutes');
    insert into public.chia_star_letter_reply_runs(id,source_star_letter_id,status,attempts) values(v_run,v_source,case when v_i%2=0 then 'failed' else 'skipped' end,1);
    insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
      values(v_run,1,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','cos-chatgpt',5000);
  end loop;
  insert into public.star_letters(id,post_id,author_id,body,created_at) values('63000000-0000-4000-8000-000000000060','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','cap source',now()-interval '10 minutes');
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000060','61000000-0000-4000-8000-000000000001');
  if v_claim->>'outcome'<>'budget_limit' then raise exception 'failed/skipped reservations did not count toward per-person cap: %',v_claim; end if;
  delete from public.chia_star_letter_reply_budget_reservations where person_profile_id='61000000-0000-4000-8000-000000000003';
  delete from public.chia_star_letter_reply_runs where source_star_letter_id in
    (select id from public.star_letters where author_id='61000000-0000-4000-8000-000000000003' and id<>'63000000-0000-4000-8000-000000000060');
  for v_i in 1..50 loop
    v_source:=('63000000-0000-4000-8000-'||lpad((200+v_i)::text,12,'0'))::uuid;
    v_run:=('65000000-0000-4000-8000-'||lpad((200+v_i)::text,12,'0'))::uuid;
    insert into public.star_letters(id,post_id,author_id,body,created_at) values(v_source,'62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','global budget fixture',now()-interval '10 minutes');
    insert into public.chia_star_letter_reply_runs(id,source_star_letter_id,status,attempts) values(v_run,v_source,case when v_i%2=0 then 'failed' else 'skipped' end,1);
    insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
      values(v_run,1,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','cos-chatgpt',5000);
  end loop;
  insert into public.star_letters(id,post_id,author_id,body,created_at) values('63000000-0000-4000-8000-000000000061','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','global cap source',now()-interval '10 minutes');
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000061','61000000-0000-4000-8000-000000000001');
  if v_claim->>'outcome'<>'budget_limit' then raise exception 'failed/skipped reservations did not count toward global cap: %',v_claim; end if;
end $$;

-- Rolling global and person cooldowns include the previous UTC day, without
-- authorizing a wake or consuming its invocation reservation.
insert into public.star_letters(id,post_id,author_id,body,created_at)
values('63000000-0000-4000-8000-000000000096','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','throttle fixture',now()-interval '10 minutes');
insert into public.chia_star_letter_reply_runs(id,source_star_letter_id,status,attempts,claim_token,source_updated_at,post_updated_at,budget_day,reserved_cost_microusd,model_key,generation_invocation_id)
select '65000000-0000-4000-8000-000000000096',sl.id,'processing',1,'64000000-0000-4000-8000-000000000096',sl.updated_at,p.updated_at,(now() at time zone 'utc')::date-1,5000,'cos-chatgpt','66000000-0000-4000-8000-000000000096'
from public.star_letters sl join public.posts p on p.id=sl.post_id where sl.id='63000000-0000-4000-8000-000000000096';
insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd,created_at)
values('65000000-0000-4000-8000-000000000096',1,'61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','cos-chatgpt',5000,now()-interval '2 hours');
do $$
declare v_wake jsonb;
begin
  insert into public.chia_star_letter_reply_budget_global(budget_day,last_wake_at)
    values((now() at time zone 'utc')::date-1,now()-interval '30 seconds')
    on conflict(budget_day) do update set last_wake_at=excluded.last_wake_at;
  insert into public.chia_star_letter_reply_budget_days(budget_day,person_profile_id,last_wake_at)
    values((now() at time zone 'utc')::date-1,'61000000-0000-4000-8000-000000000004',now()-interval '90 seconds')
    on conflict(budget_day,person_profile_id) do update set last_wake_at=excluded.last_wake_at;
  v_wake:=public.authorize_chia_dot_provider_wake('65000000-0000-4000-8000-000000000096','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','64000000-0000-4000-8000-000000000096');
  if v_wake->>'outcome'<>'provider_throttled' then raise exception 'previous-day global throttle was ignored: %',v_wake; end if;
  update public.chia_star_letter_reply_budget_global set last_wake_at=now()-interval '5 minutes';
  v_wake:=public.authorize_chia_dot_provider_wake('65000000-0000-4000-8000-000000000096','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','64000000-0000-4000-8000-000000000096');
  if v_wake->>'outcome'<>'provider_throttled' then raise exception 'previous-day person throttle was ignored: %',v_wake; end if;
  if (select provider_wake_at from public.chia_star_letter_reply_runs where id='65000000-0000-4000-8000-000000000096') is not null then
    raise exception 'throttled provider wake was marked authorized';
  end if;
end $$;

-- Accounting reservations survive source/run and profile deletion. Retained
-- UUIDs are metadata only; they keep deletion from refunding the rolling cap.
set local session_replication_role = replica;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000','61000000-0000-4000-8000-000000000006','authenticated','authenticated','atomic-ledger-a@fixture.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','61000000-0000-4000-8000-000000000007','authenticated','authenticated','atomic-ledger-b@fixture.invalid','',now(),'{}','{}',now(),now());
set local session_replication_role = origin;
insert into public.profiles(id,display_name,username) values
 ('61000000-0000-4000-8000-000000000006','Ledger Human','atomic_ledger_human'),
 ('61000000-0000-4000-8000-000000000007','Ledger Chia','atomic_ledger_chia');
insert into public.profile_kinds(profile_id,kind) values('61000000-0000-4000-8000-000000000007','ai_resident') on conflict(profile_id) do update set kind=excluded.kind;
insert into public.star_letters(id,post_id,author_id,body,created_at)
values('63000000-0000-4000-8000-000000000099','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','ledger retention source',now()-interval '10 minutes');
insert into public.chia_star_letter_reply_runs(id,source_star_letter_id,status,attempts,claim_token,source_updated_at,post_updated_at,budget_day,reserved_cost_microusd,model_key)
select '65000000-0000-4000-8000-000000000099',sl.id,'failed',1,'64000000-0000-4000-8000-000000000099',sl.updated_at,p.updated_at,(now() at time zone 'utc')::date,5000,'cos-chatgpt'
from public.star_letters sl join public.posts p on p.id=sl.post_id where sl.id='63000000-0000-4000-8000-000000000099';
insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
values('65000000-0000-4000-8000-000000000099',1,'61000000-0000-4000-8000-000000000007','61000000-0000-4000-8000-000000000006','cos-chatgpt',5000);
delete from public.star_letters where id='63000000-0000-4000-8000-000000000099';
delete from auth.users where id in ('61000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000007');
do $$ begin
  if not exists(select 1 from public.chia_star_letter_reply_budget_reservations where run_id='65000000-0000-4000-8000-000000000099' and person_profile_id='61000000-0000-4000-8000-000000000006' and chia_profile_id='61000000-0000-4000-8000-000000000007') then
    raise exception 'source/run or profile deletion erased charged reservation metadata';
  end if;
end $$;
delete from public.chia_star_letter_reply_budget_reservations;
insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
select ('65000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,1,
       '61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','cos-chatgpt',5000
from generate_series(1,50) g;
insert into public.star_letters(id,post_id,author_id,body,created_at)
values('63000000-0000-4000-8000-000000000098','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','global cap after deletion',now()-interval '10 minutes');
do $$ declare v_claim jsonb;
begin
  v_claim:=public.claim_chia_star_letter_reply_run('63000000-0000-4000-8000-000000000098','61000000-0000-4000-8000-000000000001');
  if v_claim->>'outcome'<>'budget_limit' then raise exception 'deletion/refund bypassed global reservation cap: %',v_claim; end if;
end $$;

-- Cooldown sees the previous UTC day's row; assert all server RPC signatures
-- have exact types and every mutation/legacy entrypoint remains server-only.
do $$
declare v_sig text; v_bad text[]:=array[]::text[]; v_item text;
begin
  update public.chia_star_letter_reply_budget_global set last_wake_at=now()-interval '30 seconds'
    where budget_day=(now() at time zone 'utc')::date;
  insert into public.chia_star_letter_reply_budget_global(budget_day,last_wake_at) values((now() at time zone 'utc')::date-1,now()-interval '30 seconds') on conflict(budget_day) do update set last_wake_at=excluded.last_wake_at;
  insert into public.chia_star_letter_reply_budget_days(budget_day,person_profile_id,last_wake_at)
    values((now() at time zone 'utc')::date-1,'61000000-0000-4000-8000-000000000004',now()-interval '90 seconds')
    on conflict(budget_day,person_profile_id) do update set last_wake_at=excluded.last_wake_at;
  foreach v_item in array array[
    'claim_chia_star_letter_reply_run(uuid,uuid)',
    'complete_chia_star_letter_reply_run(uuid,uuid,text,text)',
    'complete_chia_star_letter_reply_run(uuid,uuid,text,text,uuid)',
    'complete_chia_star_letter_reply_run(uuid,uuid,text,text,uuid,timestamp with time zone,timestamp with time zone)',
    'fail_chia_star_letter_reply_run(uuid,text)',
    'fail_chia_star_letter_reply_run(uuid,text,uuid)',
    'get_chia_star_letter_reply_run_status(uuid,uuid)',
    'discover_chia_star_letter_reply_candidates(uuid,timestamp with time zone,integer,timestamp with time zone,uuid)',
    'authorize_chia_dot_provider_wake(uuid,uuid,uuid,uuid)',
    'remember_chia_star_letter_reply(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,smallint)',
    'chia_dot_run_source_fresh(uuid)',
    'chia_dot_reply_delay_seconds(uuid)',
    'claim_chia_star_letter_reply_run_legacy(uuid,uuid)',
    'complete_chia_star_letter_reply_run_legacy(uuid,uuid,text,text)',
    'fail_chia_star_letter_reply_run_legacy(uuid,text)',
    'guard_chia_person_memory()',
    'invalidate_chia_memories_for_star_letter()',
    'invalidate_chia_memories_for_post()'
  ] loop
    v_sig:=to_regprocedure('public.'||v_item)::text;
    if v_sig is null or has_function_privilege('anon','public.'||v_item,'execute')
      or has_function_privilege('authenticated','public.'||v_item,'execute') then v_bad:=array_append(v_bad,v_item); end if;
  end loop;
  if cardinality(v_bad)>0 then raise exception 'RPC type/ACL audit failed: %',v_bad; end if;
  if (select proargnames[1:7] from pg_proc where oid='public.complete_chia_star_letter_reply_run(uuid,uuid,text,text,uuid,timestamptz,timestamptz)'::regprocedure)
    is distinct from array['p_run_id','p_chia_profile_id','p_decision','p_body','p_claim_token','p_source_updated_at','p_post_updated_at']::text[] then
    raise exception 'complete RPC argument names/types differ from endpoint contract';
  end if;
end $$;

rollback;

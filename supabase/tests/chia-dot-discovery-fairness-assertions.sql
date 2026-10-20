-- LOCAL ONLY. Uses synthetic fixtures and rolls them back.
-- Proves oldest-first discovery drains a due backlog despite continuous arrivals,
-- while filtering retry/terminal rows before LIMIT and enforcing the 48-hour age cap.
begin;

set local session_replication_role = replica;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('71000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       'authenticated','authenticated','fairness-'||g||'@fixture.invalid','',now(),'{}','{}',now(),now()
from generate_series(1,3) g;
set local session_replication_role = origin;
insert into public.profiles(id,display_name,username) values
 ('71000000-0000-4000-8000-000000000001','Fairness Chia','fairness_chia'),
 ('71000000-0000-4000-8000-000000000002','Fairness Human A','fairness_human_a'),
 ('71000000-0000-4000-8000-000000000003','Fairness Human B','fairness_human_b');
update public.profile_kinds set kind='ai_resident' where profile_id='71000000-0000-4000-8000-000000000001';
insert into public.posts(id,author_id,body) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','synthetic fairness post');

insert into public.star_letters(id,post_id,author_id,body,created_at)
select ('63000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       '72000000-0000-4000-8000-000000000001',
       '71000000-0000-4000-8000-000000000002',
       'fairness backlog '||g, now()-interval '30 minutes'+g*interval '1 second'
from generate_series(901,906) g;

do $$
declare
  v_oldest uuid := '63000000-0000-4000-8000-000000000901';
  v_next_old uuid := '63000000-0000-4000-8000-000000000906';
  v_stale uuid := '63000000-0000-4000-8000-000000000949';
  v_source uuid;
begin
  if not exists (
    select 1 from public.discover_chia_star_letter_reply_candidates(
      '71000000-0000-4000-8000-000000000001',now()-interval '7 days',5,null,null
    ) c where c.source_star_letter_id=v_oldest
  ) then
    raise exception 'oldest eligible item was omitted from first bounded page';
  end if;

  -- Simulate a worker draining the first page while new candidates keep arriving.
  insert into public.chia_star_letter_reply_runs(source_star_letter_id,status,attempts)
  select ('63000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'failed',1
  from generate_series(901,905) g;
  insert into public.star_letters(id,post_id,author_id,body,created_at)
  select ('63000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
         '72000000-0000-4000-8000-000000000001',
         '71000000-0000-4000-8000-000000000003',
         'continuous newer arrival '||g, now()-interval '10 minutes'+(g-930)*interval '1 second'
  from generate_series(930,937) g;

  if (select count(*) from public.discover_chia_star_letter_reply_candidates(
    '71000000-0000-4000-8000-000000000001',now()-interval '7 days',100,null,null
  ) c where c.source_star_letter_id between '63000000-0000-4000-8000-000000000930'::uuid
    and '63000000-0000-4000-8000-000000000937'::uuid) <> 8 then
    raise exception 'continuous-arrival fixtures were not all due and eligible';
  end if;

  select c.source_star_letter_id into v_source
  from public.discover_chia_star_letter_reply_candidates(
    '71000000-0000-4000-8000-000000000001',now()-interval '7 days',5,null,null
  ) c where c.source_star_letter_id=v_next_old;
  if v_source is null then
    raise exception 'next oldest due item starved by continuous newer arrivals';
  end if;

  insert into public.star_letters(id,post_id,author_id,body,created_at)
  values(v_stale,'72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003','outside 48-hour window',now()-interval '49 hours');
  if exists (
    select 1 from public.discover_chia_star_letter_reply_candidates(
      '71000000-0000-4000-8000-000000000001',now()-interval '7 days',100,null,null
    ) c where c.source_star_letter_id=v_stale
  ) then
    raise exception 'source older than 48 hours remained discoverable';
  end if;
end $$;

rollback;

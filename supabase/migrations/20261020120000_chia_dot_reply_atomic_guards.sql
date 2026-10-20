begin;

alter table public.chia_star_letter_reply_runs
  add column if not exists source_updated_at timestamptz,
  add column if not exists post_updated_at timestamptz,
  add column if not exists source_parent_id uuid,
  add column if not exists source_parent_updated_at timestamptz,
  add column if not exists budget_day date,
  add column if not exists reserved_cost_microusd bigint not null default 0,
  add column if not exists model_key text,
  add column if not exists provider_wake_at timestamptz,
  add column if not exists generation_invocation_id uuid;

create table if not exists public.chia_star_letter_reply_budget_days (
  budget_day date not null,
  person_profile_id uuid not null references public.profiles(id) on delete cascade,
  started_count integer not null default 0 check (started_count >= 0),
  reserved_cost_microusd bigint not null default 0 check (reserved_cost_microusd >= 0),
  last_claimed_at timestamptz,
  last_wake_at timestamptz,
  primary key (budget_day, person_profile_id)
);
create table if not exists public.chia_star_letter_reply_budget_global (
  budget_day date primary key,
  started_count integer not null default 0 check (started_count >= 0),
  reserved_cost_microusd bigint not null default 0 check (reserved_cost_microusd >= 0),
  last_claimed_at timestamptz,
  last_wake_at timestamptz
);
create table if not exists public.chia_star_letter_reply_budget_reservations (
  -- These UUIDs are immutable accounting identifiers, deliberately not FKs:
  -- deleting a source/run/profile must not erase a model-cost reservation.
  run_id uuid not null,
  attempt integer not null check (attempt between 1 and 3),
  chia_profile_id uuid not null,
  person_profile_id uuid not null,
  model_key text not null,
  reserved_cost_microusd bigint not null check (reserved_cost_microusd > 0),
  created_at timestamptz not null default now(),
  primary key (run_id,attempt)
);
-- Make replay safe when this migration is applied to a database where an
-- earlier draft created cascading constraints on the accounting ledger.
alter table public.chia_star_letter_reply_budget_reservations
  drop constraint if exists chia_star_letter_reply_budget_reservations_run_id_fkey,
  drop constraint if exists chia_star_letter_reply_budget_reservations_chia_profile_id_fkey,
  drop constraint if exists chia_star_letter_reply_budget_reservations_person_profile_id_fkey;
create table if not exists public.chia_star_letter_reply_memory_receipts (
  run_id uuid not null references public.chia_star_letter_reply_runs(id) on delete cascade,
  memory_key text not null,
  outcome text not null check (outcome in ('remembered','already_remembered')),
  memory_id uuid references public.chia_person_memories(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (run_id,memory_key)
);
create index if not exists chia_reply_reservations_recent_idx
  on public.chia_star_letter_reply_budget_reservations(created_at);
create index if not exists chia_reply_reservations_person_recent_idx
  on public.chia_star_letter_reply_budget_reservations(person_profile_id,created_at);
alter table public.chia_star_letter_reply_budget_days enable row level security;
alter table public.chia_star_letter_reply_budget_global enable row level security;
alter table public.chia_star_letter_reply_budget_reservations enable row level security;
alter table public.chia_star_letter_reply_memory_receipts enable row level security;
revoke all on public.chia_star_letter_reply_budget_days, public.chia_star_letter_reply_budget_global from public, anon, authenticated;
revoke all on public.chia_star_letter_reply_budget_reservations from public, anon, authenticated, service_role;
revoke all on public.chia_star_letter_reply_memory_receipts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.chia_star_letter_reply_budget_days, public.chia_star_letter_reply_budget_global to service_role;

-- Partition tombstones survive an empty memory set. Only trigger-owned code
-- can advance them; neither the owner nor service_role can forge/reset revision.
-- No FKs: deleting/recreating a profile must not reset the partition to zero.
create table if not exists public.chia_person_memory_partitions (
  chia_profile_id uuid not null,
  person_profile_id uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  primary key (chia_profile_id, person_profile_id)
);
alter table public.chia_person_memory_partitions enable row level security;
revoke all on public.chia_person_memory_partitions from public,anon,authenticated,service_role;
grant select on public.chia_person_memory_partitions to service_role;
alter table public.chia_star_letter_reply_runs
  add column if not exists memory_chia_profile_id uuid,
  add column if not exists memory_person_profile_id uuid,
  add column if not exists memory_revision bigint;

create or replace function public.advance_chia_person_memory_revision()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_partition record;
begin
  if tg_op='TRUNCATE' then
    -- Administrative cleanup is fenced too. Ordinary roles have no TRUNCATE.
    for v_partition in select chia_profile_id,person_profile_id from public.chia_person_memory_partitions
      order by chia_profile_id,person_profile_id loop
      update public.chia_person_memory_partitions set revision=revision+1
        where chia_profile_id=v_partition.chia_profile_id and person_profile_id=v_partition.person_profile_id;
    end loop;
  else
    -- Transition tables group bulk cleanup/invalidation by partition, and a
    -- consistent UUID order prevents opposite executor row orders deadlocking.
    for v_partition in select distinct chia_profile_id,person_profile_id from changed_memories
      order by chia_profile_id,person_profile_id loop
      insert into public.chia_person_memory_partitions(chia_profile_id,person_profile_id,revision)
        values(v_partition.chia_profile_id,v_partition.person_profile_id,1)
        on conflict(chia_profile_id,person_profile_id) do update
          set revision=public.chia_person_memory_partitions.revision+1;
    end loop;
  end if;
  return null;
end;
$function$;
drop trigger if exists advance_chia_person_memory_revision_trigger on public.chia_person_memories;
drop trigger if exists insert_chia_person_memory_revision_trigger on public.chia_person_memories;
create trigger insert_chia_person_memory_revision_trigger after insert on public.chia_person_memories
  referencing new table as changed_memories for each statement execute function public.advance_chia_person_memory_revision();
drop trigger if exists update_chia_person_memory_revision_trigger on public.chia_person_memories;
create trigger update_chia_person_memory_revision_trigger after update on public.chia_person_memories
  referencing new table as changed_memories for each statement execute function public.advance_chia_person_memory_revision();
drop trigger if exists delete_chia_person_memory_revision_trigger on public.chia_person_memories;
create trigger delete_chia_person_memory_revision_trigger after delete on public.chia_person_memories
  referencing old table as changed_memories for each statement execute function public.advance_chia_person_memory_revision();
drop trigger if exists truncate_chia_person_memory_revision_trigger on public.chia_person_memories;
create trigger truncate_chia_person_memory_revision_trigger after truncate on public.chia_person_memories
  for each statement execute function public.advance_chia_person_memory_revision();
-- Seed pre-migration rows without resetting an existing revision on replay.
insert into public.chia_person_memory_partitions(chia_profile_id,person_profile_id,revision)
  select distinct chia_profile_id,person_profile_id,1 from public.chia_person_memories
  on conflict do nothing;

-- One MVCC statement: never pair pre-edit facts with a post-edit revision.
-- A string revision avoids JSON/JavaScript bigint precision loss.
create or replace function public.snapshot_chia_person_memory(p_chia_profile_id uuid,p_person_profile_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select jsonb_build_object('revision',coalesce((select revision from public.chia_person_memory_partitions
    where chia_profile_id=p_chia_profile_id and person_profile_id=p_person_profile_id),0)::text,
    'memories',coalesce((select jsonb_agg(to_jsonb(m) order by m.importance desc,m.updated_at desc,m.memory_key) from (
      select memory_key,content,importance,updated_at from public.chia_person_memories
      where chia_profile_id=p_chia_profile_id and person_profile_id=p_person_profile_id
      order by importance desc,updated_at desc,memory_key limit 12
    ) m),'[]'::jsonb));
$function$;

-- Lock order for the publication path: run -> source/post/parent -> partition.
-- The partition is LAST: publication never locks a memory row. Owner changes,
-- remember, FK cascades and invalidation lock memory rows before the partition;
-- taking the partition before those rows would deadlock with an owner DELETE.
-- Keep this distinct from source freshness: remember must not hold the partition
-- before inserting a memory (which may conflict with an owner-held memory row).
create or replace function public.chia_dot_run_memory_fresh(p_run_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype; v_revision bigint;
begin
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id;
  if v_run.memory_revision is null or v_run.memory_chia_profile_id is null or v_run.memory_person_profile_id is null then return false; end if;
  -- Reply/notification INSERTs check these profile FKs. Acquire their locks
  -- before the partition, since memory INSERT's bound guard locks the person
  -- profile before incrementing revision. Otherwise publication could wait on
  -- that guard's profile lock while the guard waits on our partition lock.
  perform 1 from public.profiles where id in (v_run.memory_chia_profile_id,v_run.memory_person_profile_id)
    order by id for key share;
  select revision into v_revision from public.chia_person_memory_partitions
    where chia_profile_id=v_run.memory_chia_profile_id and person_profile_id=v_run.memory_person_profile_id for share;
  return found and v_revision=v_run.memory_revision;
end;
$function$;
revoke all on function public.advance_chia_person_memory_revision(),
  public.snapshot_chia_person_memory(uuid,uuid),public.chia_dot_run_memory_fresh(uuid) from public,anon,authenticated,service_role;
grant execute on function public.snapshot_chia_person_memory(uuid,uuid),public.chia_dot_run_memory_fresh(uuid) to service_role;

-- A moved source or edited/deleted direct parent is no longer the observed
-- conversation. Extend the existing triggers rather than creating parallel ones.
create or replace function public.invalidate_chia_memories_for_star_letter()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if old.deleted_at is distinct from new.deleted_at or old.body is distinct from new.body
    or old.author_id is distinct from new.author_id or old.post_id is distinct from new.post_id
    or old.parent_star_letter_id is distinct from new.parent_star_letter_id then
    delete from public.chia_person_memories m where m.source_star_letter_id=new.id
      or m.source_star_letter_id in (select sl.id from public.star_letters sl where sl.parent_star_letter_id=new.id);
  end if;
  return new;
end;
$function$;
drop trigger if exists invalidate_chia_memories_for_star_letter_trigger on public.star_letters;
create trigger invalidate_chia_memories_for_star_letter_trigger
after update of deleted_at,body,author_id,post_id,parent_star_letter_id on public.star_letters
for each row execute function public.invalidate_chia_memories_for_star_letter();

create or replace function public.invalidate_chia_memories_for_post()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if old.body is distinct from new.body or old.deleted_at is distinct from new.deleted_at
    or old.visibility is distinct from new.visibility or old.author_id is distinct from new.author_id then
    delete from public.chia_person_memories m using public.star_letters sl
      where m.source_star_letter_id=sl.id and sl.post_id=new.id;
  end if;
  return new;
end;
$function$;
drop trigger if exists invalidate_chia_memories_for_post_trigger on public.posts;
create trigger invalidate_chia_memories_for_post_trigger
after update of body,deleted_at,visibility,author_id on public.posts
for each row execute function public.invalidate_chia_memories_for_post();

create or replace function public.chia_dot_reply_delay_seconds(p_source_id uuid)
returns integer language plpgsql immutable set search_path = ''
as $function$
declare v_hash numeric:=2166136261; v_bytes bytea:=convert_to(lower(p_source_id::text),'UTF8'); v_i integer;
begin
  for v_i in 0..octet_length(v_bytes)-1 loop
    v_hash:=mod(((v_hash::bigint # get_byte(v_bytes,v_i))::numeric*16777619),4294967296);
  end loop;
  return 120+mod(v_hash::bigint,181)::integer;
end;
$function$;

create or replace function public.discover_chia_star_letter_reply_candidates(
  p_chia_profile_id uuid, p_since timestamptz, p_limit integer default 50,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns table(source_star_letter_id uuid, source_updated_at timestamptz, post_updated_at timestamptz, created_at timestamptz)
language sql security definer set search_path = ''
as $function$
  select sl.id, sl.updated_at, p.updated_at, sl.created_at
  from public.star_letters sl join public.posts p on p.id=sl.post_id
  where p.author_id=p_chia_profile_id and p.visibility='public' and p.deleted_at is null
    and sl.deleted_at is null and sl.author_id<>p_chia_profile_id
    and exists(select 1 from public.profile_kinds pk where pk.profile_id=sl.author_id and pk.kind='human')
    and (sl.parent_star_letter_id is null or exists(
      select 1 from public.star_letters parent where parent.id=sl.parent_star_letter_id
        and parent.post_id=sl.post_id and parent.deleted_at is null and parent.author_id=p_chia_profile_id
    ))
    and not exists(select 1 from public.profile_blocks b where
      (b.blocker_id=sl.author_id and b.blocked_id=p_chia_profile_id)
      or (b.blocker_id=p_chia_profile_id and b.blocked_id=sl.author_id))
    and sl.created_at>=greatest(p_since,now()-interval '48 hours') and sl.created_at<=now()-make_interval(secs=>public.chia_dot_reply_delay_seconds(sl.id))
    and (p_cursor_created_at is null or (sl.created_at,sl.id)>(p_cursor_created_at,p_cursor_id))
    and not exists (
      select 1 from public.chia_star_letter_reply_runs r
      where r.source_star_letter_id=sl.id and (
        r.status in ('replied','skipped','failed')
        or (r.status='retryable_failed' and coalesce(r.next_attempt_at,'-infinity'::timestamptz)>now())
        or (r.status='processing' and (r.provider_wake_at is not null or r.attempts>=3 or r.updated_at>=now()-interval '15 minutes'))
      )
    )
    and not exists (
      select 1 from public.star_letters reply
      where reply.parent_star_letter_id=sl.id and reply.author_id=p_chia_profile_id and reply.deleted_at is null
    )
    -- A budget-exhausted person's backlog must not consume the whole page.
    and (select count(*) from public.chia_star_letter_reply_budget_reservations br
      where br.created_at>=now()-interval '24 hours' and br.person_profile_id=sl.author_id)
      + (select count(*) from public.chia_star_letter_reply_runs r join public.star_letters s on s.id=r.source_star_letter_id
        where r.status='replied' and r.budget_day is null and r.processed_at>=now()-interval '24 hours' and s.author_id=sl.author_id)<10
    and (select coalesce(sum(br.reserved_cost_microusd),0) from public.chia_star_letter_reply_budget_reservations br
      where br.created_at>=now()-interval '24 hours' and br.person_profile_id=sl.author_id)
      + (select count(*)*5000 from public.chia_star_letter_reply_runs r join public.star_letters s on s.id=r.source_star_letter_id
        where r.status='replied' and r.budget_day is null and r.processed_at>=now()-interval '24 hours' and s.author_id=sl.author_id)+5000<=50000
    and (select count(*) from public.chia_star_letter_reply_budget_reservations br where br.created_at>=now()-interval '24 hours')
      + (select count(*) from public.chia_star_letter_reply_runs r where r.status='replied' and r.budget_day is null and r.processed_at>=now()-interval '24 hours')<50
    and (select coalesce(sum(br.reserved_cost_microusd),0) from public.chia_star_letter_reply_budget_reservations br where br.created_at>=now()-interval '24 hours')
      + (select count(*)*5000 from public.chia_star_letter_reply_runs r where r.status='replied' and r.budget_day is null and r.processed_at>=now()-interval '24 hours')+5000<=250000
  -- Drain the oldest due work first so an ongoing stream of new replies cannot
  -- permanently push an eligible source behind the page limit.
  order by sl.created_at,sl.id
  limit least(greatest(coalesce(p_limit,50),1),100);
$function$;
revoke all on function public.discover_chia_star_letter_reply_candidates(uuid,timestamptz,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.discover_chia_star_letter_reply_candidates(uuid,timestamptz,integer,timestamptz,uuid) to service_role;

create or replace function public.claim_chia_star_letter_reply_run(p_source_star_letter_id uuid,p_chia_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_result jsonb; v_run_id uuid; v_token uuid:=gen_random_uuid(); v_generation_invocation_id uuid:=gen_random_uuid(); v_source_updated_at timestamptz; v_post_updated_at timestamptz;
  v_day date:=(now() at time zone 'utc')::date; v_person_count integer; v_global_count integer;
  v_person_cost bigint; v_global_cost bigint; v_reserved bigint:=5000; v_person_last timestamptz; v_global_last timestamptz;
  v_recent_replied integer; v_recent_person_replied integer; v_recent_reserved integer; v_person_reserved_count integer;
  v_recent_cost bigint; v_person_recent_cost bigint; v_source_created_at timestamptz; v_parent_id uuid; v_source_post_id uuid;
  v_parent_updated_at timestamptz;
  v_source_post_author uuid; v_is_public boolean;
  v_person_profile_id uuid; v_claim_person_profile_id uuid;
  v_existing_status text; v_existing_attempts integer; v_existing_retry_at timestamptz; v_existing_updated_at timestamptz;
begin
  if p_source_star_letter_id is null or p_chia_profile_id is null then return jsonb_build_object('claimed',false,'outcome','invalid_payload'); end if;
  select sl.author_id,sl.created_at,sl.parent_star_letter_id,sl.post_id,p.author_id,p.visibility='public'
    into v_person_profile_id,v_source_created_at,v_parent_id,v_source_post_id,v_source_post_author,v_is_public
    from public.star_letters sl join public.posts p on p.id=sl.post_id
    where sl.id=p_source_star_letter_id and sl.deleted_at is null and p.deleted_at is null;
  if not found or v_person_profile_id=p_chia_profile_id or v_source_post_author is distinct from p_chia_profile_id
    or v_is_public is not true or v_source_created_at<now() - interval '48 hours'
    then return jsonb_build_object('claimed',false,'outcome','not_eligible'); end if;
  if v_source_created_at>now()-make_interval(secs=>public.chia_dot_reply_delay_seconds(p_source_star_letter_id))
    then return jsonb_build_object('claimed',false,'outcome','not_due'); end if;
  if not exists(select 1 from public.profile_kinds pk where pk.profile_id=v_person_profile_id and pk.kind='human')
    then return jsonb_build_object('claimed',false,'outcome','not_eligible'); end if;
  if v_parent_id is not null and not exists(select 1 from public.star_letters parent where parent.id=v_parent_id and parent.post_id=v_source_post_id and parent.deleted_at is null and parent.author_id=p_chia_profile_id)
    then return jsonb_build_object('claimed',false,'outcome','not_direct_conversation'); end if;
  if exists(select 1 from public.profile_blocks b where (b.blocker_id=v_person_profile_id and b.blocked_id=p_chia_profile_id) or (b.blocker_id=p_chia_profile_id and b.blocked_id=v_person_profile_id))
    then return jsonb_build_object('claimed',false,'outcome','blocked'); end if;
  if exists(select 1 from public.star_letters reply where reply.parent_star_letter_id=p_source_star_letter_id
      and reply.author_id=p_chia_profile_id and reply.deleted_at is null)
    then return jsonb_build_object('claimed',false,'outcome','already_replied'); end if;
  select status,attempts,next_attempt_at,updated_at into v_existing_status,v_existing_attempts,v_existing_retry_at,v_existing_updated_at
    from public.chia_star_letter_reply_runs where source_star_letter_id=p_source_star_letter_id;
  if v_existing_status in ('replied','skipped','failed') then return jsonb_build_object('claimed',false,'outcome','already_handled'); end if;
  if v_existing_status='retryable_failed' and coalesce(v_existing_retry_at,'-infinity'::timestamptz)>now()
    then return jsonb_build_object('claimed',false,'outcome','retry_not_due'); end if;
  if v_existing_status='processing' and (v_existing_attempts>=3 or v_existing_updated_at>=now()-interval '15 minutes')
    then return jsonb_build_object('claimed',false,'outcome','already_handled'); end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('chia-dot-global',0));
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('chia-dot-person:'||v_person_profile_id::text,0));
  -- A timed-out lease with a consumed wake may still have an in-flight result.
  -- Only signed completion or a confirmed failure may release that ambiguity.
  perform 1 from public.chia_star_letter_reply_runs where source_star_letter_id=p_source_star_letter_id
    and status='processing' and provider_wake_at is not null for update;
  if found then return jsonb_build_object('claimed',false,'outcome','generation_reconciliation_required'); end if;
  insert into public.chia_star_letter_reply_budget_days(budget_day,person_profile_id) values(v_day,v_person_profile_id) on conflict do nothing;
  insert into public.chia_star_letter_reply_budget_global(budget_day) values(v_day) on conflict do nothing;
  select started_count,reserved_cost_microusd,last_claimed_at into v_person_count,v_person_cost,v_person_last
    from public.chia_star_letter_reply_budget_days where budget_day=v_day and person_profile_id=v_person_profile_id for update;
  select started_count,reserved_cost_microusd,last_claimed_at into v_global_count,v_global_cost,v_global_last
    from public.chia_star_letter_reply_budget_global where budget_day=v_day for update;
  select count(*) into v_recent_replied from public.chia_star_letter_reply_runs r
    where r.status='replied' and r.budget_day is null and r.processed_at>=now()-interval '24 hours';
  select count(*) into v_recent_person_replied from public.chia_star_letter_reply_runs r
    join public.star_letters source on source.id=r.source_star_letter_id
    where r.status='replied' and r.budget_day is null and r.processed_at>=now()-interval '24 hours' and source.author_id=v_person_profile_id;
  select count(*),coalesce(sum(reserved_cost_microusd),0) into v_recent_reserved,v_recent_cost
    from public.chia_star_letter_reply_budget_reservations where created_at>=now()-interval '24 hours';
  select count(*),coalesce(sum(reserved_cost_microusd),0) into v_person_reserved_count,v_person_recent_cost
    from public.chia_star_letter_reply_budget_reservations
    where person_profile_id=v_person_profile_id and created_at>=now()-interval '24 hours';
  if v_person_reserved_count+v_recent_person_replied>=10 or v_recent_reserved+v_recent_replied>=50
    or v_person_recent_cost+(v_recent_person_replied*5000)+v_reserved>50000
    or v_recent_cost+(v_recent_replied*5000)+v_reserved>250000
    then return jsonb_build_object('claimed',false,'outcome','budget_limit'); end if;
  v_result:=public.claim_chia_star_letter_reply_run_legacy(p_source_star_letter_id,p_chia_profile_id);
  if not coalesce((v_result->>'claimed')::boolean,false) then return v_result; end if;
  v_run_id:=(v_result->>'run_id')::uuid;
  select sl.updated_at,p.updated_at,sl.post_id,sl.parent_star_letter_id
    into v_source_updated_at,v_post_updated_at,v_source_post_id,v_parent_id
    from public.star_letters sl join public.posts p on p.id=sl.post_id
    where sl.id=p_source_star_letter_id and sl.deleted_at is null and p.deleted_at is null and p.visibility='public'
    for share of sl,p;
  if not found then
    perform public.fail_chia_star_letter_reply_run_legacy(v_run_id,'source_no_longer_eligible');
    return jsonb_build_object('claimed',false,'outcome','source_no_longer_eligible');
  end if;
  if v_parent_id is not null then
    select parent.updated_at into v_parent_updated_at from public.star_letters parent
      where parent.id=v_parent_id and parent.post_id=v_source_post_id
        and parent.author_id=p_chia_profile_id and parent.deleted_at is null for share;
    if not found then
      perform public.fail_chia_star_letter_reply_run_legacy(v_run_id,'parent_no_longer_eligible');
      return jsonb_build_object('claimed',false,'outcome','source_no_longer_eligible');
    end if;
  end if;
  update public.chia_star_letter_reply_runs set claim_token=v_token,source_updated_at=v_source_updated_at,
    post_updated_at=v_post_updated_at,budget_day=v_day,reserved_cost_microusd=v_reserved,model_key='cos-chatgpt',provider_wake_at=null,
    source_parent_id=v_parent_id,source_parent_updated_at=v_parent_updated_at,
    generation_invocation_id=v_generation_invocation_id,updated_at=now()
    where id=v_run_id;
  select sl.author_id into v_claim_person_profile_id from public.star_letters sl where sl.id=p_source_star_letter_id;
  if v_claim_person_profile_id is distinct from v_person_profile_id then
    update public.chia_star_letter_reply_runs set status='skipped',error_code='source_author_changed',
      next_attempt_at=null,processed_at=now(),updated_at=now() where id=v_run_id;
    return jsonb_build_object('claimed',false,'outcome','source_changed');
  end if;
  insert into public.chia_star_letter_reply_budget_reservations(run_id,attempt,chia_profile_id,person_profile_id,model_key,reserved_cost_microusd)
    select v_run_id,r.attempts,p_chia_profile_id,v_person_profile_id,'cos-chatgpt',v_reserved
    from public.chia_star_letter_reply_runs r where r.id=v_run_id;
  update public.chia_star_letter_reply_budget_days set started_count=started_count+1,reserved_cost_microusd=reserved_cost_microusd+v_reserved,last_claimed_at=now()
    where budget_day=v_day and person_profile_id=v_person_profile_id;
  update public.chia_star_letter_reply_budget_global set started_count=started_count+1,reserved_cost_microusd=reserved_cost_microusd+v_reserved,last_claimed_at=now() where budget_day=v_day;
  insert into public.chia_person_memory_partitions(chia_profile_id,person_profile_id)
    values(p_chia_profile_id,v_person_profile_id) on conflict do nothing;
  update public.chia_star_letter_reply_runs set memory_chia_profile_id=p_chia_profile_id,
    memory_person_profile_id=v_person_profile_id,memory_revision=(select revision from public.chia_person_memory_partitions
      where chia_profile_id=p_chia_profile_id and person_profile_id=v_person_profile_id) where id=v_run_id;
  return v_result||jsonb_build_object('memory_revision',(select memory_revision::text from public.chia_star_letter_reply_runs where id=v_run_id),
    'claim_token',v_token,'source_updated_at',v_source_updated_at,'post_updated_at',v_post_updated_at,

    'generation_invocation_id',v_generation_invocation_id,
    'generation_budget',jsonb_build_object('model','cos-chatgpt','max_input_tokens',8000,'max_output_tokens',512,'reserved_cost_microusd',v_reserved));
end;
$function$;

create or replace function public.complete_chia_star_letter_reply_run(
  p_run_id uuid,p_chia_profile_id uuid,p_decision text,p_body text,p_claim_token uuid,p_source_updated_at timestamptz,p_post_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype; v_source_updated_at timestamptz; v_post_updated_at timestamptz; v_result jsonb;
begin
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id for update;
  if not found then return jsonb_build_object('outcome','run_not_found'); end if;
  if p_claim_token is distinct from v_run.claim_token then return jsonb_build_object('outcome','stale_claim'); end if;
  if v_run.status in ('replied','failed','skipped') then
    return jsonb_build_object('outcome',v_run.status,'status',v_run.status,'run_id',v_run.id,'reply_star_letter_id',v_run.reply_star_letter_id);
  end if;
  if v_run.budget_day is null or v_run.reserved_cost_microusd<>5000 or v_run.model_key<>'cos-chatgpt'
    then return jsonb_build_object('outcome','budget_not_reserved'); end if;
  if v_run.provider_wake_at is null then return jsonb_build_object('outcome','provider_not_authorized'); end if;
  select sl.updated_at,p.updated_at into v_source_updated_at,v_post_updated_at
    from public.star_letters sl join public.posts p on p.id=sl.post_id
    where sl.id=v_run.source_star_letter_id and sl.deleted_at is null and p.deleted_at is null and p.visibility='public'
    for update of sl,p;
  if not found or v_source_updated_at is distinct from v_run.source_updated_at or v_post_updated_at is distinct from v_run.post_updated_at
    or p_source_updated_at is distinct from v_run.source_updated_at or p_post_updated_at is distinct from v_run.post_updated_at
    then return jsonb_build_object('outcome','stale_source'); end if;
  if not public.chia_dot_run_source_fresh(p_run_id) then return jsonb_build_object('outcome','stale_source'); end if;
  if not public.chia_dot_run_memory_fresh(p_run_id) then return jsonb_build_object('outcome','stale_memory'); end if;
  v_result:=public.complete_chia_star_letter_reply_run_legacy(p_run_id,p_chia_profile_id,p_decision,p_body);
  return v_result;
end;
$function$;

create or replace function public.chia_dot_run_source_fresh(p_run_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype; v_source_updated_at timestamptz; v_post_updated_at timestamptz;
  v_parent_id uuid; v_post_id uuid; v_chia_id uuid; v_parent_updated_at timestamptz;
begin
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id for update;
  if not found then return false; end if;
  select sl.updated_at,p.updated_at,sl.parent_star_letter_id,sl.post_id,p.author_id
    into v_source_updated_at,v_post_updated_at,v_parent_id,v_post_id,v_chia_id
    from public.star_letters sl join public.posts p on p.id=sl.post_id
    where sl.id=v_run.source_star_letter_id and sl.deleted_at is null and p.deleted_at is null and p.visibility='public'
    for update of sl,p;
  if not found then return false; end if;
  if v_parent_id is distinct from v_run.source_parent_id then return false; end if;
  if v_parent_id is not null then
    select parent.updated_at into v_parent_updated_at from public.star_letters parent where parent.id=v_parent_id
      and parent.post_id=v_post_id and parent.author_id=v_chia_id and parent.deleted_at is null for share;
    if not found or v_parent_updated_at is distinct from v_run.source_parent_updated_at then return false; end if;
  end if;
  return v_run.source_updated_at is not null and v_run.post_updated_at is not null
    and v_run.source_updated_at=v_source_updated_at and v_run.post_updated_at=v_post_updated_at;
end;
$function$;

-- Existing token and legacy signatures stay callable, with an atomic source
-- freshness check for runs whose claim captured source revisions.
create or replace function public.complete_chia_star_letter_reply_run(
  p_run_id uuid,p_chia_profile_id uuid,p_decision text,p_body text,p_claim_token uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype;
begin
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id for update;
  if not found then return jsonb_build_object('outcome','run_not_found'); end if;
  if v_run.claim_token is distinct from p_claim_token then return jsonb_build_object('outcome','stale_claim'); end if;
  if v_run.status in ('replied','failed','skipped') then
    return jsonb_build_object('outcome',v_run.status,'status',v_run.status,'run_id',v_run.id,'reply_star_letter_id',v_run.reply_star_letter_id);
  end if;
  if not public.chia_dot_run_source_fresh(p_run_id) then return jsonb_build_object('outcome','stale_source'); end if;
  if not public.chia_dot_run_memory_fresh(p_run_id) then return jsonb_build_object('outcome','stale_memory'); end if;
  return public.complete_chia_star_letter_reply_run_legacy(p_run_id,p_chia_profile_id,p_decision,p_body);
end;
$function$;

create or replace function public.complete_chia_star_letter_reply_run(
  p_run_id uuid,p_chia_profile_id uuid,p_decision text,p_body text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype;
begin
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id for update;
  if not found then return jsonb_build_object('outcome','run_not_found'); end if;
  if v_run.status in ('replied','failed','skipped') and v_run.attempts>1 then return jsonb_build_object('outcome','stale_claim'); end if;
  if v_run.status='replied' then return jsonb_build_object('outcome','already_replied','reply_star_letter_id',v_run.reply_star_letter_id); end if;
  if v_run.status in ('failed','skipped') then return jsonb_build_object('outcome',v_run.status,'reply_star_letter_id',v_run.reply_star_letter_id); end if;
  if not public.chia_dot_run_source_fresh(p_run_id) then return jsonb_build_object('outcome','stale_source'); end if;
  if not public.chia_dot_run_memory_fresh(p_run_id) then return jsonb_build_object('outcome','stale_memory'); end if;
  if v_run.attempts>1 then return jsonb_build_object('outcome','stale_claim'); end if;
  return public.complete_chia_star_letter_reply_run_legacy(p_run_id,p_chia_profile_id,p_decision,p_body);
end;
$function$;

create or replace function public.fail_chia_star_letter_reply_run(p_run_id uuid,p_error_code text,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype; v_result jsonb;
begin
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id for update;
  if not found then return jsonb_build_object('outcome','run_not_found'); end if;
  if v_run.claim_token is distinct from p_claim_token then return jsonb_build_object('outcome','stale_claim'); end if;
  if v_run.status in ('replied','retryable_failed','failed','skipped') then
    return jsonb_build_object('outcome',v_run.status,'status',v_run.status,'run_id',v_run.id,
      'reply_star_letter_id',v_run.reply_star_letter_id,'next_attempt_at',v_run.next_attempt_at);
  end if;
  v_result:=public.fail_chia_star_letter_reply_run_legacy(p_run_id,p_error_code);
  return v_result||jsonb_build_object('status',v_result->>'outcome','run_id',p_run_id);
end;
$function$;

create or replace function public.get_chia_star_letter_reply_run_status(p_source_star_letter_id uuid,p_chia_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype; v_reply_id uuid;
begin
  select r.* into v_run from public.chia_star_letter_reply_runs r
    join public.star_letters source on source.id=r.source_star_letter_id
    join public.posts p on p.id=source.post_id
    where r.source_star_letter_id=p_source_star_letter_id and p.author_id=p_chia_profile_id;
  select sl.id into v_reply_id from public.star_letters sl where sl.parent_star_letter_id=p_source_star_letter_id
    and sl.author_id=p_chia_profile_id and sl.deleted_at is null and exists(
      select 1 from public.star_letters source join public.posts p on p.id=source.post_id
      where source.id=p_source_star_letter_id and p.author_id=p_chia_profile_id
    ) order by sl.created_at limit 1;
  if v_reply_id is null and v_run.id is null then return jsonb_build_object('outcome','not_found','status','not_found'); end if;
  if v_reply_id is not null and v_run.status is distinct from 'replied' then
    return jsonb_build_object('outcome','replied','status','replied','run_id',v_run.id,'reply_star_letter_id',v_reply_id,'attempts',v_run.attempts,
      'generation_invocation_id',v_run.generation_invocation_id,'provider_wake_at',v_run.provider_wake_at);
  end if;
  return jsonb_build_object('outcome',coalesce(v_run.status,'not_found'),'status',coalesce(v_run.status,'not_found'),
    'run_id',v_run.id,'reply_star_letter_id',coalesce(v_run.reply_star_letter_id,v_reply_id),'attempts',v_run.attempts,
    'error_code',v_run.error_code,'next_attempt_at',v_run.next_attempt_at,
    'generation_invocation_id',v_run.generation_invocation_id,'provider_wake_at',v_run.provider_wake_at);
end;
$function$;

create or replace function public.authorize_chia_dot_provider_wake(
  p_run_id uuid,p_chia_profile_id uuid,p_person_profile_id uuid,p_claim_token uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype; v_day date:=(now() at time zone 'utc')::date;
  v_person_wake timestamptz; v_global_wake timestamptz; v_source_updated_at timestamptz; v_post_updated_at timestamptz; v_author uuid;
  v_post_id uuid; v_parent_id uuid; v_has_reservation boolean;
begin
  if p_run_id is null or p_chia_profile_id is null or p_person_profile_id is null or p_claim_token is null then
    return jsonb_build_object('outcome','invalid_payload');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('chia-dot-global',0));
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('chia-dot-person:'||p_person_profile_id::text,0));
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id for update;
  if not found or v_run.status<>'processing' then return jsonb_build_object('outcome','invalid_status'); end if;
  if v_run.claim_token is distinct from p_claim_token then return jsonb_build_object('outcome','stale_claim'); end if;
  if v_run.provider_wake_at is not null then
    return jsonb_build_object('outcome','already_woken','generation_invocation_id',v_run.generation_invocation_id,'provider_wake_at',v_run.provider_wake_at);
  end if;
  if v_run.budget_day is null or v_run.reserved_cost_microusd<>5000 or v_run.model_key<>'cos-chatgpt'
    then return jsonb_build_object('outcome','budget_not_reserved'); end if;
  select sl.updated_at,p.updated_at,sl.author_id,sl.post_id,sl.parent_star_letter_id
    into v_source_updated_at,v_post_updated_at,v_author,v_post_id,v_parent_id
    from public.star_letters sl join public.posts p on p.id=sl.post_id
    where sl.id=v_run.source_star_letter_id and sl.deleted_at is null and p.deleted_at is null
      and p.visibility='public' and p.author_id=p_chia_profile_id
    for update of sl,p;
  if not found or v_author is distinct from p_person_profile_id then return jsonb_build_object('outcome','not_person'); end if;
  if not exists(select 1 from public.profile_kinds pk where pk.profile_id=v_author and pk.kind='human')
    or exists(select 1 from public.profile_blocks b where
      (b.blocker_id=v_author and b.blocked_id=p_chia_profile_id) or (b.blocker_id=p_chia_profile_id and b.blocked_id=v_author))
    or (v_parent_id is not null and not exists(select 1 from public.star_letters parent where
      parent.id=v_parent_id and parent.post_id=v_post_id and parent.author_id=p_chia_profile_id and parent.deleted_at is null for share))
    then return jsonb_build_object('outcome','not_eligible'); end if;
  if v_source_updated_at is distinct from v_run.source_updated_at or v_post_updated_at is distinct from v_run.post_updated_at
    then return jsonb_build_object('outcome','stale_source'); end if;
  if not public.chia_dot_run_source_fresh(p_run_id) then return jsonb_build_object('outcome','stale_source'); end if;
  select exists(select 1 from public.chia_star_letter_reply_budget_reservations br
    where br.run_id=v_run.id and br.attempt=v_run.attempts and br.chia_profile_id=p_chia_profile_id
      and br.person_profile_id=p_person_profile_id and br.model_key=v_run.model_key
      and br.reserved_cost_microusd=v_run.reserved_cost_microusd and br.created_at>=now()-interval '24 hours')
    into v_has_reservation;
  if not v_has_reservation then return jsonb_build_object('outcome','budget_not_reserved'); end if;
  insert into public.chia_star_letter_reply_budget_days(budget_day,person_profile_id) values(v_day,p_person_profile_id) on conflict do nothing;
  insert into public.chia_star_letter_reply_budget_global(budget_day) values(v_day) on conflict do nothing;
  perform 1 from public.chia_star_letter_reply_budget_days
    where person_profile_id=p_person_profile_id and budget_day>=v_day-1 order by budget_day for update;
  perform 1 from public.chia_star_letter_reply_budget_global where budget_day>=v_day-1 order by budget_day for update;
  select max(last_wake_at) into v_person_wake from public.chia_star_letter_reply_budget_days
    where person_profile_id=p_person_profile_id and last_wake_at>=now()-interval '24 hours';
  select max(last_wake_at) into v_global_wake from public.chia_star_letter_reply_budget_global
    where last_wake_at>=now()-interval '24 hours';
  if (v_person_wake is not null and v_person_wake>now()-interval '120 seconds')
    or (v_global_wake is not null and v_global_wake>now()-interval '60 seconds')
    then return jsonb_build_object('outcome','provider_throttled'); end if;
  if not public.chia_dot_run_memory_fresh(p_run_id) then return jsonb_build_object('outcome','stale_memory'); end if;
  update public.chia_star_letter_reply_budget_days set last_wake_at=now() where budget_day=v_day and person_profile_id=p_person_profile_id;
  update public.chia_star_letter_reply_budget_global set last_wake_at=now() where budget_day=v_day;
  update public.chia_star_letter_reply_runs set provider_wake_at=now() where id=p_run_id;
  return jsonb_build_object('outcome','authorized','model','cos-chatgpt','max_input_tokens',8000,'max_output_tokens',512,'max_cost_microusd',5000,
    'generation_invocation_id',v_run.generation_invocation_id,'provider_wake_at',now());
end;
$function$;

create or replace function public.remember_chia_star_letter_reply(
  p_run_id uuid,p_chia_profile_id uuid,p_person_profile_id uuid,p_claim_token uuid,p_source_star_letter_id uuid,
  p_source_updated_at timestamptz,p_post_updated_at timestamptz,p_memory_key text,p_content text,p_importance smallint default 3
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_run public.chia_star_letter_reply_runs%rowtype; v_source_updated_at timestamptz; v_post_updated_at timestamptz;
  v_author uuid; v_body text; v_memory_id uuid; v_receipt public.chia_star_letter_reply_memory_receipts%rowtype; v_post_id uuid; v_parent_id uuid;
begin
  select * into v_run from public.chia_star_letter_reply_runs where id=p_run_id for update;
  if not found or v_run.status<>'replied' or v_run.reply_star_letter_id is null then return jsonb_build_object('outcome','not_replied'); end if;
  if v_run.claim_token is distinct from p_claim_token or v_run.source_star_letter_id is distinct from p_source_star_letter_id then return jsonb_build_object('outcome','stale_claim'); end if;
  select * into v_receipt from public.chia_star_letter_reply_memory_receipts
    where run_id=p_run_id and memory_key=p_memory_key;
  if found then return jsonb_build_object('outcome',v_receipt.outcome,'memory_id',v_receipt.memory_id,'reconciled',true); end if;
  if not public.chia_dot_run_source_fresh(p_run_id) then return jsonb_build_object('outcome','source_changed_or_invalid'); end if;
  select sl.updated_at,p.updated_at,sl.author_id,sl.body,sl.post_id,sl.parent_star_letter_id
    into v_source_updated_at,v_post_updated_at,v_author,v_body,v_post_id,v_parent_id
    from public.star_letters sl join public.posts p on p.id=sl.post_id
    where sl.id=p_source_star_letter_id and sl.deleted_at is null and p.deleted_at is null and p.visibility='public'
      and p.author_id=p_chia_profile_id
    for update of sl,p;
  if not found or v_author is distinct from p_person_profile_id or v_author=p_chia_profile_id
    or not exists(select 1 from public.profile_kinds pk where pk.profile_id=v_author and pk.kind='human')
    or exists(select 1 from public.profile_blocks b where
      (b.blocker_id=v_author and b.blocked_id=p_chia_profile_id) or (b.blocker_id=p_chia_profile_id and b.blocked_id=v_author))
    or (v_parent_id is not null and not exists(select 1 from public.star_letters parent where
      parent.id=v_parent_id and parent.post_id=v_post_id and parent.author_id=p_chia_profile_id and parent.deleted_at is null for share))
    or v_source_updated_at is distinct from p_source_updated_at or v_post_updated_at is distinct from p_post_updated_at
    or v_source_updated_at is distinct from v_run.source_updated_at or v_post_updated_at is distinct from v_run.post_updated_at
    or p_content is null or char_length(p_content) not between 1 and 1200 or btrim(p_content)<>p_content or position(p_content in v_body)=0
    or p_memory_key is null or p_memory_key !~ '^[a-z0-9_]{3,64}$'
    then return jsonb_build_object('outcome','source_changed_or_invalid'); end if;
  insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_star_letter_id,source_updated_at,memory_key,content,importance)
    values(p_chia_profile_id,p_person_profile_id,p_source_star_letter_id,p_source_updated_at,p_memory_key,p_content,least(greatest(coalesce(p_importance,3),1),5))
    on conflict(chia_profile_id,person_profile_id,memory_key) do nothing returning id into v_memory_id;
  if v_memory_id is null then
    insert into public.chia_star_letter_reply_memory_receipts(run_id,memory_key,outcome)
      values(p_run_id,p_memory_key,'already_remembered') on conflict do nothing;
    return jsonb_build_object('outcome','already_remembered');
  end if;
  insert into public.chia_star_letter_reply_memory_receipts(run_id,memory_key,outcome,memory_id)
    values(p_run_id,p_memory_key,'remembered',v_memory_id) on conflict do nothing;
  return jsonb_build_object('outcome','remembered','memory_id',v_memory_id);
end;
$function$;

revoke all on function public.get_chia_star_letter_reply_run_status(uuid,uuid),
  public.remember_chia_star_letter_reply(uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,smallint),
  public.complete_chia_star_letter_reply_run(uuid,uuid,text,text,uuid,timestamptz,timestamptz),
  public.fail_chia_star_letter_reply_run(uuid,text,uuid),
  public.authorize_chia_dot_provider_wake(uuid,uuid,uuid,uuid),
  public.chia_dot_run_source_fresh(uuid) from public,anon,authenticated;
grant execute on function public.get_chia_star_letter_reply_run_status(uuid,uuid),
  public.remember_chia_star_letter_reply(uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,smallint),
  public.complete_chia_star_letter_reply_run(uuid,uuid,text,text,uuid,timestamptz,timestamptz),
  public.fail_chia_star_letter_reply_run(uuid,text,uuid),
  public.authorize_chia_dot_provider_wake(uuid,uuid,uuid,uuid),
  public.complete_chia_star_letter_reply_run(uuid,uuid,text,text,uuid),
  public.complete_chia_star_letter_reply_run(uuid,uuid,text,text),
  public.chia_dot_run_source_fresh(uuid) to service_role;
revoke all on function public.chia_dot_reply_delay_seconds(uuid),public.chia_dot_run_source_fresh(uuid) from public,anon,authenticated;
grant execute on function public.chia_dot_reply_delay_seconds(uuid),public.chia_dot_run_source_fresh(uuid) to service_role;
revoke all on function public.guard_chia_person_memory(),
  public.invalidate_chia_memories_for_star_letter(),public.invalidate_chia_memories_for_post() from public,anon,authenticated;
commit;

begin;

-- Historical public post evidence is distinct from direct star-letter evidence.
-- Keep old rows and the existing star-letter reply protocol intact.
alter table public.chia_person_memories
  alter column source_star_letter_id drop not null,
  add column source_post_id uuid references public.posts(id) on delete cascade;
alter table public.chia_person_memories
  add constraint chia_person_memories_exactly_one_source
  check ((source_post_id is not null) <> (source_star_letter_id is not null));
create unique index chia_person_memories_one_historical_post_idx
  on public.chia_person_memories(chia_profile_id,person_profile_id,source_post_id)
  where source_post_id is not null;

-- Explicit owner removal must survive a batch importer retry. The source UUID
-- has no FK: deleting an original post must not reset an opt-out. Identity
-- FKs cascade when the profile itself is deleted.
create table public.chia_memory_source_exclusions (
  chia_profile_id uuid not null references public.profiles(id) on delete cascade,
  person_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check(source_type in ('post','star_letter')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(chia_profile_id,person_profile_id,source_type,source_id),
  constraint chia_exclusions_distinct_people check(chia_profile_id <> person_profile_id)
);
alter table public.chia_memory_source_exclusions enable row level security;
revoke all on public.chia_memory_source_exclusions from public,anon,authenticated,service_role;
grant select,insert on public.chia_memory_source_exclusions to service_role;
grant select on public.chia_memory_source_exclusions to authenticated;
create policy chia_memory_source_exclusions_owner_select
  on public.chia_memory_source_exclusions for select to authenticated
  using(person_profile_id=(select auth.uid()));

-- Distinguish an explicit owner's decision from source invalidation. A DELETE
-- trigger cannot do this: auth.uid() also reflects the author while editing a
-- public post, so the invalidation trigger would wrongly create an exclusion.
-- The owner must use the RPC below. Direct authenticated DELETE is revoked.
revoke delete on public.chia_person_memories from authenticated;

-- Both explicit owner deletion and memory admission take the SAME transaction
-- advisory key BEFORE locking a memory row. This serializes retries even when
-- two different memory_keys refer to one star_letter. Hash collisions only
-- serialize unrelated records and do not affect access control.
create function public.chia_memory_source_lock_key(
  p_chia_profile_id uuid,p_person_profile_id uuid,p_source_type text,p_source_id uuid)
returns bigint language sql immutable strict set search_path = ''
as $function$
  select hashtextextended(p_chia_profile_id::text || ':' || p_person_profile_id::text || ':' ||
    p_source_type || ':' || p_source_id::text, 0);
$function$;
revoke all on function public.chia_memory_source_lock_key(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

-- Security-definer RPC: check auth.uid() rather than trusting any user-id
-- argument. Exclusion and DELETE are atomic in one PostgreSQL transaction.
create function public.delete_own_chia_memory(p_memory_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_person_id uuid := auth.uid(); v_memory public.chia_person_memories%rowtype;
  v_type text; v_id uuid;
begin
  if v_person_id is null then
    raise exception 'sign-in required' using errcode='42501';
  end if;
  -- Preliminary read deliberately does not lock the memory row. Acquire the
  -- shared source mutex first, then re-read it under FOR UPDATE.
  select * into v_memory from public.chia_person_memories
    where id=p_memory_id and person_profile_id=v_person_id;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  v_type:=case when v_memory.source_post_id is not null then 'post' else 'star_letter' end;
  v_id:=coalesce(v_memory.source_post_id,v_memory.source_star_letter_id);
  perform pg_advisory_xact_lock(public.chia_memory_source_lock_key(
    v_memory.chia_profile_id,v_person_id,v_type,v_id));
  select * into v_memory from public.chia_person_memories
    where id=p_memory_id and person_profile_id=v_person_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if coalesce(v_memory.source_post_id,v_memory.source_star_letter_id) is distinct from v_id or
     (case when v_memory.source_post_id is not null then 'post' else 'star_letter' end) <> v_type then
    raise exception 'memory source changed unexpectedly' using errcode='23514';
  end if;
  insert into public.chia_memory_source_exclusions
    (chia_profile_id,person_profile_id,source_type,source_id)
    values(v_memory.chia_profile_id,v_person_id,v_type,v_id)
    on conflict do nothing;
  delete from public.chia_person_memories where id=p_memory_id and person_profile_id=v_person_id;
  return jsonb_build_object('outcome','deleted');
end;
$function$;
revoke all on function public.delete_own_chia_memory(uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_own_chia_memory(uuid) to authenticated;

-- Preserve the old input and locking contract for star-letter memories. Only
-- exact quotes from a currently public human-authored post may become a new
-- historical-post memory. No provider, model, or human classification can
-- fabricate a different person's source.
create or replace function public.guard_chia_person_memory()
returns trigger language plpgsql set search_path = ''
as $function$
declare
  v_source_updated_at timestamptz;
  v_source_body text;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or
       new.chia_profile_id is distinct from old.chia_profile_id or
       new.person_profile_id is distinct from old.person_profile_id or
       new.source_star_letter_id is distinct from old.source_star_letter_id or
       new.source_post_id is distinct from old.source_post_id or
       new.source_updated_at is distinct from old.source_updated_at or
       new.memory_key is distinct from old.memory_key or
       new.created_at is distinct from old.created_at then
      raise exception 'memory identity is immutable' using errcode='23514';
    end if;
  else
    if not exists(select 1 from public.profile_kinds pk
      where pk.profile_id=new.chia_profile_id and pk.kind='ai_resident') or
       not exists(select 1 from public.profile_kinds pk
      where pk.profile_id=new.person_profile_id and pk.kind='human') then
      raise exception 'invalid memory participants' using errcode='23514';
    end if;
    if new.source_post_id is not null then
      select p.updated_at,p.body
        into v_source_updated_at,v_source_body
        from public.posts p
        where p.id=new.source_post_id and p.author_id=new.person_profile_id
          and p.visibility='public' and p.deleted_at is null
        for share of p;
      if not found or new.memory_key is distinct from
        ('historical_post_' || replace(new.source_post_id::text,'-','')) or
        char_length(new.content)>500 or
        position(new.content in coalesce(v_source_body,''))=0 then
        raise exception 'invalid historical post evidence' using errcode='23514';
      end if;
    else
      select sl.updated_at into v_source_updated_at
        from public.star_letters sl
        join public.posts p on p.id=sl.post_id
        where sl.id=new.source_star_letter_id and
          sl.author_id=new.person_profile_id and sl.deleted_at is null and
          p.deleted_at is null
        for share of sl,p;
      if not found then
        raise exception 'memory source is missing or not owned by person' using errcode='23514';
      end if;
    end if;
    if new.source_updated_at is not null and
      new.source_updated_at is distinct from v_source_updated_at then
      raise exception 'memory source has changed since observation' using errcode='23514';
    end if;
    new.source_updated_at := v_source_updated_at;
    -- The owner deletion RPC takes this same key before locking the memory.
    -- This closes both same-key and different-key concurrent reimport gaps.
    perform pg_advisory_xact_lock(public.chia_memory_source_lock_key(
      new.chia_profile_id,new.person_profile_id,
      case when new.source_post_id is not null then 'post' else 'star_letter' end,
      coalesce(new.source_post_id,new.source_star_letter_id)));
    -- Serialize admissions without blocking exclusion FK KEY SHARE, so owner
    -- deletion cannot deadlock waiting on the same profile row.
    perform 1 from public.profiles where id=new.person_profile_id for no key update;
    if exists(select 1 from public.profile_blocks b where
      (b.blocker_id=new.person_profile_id and b.blocked_id=new.chia_profile_id) or
      (b.blocker_id=new.chia_profile_id and b.blocked_id=new.person_profile_id)) then
      raise exception 'blocked memory participants' using errcode='23514';
    end if;
    if exists(select 1 from public.chia_memory_source_exclusions x
      where x.chia_profile_id=new.chia_profile_id and
        x.person_profile_id=new.person_profile_id and
        x.source_type=case when new.source_post_id is not null then 'post' else 'star_letter' end
        and x.source_id=coalesce(new.source_post_id,new.source_star_letter_id)) then
      raise exception 'source excluded by owner' using errcode='23514';
    end if;
    if (select count(*) from public.chia_person_memories m
        where m.chia_profile_id=new.chia_profile_id and
          m.person_profile_id=new.person_profile_id)>=30 then
      raise exception 'memory limit reached for person' using errcode='23514';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$function$;

-- Edited, hidden, deleted, or reattributed posts must no longer support facts.
-- Preserve the existing invalidation for source star letters on those posts.
create or replace function public.invalidate_chia_memories_for_post()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if old.body is distinct from new.body or
     old.deleted_at is distinct from new.deleted_at or
     old.visibility is distinct from new.visibility or
     old.author_id is distinct from new.author_id then
    delete from public.chia_person_memories m
      where m.source_post_id=new.id or
        m.source_star_letter_id in (
          select sl.id from public.star_letters sl where sl.post_id=new.id);
  end if;
  return new;
end;
$function$;


commit;

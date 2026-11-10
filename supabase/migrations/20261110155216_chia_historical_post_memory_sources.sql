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

-- The existing memory UI deletes rows directly. Record the owner's deletion
-- atomically, so a future backfill cannot restore the same evidence.
create function public.note_owner_deleted_chia_memory_source()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() = old.person_profile_id and
     exists(select 1 from public.profiles p where p.id = old.person_profile_id) and
     exists(select 1 from public.profiles p where p.id = old.chia_profile_id) then
    insert into public.chia_memory_source_exclusions
      (chia_profile_id,person_profile_id,source_type,source_id)
    values(old.chia_profile_id,old.person_profile_id,
      case when old.source_post_id is not null then 'post' else 'star_letter' end,
      coalesce(old.source_post_id,old.source_star_letter_id))
    on conflict do nothing;
  end if;
  return old;
end;
$function$;
create trigger note_owner_deleted_chia_memory_source_trigger
  after delete on public.chia_person_memories for each row
  execute function public.note_owner_deleted_chia_memory_source();
revoke all on function public.note_owner_deleted_chia_memory_source() from public,anon,authenticated,service_role;

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

-- Re-check after the INSERT's unique-index wait, not only in BEFORE INSERT.
-- Otherwise an owner can delete a prior memory while an importer waits on its
-- unique row; the owner exclusion might commit after the first preflight.
create function public.enforce_chia_memory_source_exclusion_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if exists(select 1 from public.chia_memory_source_exclusions x
    where x.chia_profile_id=new.chia_profile_id and
      x.person_profile_id=new.person_profile_id and
      x.source_type=case when new.source_post_id is not null then 'post' else 'star_letter' end and
      x.source_id=coalesce(new.source_post_id,new.source_star_letter_id)) then
    raise exception 'source excluded by owner' using errcode='23514';
  end if;
  return new;
end;
$function$;
create trigger enforce_chia_memory_source_exclusion_after_insert_trigger
  after insert on public.chia_person_memories for each row
  execute function public.enforce_chia_memory_source_exclusion_after_insert();
revoke all on function public.enforce_chia_memory_source_exclusion_after_insert() from public,anon,authenticated,service_role;

commit;

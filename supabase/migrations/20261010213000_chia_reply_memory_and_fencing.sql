begin;

-- Memories are explicitly partitioned by the AI and human profile UUIDs.
-- No usernames, display names, or shared/global human buckets are used.
create table public.chia_person_memories (
  id uuid primary key default gen_random_uuid(),
  chia_profile_id uuid not null references public.profiles(id) on delete cascade,
  person_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_star_letter_id uuid not null references public.star_letters(id) on delete cascade,
  source_updated_at timestamptz not null,
  memory_key text not null check (char_length(memory_key) between 1 and 80 and memory_key = btrim(memory_key)),
  content text not null check (char_length(content) between 1 and 1200 and content = btrim(content)),
  importance smallint not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chia_person_memories_distinct_people check (chia_profile_id <> person_profile_id),
  constraint chia_person_memories_unique_key unique (chia_profile_id, person_profile_id, memory_key)
);

create index chia_person_memories_recent_idx
  on public.chia_person_memories(chia_profile_id, person_profile_id, importance desc, updated_at desc);
create index chia_person_memories_source_idx
  on public.chia_person_memories(source_star_letter_id)
  where source_star_letter_id is not null;

comment on table public.chia_person_memories is
  'Bounded, editable per-human memory for Chia; never infer identity from display names.';

create function public.guard_chia_person_memory()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source_updated_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.chia_profile_id is distinct from old.chia_profile_id
      or new.person_profile_id is distinct from old.person_profile_id
      or new.source_star_letter_id is distinct from old.source_star_letter_id
      or new.source_updated_at is distinct from old.source_updated_at
      or new.memory_key is distinct from old.memory_key
      or new.created_at is distinct from old.created_at
    then
      raise exception 'memory identity is immutable' using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.profile_kinds pk
      where pk.profile_id = new.chia_profile_id and pk.kind = 'ai_resident'
    ) then
      raise exception 'memory owner must be an AI resident' using errcode = '23514';
    end if;
      select sl.updated_at into v_source_updated_at
      from public.star_letters sl
      join public.posts p on p.id = sl.post_id
      where sl.id = new.source_star_letter_id
        and sl.author_id = new.person_profile_id
        and sl.deleted_at is null and p.deleted_at is null
      for share of sl, p;
      if not found then
        raise exception 'memory source is missing or not owned by person' using errcode = '23514';
      end if;
      if new.source_updated_at is not null
         and new.source_updated_at is distinct from v_source_updated_at then
        raise exception 'memory source has changed since observation' using errcode = '23514';
      end if;
      new.source_updated_at := v_source_updated_at;
    -- Serialize inserts for one person's partition, including independent keys.
    perform 1 from public.profiles
      where id = new.person_profile_id for update;
    if (select count(*) from public.chia_person_memories m
        where m.chia_profile_id = new.chia_profile_id
          and m.person_profile_id = new.person_profile_id) >= 30 then
      raise exception 'memory limit reached for person' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Soft deletes and content edits invalidate memories grounded in that source.
-- The source ID is immutable; subsequent edits cannot silently reattribute it.
create function public.invalidate_chia_memories_for_star_letter()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.deleted_at is distinct from new.deleted_at
     or old.body is distinct from new.body
     or old.author_id is distinct from new.author_id then
    delete from public.chia_person_memories
     where source_star_letter_id = new.id;
  end if;
  return new;
end;
$$;
create trigger invalidate_chia_memories_for_star_letter_trigger
after update of deleted_at, body, author_id on public.star_letters
for each row execute function public.invalidate_chia_memories_for_star_letter();
revoke all on function public.invalidate_chia_memories_for_star_letter() from public, anon, authenticated;

-- A source letter also becomes invalid when its containing post is changed or
-- hidden/deleted; these updates need to clear memories derived from that post.
create function public.invalidate_chia_memories_for_post()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.body is distinct from new.body
     or old.deleted_at is distinct from new.deleted_at
     or old.visibility is distinct from new.visibility then
    delete from public.chia_person_memories m
    using public.star_letters sl
    where m.source_star_letter_id = sl.id
      and sl.post_id = new.id;
  end if;
  return new;
end;
$$;
create trigger invalidate_chia_memories_for_post_trigger
after update of body, deleted_at, visibility on public.posts
for each row execute function public.invalidate_chia_memories_for_post();
revoke all on function public.invalidate_chia_memories_for_post() from public, anon, authenticated;

create trigger guard_chia_person_memory_trigger
before insert or update on public.chia_person_memories
for each row execute function public.guard_chia_person_memory();

alter table public.chia_person_memories enable row level security;
revoke all on public.chia_person_memories from public, anon, authenticated;
grant select, insert, update, delete on public.chia_person_memories to service_role;
-- Human owners may inspect, correct, or erase memories about themselves.
grant select, delete on public.chia_person_memories to authenticated;
grant update (content) on public.chia_person_memories to authenticated;

create policy chia_person_memory_owner_select on public.chia_person_memories
  for select to authenticated using (person_profile_id = (select auth.uid()));
create policy chia_person_memory_owner_update on public.chia_person_memories
  for update to authenticated
  using (person_profile_id = (select auth.uid()))
  with check (person_profile_id = (select auth.uid()));
create policy chia_person_memory_owner_delete on public.chia_person_memories
  for delete to authenticated using (person_profile_id = (select auth.uid()));

-- Add a fresh, unpredictable per-attempt lease.  A reused run_id is not a lease.
alter table public.chia_star_letter_reply_runs
  add column claim_token uuid not null default gen_random_uuid();

-- Keep pre-existing signatures and semantics available for a first attempt.
-- Wrap the existing functions so that fresh workers may safely use token-fenced
-- overloads, while a legacy worker cannot finish a reclaimed attempt.
alter function public.claim_chia_star_letter_reply_run(uuid, uuid)
  rename to claim_chia_star_letter_reply_run_legacy;
alter function public.complete_chia_star_letter_reply_run(uuid, uuid, text, text)
  rename to complete_chia_star_letter_reply_run_legacy;
alter function public.fail_chia_star_letter_reply_run(uuid, text)
  rename to fail_chia_star_letter_reply_run_legacy;

create function public.claim_chia_star_letter_reply_run(
  p_source_star_letter_id uuid,
  p_chia_profile_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_token uuid := gen_random_uuid();
begin
  v_result := public.claim_chia_star_letter_reply_run_legacy(
    p_source_star_letter_id, p_chia_profile_id
  );
  if coalesce((v_result ->> 'claimed')::boolean, false) then
    update public.chia_star_letter_reply_runs
       set claim_token = v_token
     where id = (v_result ->> 'run_id')::uuid;
    v_result := v_result || jsonb_build_object('claim_token', v_token);
  end if;
  return v_result;
end;
$$;

create function public.complete_chia_star_letter_reply_run(
  p_run_id uuid, p_chia_profile_id uuid, p_decision text, p_body text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_attempts integer;
begin
  select attempts into v_attempts
  from public.chia_star_letter_reply_runs where id = p_run_id for update;
  if v_attempts is not null and v_attempts > 1 then
    return jsonb_build_object('outcome', 'stale_claim');
  end if;
  return public.complete_chia_star_letter_reply_run_legacy(
    p_run_id, p_chia_profile_id, p_decision, p_body
  );
end;
$$;

create function public.complete_chia_star_letter_reply_run(
  p_run_id uuid, p_chia_profile_id uuid, p_decision text,
  p_body text, p_claim_token uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_token uuid;
begin
  select claim_token into v_token
  from public.chia_star_letter_reply_runs where id = p_run_id for update;
  if v_token is null then
    return jsonb_build_object('outcome', 'run_not_found');
  end if;
  if p_claim_token is distinct from v_token then
    return jsonb_build_object('outcome', 'stale_claim');
  end if;
  return public.complete_chia_star_letter_reply_run_legacy(
    p_run_id, p_chia_profile_id, p_decision, p_body
  );
end;
$$;

create function public.fail_chia_star_letter_reply_run(
  p_run_id uuid, p_error_code text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_attempts integer;
begin
  select attempts into v_attempts
  from public.chia_star_letter_reply_runs where id = p_run_id for update;
  if v_attempts is not null and v_attempts > 1 then
    return jsonb_build_object('outcome', 'stale_claim');
  end if;
  return public.fail_chia_star_letter_reply_run_legacy(p_run_id, p_error_code);
end;
$$;

create function public.fail_chia_star_letter_reply_run(
  p_run_id uuid, p_error_code text, p_claim_token uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_token uuid;
begin
  select claim_token into v_token
  from public.chia_star_letter_reply_runs where id = p_run_id for update;
  if v_token is null then
    return jsonb_build_object('outcome', 'run_not_found');
  end if;
  if p_claim_token is distinct from v_token then
    return jsonb_build_object('outcome', 'stale_claim');
  end if;
  return public.fail_chia_star_letter_reply_run_legacy(p_run_id, p_error_code);
end;
$$;

-- All six public/new and internal/legacy entrypoints remain server-only.
revoke all on function public.claim_chia_star_letter_reply_run_legacy(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_chia_star_letter_reply_run_legacy(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.fail_chia_star_letter_reply_run_legacy(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.claim_chia_star_letter_reply_run(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_chia_star_letter_reply_run(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_chia_star_letter_reply_run(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fail_chia_star_letter_reply_run(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_chia_star_letter_reply_run(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_chia_star_letter_reply_run(uuid, uuid) to service_role;
grant execute on function public.complete_chia_star_letter_reply_run(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_chia_star_letter_reply_run(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.fail_chia_star_letter_reply_run(uuid, text) to service_role;
grant execute on function public.fail_chia_star_letter_reply_run(uuid, text, uuid) to service_role;

commit;

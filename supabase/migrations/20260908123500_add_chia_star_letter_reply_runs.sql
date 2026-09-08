begin;

create table if not exists public.chia_star_letter_reply_runs (
  id uuid primary key default gen_random_uuid(),
  source_star_letter_id uuid not null unique references public.star_letters(id) on delete cascade,
  status text not null default 'processing' check (
    status in ('processing', 'retryable_failed', 'replied', 'skipped', 'failed')
  ),
  attempts integer not null default 1 check (attempts > 0 and attempts <= 3),
  reply_star_letter_id uuid references public.star_letters(id) on delete set null,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  next_attempt_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chia_star_letter_reply_runs is
  '星空ちあが自分の流星便へ届いた星文へ自動返信するための内部実行台帳';

alter table public.chia_star_letter_reply_runs enable row level security;
revoke all on table public.chia_star_letter_reply_runs from public, anon, authenticated;
grant select, insert, update on table public.chia_star_letter_reply_runs to service_role;

create index if not exists chia_star_letter_reply_runs_status_idx
on public.chia_star_letter_reply_runs(status, next_attempt_at, updated_at);

create or replace function public.claim_chia_star_letter_reply_run(
  p_source_star_letter_id uuid,
  p_chia_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_author_id uuid;
  v_post_id uuid;
  v_parent_star_letter_id uuid;
  v_post_author_id uuid;
  v_parent_author_id uuid;
  v_existing_reply_id uuid;
  v_run_id uuid;
  v_attempts integer;
begin
  if p_source_star_letter_id is null or p_chia_profile_id is null then
    return jsonb_build_object('claimed', false, 'outcome', 'invalid_payload');
  end if;

  select sl.author_id, sl.post_id, sl.parent_star_letter_id, p.author_id
  into v_source_author_id, v_post_id, v_parent_star_letter_id, v_post_author_id
  from public.star_letters sl
  join public.posts p on p.id = sl.post_id
  where sl.id = p_source_star_letter_id
    and sl.deleted_at is null
    and p.deleted_at is null;

  if not found then
    return jsonb_build_object('claimed', false, 'outcome', 'source_not_found');
  end if;

  if v_post_author_id <> p_chia_profile_id
    or v_source_author_id = p_chia_profile_id
    or not exists (
      select 1
      from public.profile_kinds pk
      where pk.profile_id = v_source_author_id
        and pk.kind = 'human'
    )
  then
    return jsonb_build_object('claimed', false, 'outcome', 'not_eligible');
  end if;

  if v_parent_star_letter_id is not null then
    select author_id
    into v_parent_author_id
    from public.star_letters
    where id = v_parent_star_letter_id
      and deleted_at is null;

    if not found or v_parent_author_id <> p_chia_profile_id then
      return jsonb_build_object('claimed', false, 'outcome', 'not_direct_conversation');
    end if;
  end if;

  if exists (
    select 1
    from public.profile_blocks b
    where (b.blocker_id = v_source_author_id and b.blocked_id = p_chia_profile_id)
       or (b.blocker_id = p_chia_profile_id and b.blocked_id = v_source_author_id)
  ) then
    return jsonb_build_object('claimed', false, 'outcome', 'blocked');
  end if;

  select sl.id
  into v_existing_reply_id
  from public.star_letters sl
  where sl.parent_star_letter_id = p_source_star_letter_id
    and sl.author_id = p_chia_profile_id
    and sl.deleted_at is null
  order by sl.created_at asc
  limit 1;

  if v_existing_reply_id is not null then
    update public.chia_star_letter_reply_runs
    set
      status = 'replied',
      reply_star_letter_id = v_existing_reply_id,
      error_code = null,
      next_attempt_at = null,
      processed_at = coalesce(processed_at, now()),
      updated_at = now()
    where source_star_letter_id = p_source_star_letter_id
      and status <> 'replied';

    return jsonb_build_object(
      'claimed', false,
      'outcome', 'already_replied',
      'reply_star_letter_id', v_existing_reply_id
    );
  end if;

  insert into public.chia_star_letter_reply_runs (
    source_star_letter_id,
    status,
    attempts
  )
  values (
    p_source_star_letter_id,
    'processing',
    1
  )
  on conflict (source_star_letter_id) do update
  set
    status = 'processing',
    attempts = public.chia_star_letter_reply_runs.attempts + 1,
    error_code = null,
    next_attempt_at = null,
    updated_at = now()
  where (
      public.chia_star_letter_reply_runs.status = 'retryable_failed'
      and public.chia_star_letter_reply_runs.attempts < 3
      and coalesce(public.chia_star_letter_reply_runs.next_attempt_at, now()) <= now()
    )
    or (
      public.chia_star_letter_reply_runs.status = 'processing'
      and public.chia_star_letter_reply_runs.attempts < 3
      and public.chia_star_letter_reply_runs.updated_at < now() - interval '15 minutes'
    )
  returning id, attempts into v_run_id, v_attempts;

  if v_run_id is null then
    return jsonb_build_object('claimed', false, 'outcome', 'already_handled');
  end if;

  return jsonb_build_object(
    'claimed', true,
    'outcome', 'claimed',
    'run_id', v_run_id,
    'attempts', v_attempts
  );
end;
$function$;

create or replace function public.complete_chia_star_letter_reply_run(
  p_run_id uuid,
  p_chia_profile_id uuid,
  p_decision text,
  p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_source_star_letter_id uuid;
  v_source_author_id uuid;
  v_post_id uuid;
  v_parent_star_letter_id uuid;
  v_post_author_id uuid;
  v_reply_star_letter_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if p_run_id is null
    or p_chia_profile_id is null
    or p_decision not in ('reply', 'skip')
    or (p_decision = 'reply' and (v_body = '' or char_length(v_body) > 500))
  then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  select status, source_star_letter_id
  into v_status, v_source_star_letter_id
  from public.chia_star_letter_reply_runs
  where id = p_run_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'run_not_found');
  end if;

  if v_status = 'replied' then
    select reply_star_letter_id
    into v_reply_star_letter_id
    from public.chia_star_letter_reply_runs
    where id = p_run_id;

    return jsonb_build_object(
      'outcome', 'already_replied',
      'reply_star_letter_id', v_reply_star_letter_id
    );
  end if;

  if v_status <> 'processing' then
    return jsonb_build_object('outcome', 'invalid_status');
  end if;

  select sl.author_id, sl.post_id, sl.parent_star_letter_id, p.author_id
  into v_source_author_id, v_post_id, v_parent_star_letter_id, v_post_author_id
  from public.star_letters sl
  join public.posts p on p.id = sl.post_id
  where sl.id = v_source_star_letter_id
    and sl.deleted_at is null
    and p.deleted_at is null;

  if not found
    or v_source_author_id = p_chia_profile_id
    or v_post_author_id <> p_chia_profile_id
    or not exists (
      select 1
      from public.profile_kinds pk
      where pk.profile_id = v_source_author_id
        and pk.kind = 'human'
    )
    or (
      v_parent_star_letter_id is not null
      and not exists (
        select 1
        from public.star_letters parent
        where parent.id = v_parent_star_letter_id
          and parent.deleted_at is null
          and parent.author_id = p_chia_profile_id
      )
    )
    or exists (
      select 1
      from public.profile_blocks b
      where (b.blocker_id = v_source_author_id and b.blocked_id = p_chia_profile_id)
         or (b.blocker_id = p_chia_profile_id and b.blocked_id = v_source_author_id)
    )
  then
    update public.chia_star_letter_reply_runs
    set
      status = 'skipped',
      error_code = 'source_no_longer_eligible',
      next_attempt_at = null,
      processed_at = now(),
      updated_at = now()
    where id = p_run_id;

    return jsonb_build_object('outcome', 'skipped');
  end if;

  if p_decision = 'skip' then
    update public.chia_star_letter_reply_runs
    set
      status = 'skipped',
      error_code = 'ai_declined',
      next_attempt_at = null,
      processed_at = now(),
      updated_at = now()
    where id = p_run_id;

    return jsonb_build_object('outcome', 'skipped');
  end if;

  insert into public.star_letters (
    post_id,
    author_id,
    body,
    parent_star_letter_id,
    client_request_id
  )
  values (
    v_post_id,
    p_chia_profile_id,
    v_body,
    v_source_star_letter_id,
    v_source_star_letter_id
  )
  on conflict (author_id, client_request_id)
    where client_request_id is not null
  do nothing
  returning id into v_reply_star_letter_id;

  if v_reply_star_letter_id is null then
    select id
    into v_reply_star_letter_id
    from public.star_letters
    where author_id = p_chia_profile_id
      and client_request_id = v_source_star_letter_id
      and parent_star_letter_id = v_source_star_letter_id
      and deleted_at is null
    limit 1;
  end if;

  if v_reply_star_letter_id is null then
    raise exception 'reply insert did not produce an id' using errcode = 'P0001';
  end if;

  update public.chia_star_letter_reply_runs
  set
    status = 'replied',
    reply_star_letter_id = v_reply_star_letter_id,
    error_code = null,
    next_attempt_at = null,
    processed_at = now(),
    updated_at = now()
  where id = p_run_id;

  return jsonb_build_object(
    'outcome', 'replied',
    'reply_star_letter_id', v_reply_star_letter_id
  );
end;
$function$;

create or replace function public.fail_chia_star_letter_reply_run(
  p_run_id uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempts integer;
  v_status text;
  v_next_attempt_at timestamptz;
begin
  if p_run_id is null or char_length(btrim(coalesce(p_error_code, ''))) > 120 then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  select attempts, status
  into v_attempts, v_status
  from public.chia_star_letter_reply_runs
  where id = p_run_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'run_not_found');
  end if;

  if v_status <> 'processing' then
    return jsonb_build_object('outcome', 'invalid_status');
  end if;

  if v_attempts >= 3 then
    v_status := 'failed';
    v_next_attempt_at := null;
  else
    v_status := 'retryable_failed';
    v_next_attempt_at := now() + case v_attempts
      when 1 then interval '5 minutes'
      else interval '30 minutes'
    end;
  end if;

  update public.chia_star_letter_reply_runs
  set
    status = v_status,
    error_code = left(btrim(coalesce(p_error_code, 'unknown')), 120),
    next_attempt_at = v_next_attempt_at,
    updated_at = now()
  where id = p_run_id;

  return jsonb_build_object(
    'outcome', v_status,
    'next_attempt_at', v_next_attempt_at
  );
end;
$function$;

revoke all on function public.claim_chia_star_letter_reply_run(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_chia_star_letter_reply_run(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_chia_star_letter_reply_run(uuid, text)
  from public, anon, authenticated;

grant execute on function public.claim_chia_star_letter_reply_run(uuid, uuid)
  to service_role;
grant execute on function public.complete_chia_star_letter_reply_run(uuid, uuid, text, text)
  to service_role;
grant execute on function public.fail_chia_star_letter_reply_run(uuid, text)
  to service_role;

commit;

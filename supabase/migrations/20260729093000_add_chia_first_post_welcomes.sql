-- Guarantee one Chia welcome for an author's first public, non-deleted post.
-- This migration is additive and is not applied by this change.

begin;

create table if not exists public.chia_first_post_welcomes (
  author_id uuid primary key references public.profiles(id) on delete cascade,
  first_post_id uuid references public.posts(id) on delete set null,
  star_letter_id uuid references public.star_letters(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.chia_first_post_welcomes is
  '星空ちあが利用者の最初の流星便へ歓迎星文を確定した一度限りの記録。投稿削除後もauthor_id行を残し再歓迎を防ぐ。';
comment on column public.chia_first_post_welcomes.first_post_id is
  '歓迎対象だった最初の流星便。投稿削除時はnullになるが、歓迎済みのauthor_id記録は残す。';

create index if not exists chia_first_post_welcomes_star_letter_id_idx
  on public.chia_first_post_welcomes(star_letter_id);

alter table public.chia_first_post_welcomes enable row level security;
revoke all on table public.chia_first_post_welcomes from public, anon, authenticated;
grant select, insert, update, delete on table public.chia_first_post_welcomes to service_role;

alter table public.ai_observation_jobs
  drop constraint if exists ai_observation_jobs_observation_context_check;
alter table public.ai_observation_jobs
  add constraint ai_observation_jobs_observation_context_check
  check (observation_context in ('manual', 'auto_text_post', 'first_post_welcome'));

comment on column public.ai_observation_jobs.observation_context
is 'AI観測jobの実行文脈。manual、通常text自動観測(auto_text_post)、初公開流星便歓迎(first_post_welcome)のみ。';

create or replace function app_private.is_chia_first_public_post(p_post_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts target
    where target.id = p_post_id
      and target.visibility = 'public'
      and target.deleted_at is null
      and target.type in ('text', 'image', 'video', 'youtube')
      and not exists (
        select 1
        from public.chia_first_post_welcomes w
        where w.author_id = target.author_id
      )
      and not exists (
        select 1
        from public.posts earlier
        where earlier.author_id = target.author_id
          and earlier.visibility = 'public'
          and earlier.deleted_at is null
          and (earlier.created_at, earlier.id) < (target.created_at, target.id)
      )
  );
$$;

revoke all on function app_private.is_chia_first_public_post(uuid)
from public, anon, authenticated;

create or replace function public.get_chia_first_post_welcome_candidate(p_post_id uuid)
returns table (is_first_post_welcome boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
begin
  if p_post_id is null then
    return query select false;
    return;
  end if;

  select *
    into v_post
  from public.posts p
  where p.id = p_post_id
  for share;

  if not found
    or v_post.visibility <> 'public'
    or v_post.deleted_at is not null
  then
    return query select false;
    return;
  end if;

  return query
  select app_private.is_chia_first_public_post(v_post.id);
end;
$$;

create or replace function public.reserve_chia_first_post_welcome_job(
  p_post_id uuid,
  p_requested_by uuid,
  p_ai_resident_key text,
  p_provider text,
  p_model text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_observation_context text,
  p_not_before_at timestamptz,
  p_input_kind text,
  p_input_size_bytes bigint,
  p_input_duration_seconds numeric,
  p_reserved_cost_micro_usd bigint,
  p_max_attempts integer,
  p_daily_request_limit integer,
  p_monthly_request_limit integer,
  p_daily_cost_limit_micro_usd bigint,
  p_monthly_cost_limit_micro_usd bigint,
  p_min_seconds_between_requests integer
)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  observation_context text,
  not_before_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_reservation record;
begin
  if p_observation_context <> 'first_post_welcome' then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  select *
    into v_post
  from public.posts p
  where p.id = p_post_id
  for share;

  if not found then
    outcome := 'not_first_post';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('chia_first_post_welcome:' || v_post.author_id::text)::bigint
  );

  if not app_private.is_chia_first_public_post(v_post.id) then
    outcome := 'not_first_post';
    return next;
    return;
  end if;

  select *
    into v_reservation
  from public.reserve_ai_observation_job(
    p_post_id,
    p_requested_by,
    p_ai_resident_key,
    p_provider,
    p_model,
    p_idempotency_key,
    p_request_fingerprint,
    'auto_text_post',
    p_not_before_at,
    p_input_kind,
    p_input_size_bytes,
    p_input_duration_seconds,
    p_reserved_cost_micro_usd,
    p_max_attempts,
    p_daily_request_limit,
    p_monthly_request_limit,
    p_daily_cost_limit_micro_usd,
    p_monthly_cost_limit_micro_usd,
    p_min_seconds_between_requests
  );

  if v_reservation.outcome = 'reserved' then
    update public.ai_observation_jobs j
      set observation_context = 'first_post_welcome'
    where j.id = v_reservation.job_id;

    v_reservation.observation_context := 'first_post_welcome';
  end if;

  outcome := v_reservation.outcome;
  job_id := v_reservation.job_id;
  job_status := v_reservation.job_status;
  observation_context := v_reservation.observation_context;
  not_before_at := v_reservation.not_before_at;
  return next;
end;
$$;

-- The 15-argument implementation is the authoritative completion path for
-- first-post welcomes. The existing 13- and 11-argument signatures remain
-- callable through wrappers below so migration and Function deploy order is safe.
create or replace function public.complete_ai_observation_job(
  p_job_id uuid,
  p_chia_profile_id uuid,
  p_expected_request_fingerprint text,
  p_observed_points jsonb,
  p_analysis_summary text,
  p_should_post boolean,
  p_star_letter_body text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_actual_cost_micro_usd bigint,
  p_auto_star_letter_daily_limit integer,
  p_auto_star_letter_author_cooldown_seconds integer,
  p_first_post_fallback_star_letter_body text,
  p_is_first_post_fallback boolean
)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  observation_id uuid,
  star_letter_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
  v_current_request_fingerprint text;
  v_observation_id uuid;
  v_star_letter_id uuid;
  v_post public.posts%rowtype;
  v_should_post boolean;
  v_star_letter_body text;
  v_is_first_post_welcome boolean := false;
  v_actual_cost_micro_usd bigint;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_daily_star_letters bigint;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status = 'succeeded' then
    outcome := 'already_succeeded';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  if v_job.status <> 'processing' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_chia_profile_id
      and p.username = 'chia_hoshizora'
  ) then
    outcome := 'chia_profile_mismatch';
    return next;
    return;
  end if;

  if p_observed_points is null
    or jsonb_typeof(p_observed_points) <> 'array'
    or p_expected_request_fingerprint is null
    or p_expected_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_input_tokens is null
    or p_output_tokens is null
    or p_total_tokens is null
    or p_actual_cost_micro_usd is null
    or p_should_post is null
    or p_is_first_post_fallback is null
    or p_auto_star_letter_daily_limit is null
    or p_auto_star_letter_daily_limit < 0
    or p_auto_star_letter_author_cooldown_seconds is null
    or p_auto_star_letter_author_cooldown_seconds < 0
    or p_input_tokens < 0
    or p_output_tokens < 0
    or p_total_tokens < p_input_tokens + p_output_tokens
    or p_actual_cost_micro_usd < 0
    or (p_should_post and (
      p_star_letter_body is null
      or p_star_letter_body <> btrim(p_star_letter_body)
      or char_length(p_star_letter_body) < 20
      or char_length(p_star_letter_body) > 80
      or p_star_letter_body ~ '[\r\n#]'
      or p_star_letter_body ~ 'https?://'
    ))
    or ((not p_should_post) and p_star_letter_body is not null)
    or (p_first_post_fallback_star_letter_body is not null and (
      p_first_post_fallback_star_letter_body <> btrim(p_first_post_fallback_star_letter_body)
      or char_length(p_first_post_fallback_star_letter_body) < 20
      or char_length(p_first_post_fallback_star_letter_body) > 80
      or p_first_post_fallback_star_letter_body ~ '[\r\n#]'
      or p_first_post_fallback_star_letter_body ~ 'https?://'
    ))
  then
    outcome := 'invalid_payload';
    return next;
    return;
  end if;

  v_current_request_fingerprint := app_private.ai_observation_current_request_fingerprint(v_job.post_id);

  if v_current_request_fingerprint is null
    or v_current_request_fingerprint <> v_job.request_fingerprint
    or v_current_request_fingerprint <> p_expected_request_fingerprint
  then
    outcome := 'post_changed';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  -- Keep the post stable while deciding its welcome eligibility and completing.
  select *
    into v_post
  from public.posts p
  where p.id = v_job.post_id
  for update;

  if not found
    or v_post.visibility <> 'public'
    or v_post.deleted_at is not null
  then
    outcome := 'post_changed';
    job_id := v_job.id;
    job_status := v_job.status::text;
    return next;
    return;
  end if;

  if v_job.observation_context in ('auto_text_post', 'first_post_welcome') then
    -- One serial decision per author prevents two first-post workers from both
    -- passing the no-welcome check before either inserts the durable record.
    perform pg_advisory_xact_lock(hashtext('chia_first_post_welcome:' || v_post.author_id::text)::bigint);

    select app_private.is_chia_first_public_post(v_post.id)
      into v_is_first_post_welcome;
  end if;

  if v_job.observation_context = 'first_post_welcome'
    and not v_is_first_post_welcome
  then
    update public.ai_observation_jobs j
      set status = 'cancelled',
          public_error_code = 'FIRST_POST_NOT_ELIGIBLE',
          completed_at = now()
    where j.id = p_job_id
    returning * into v_job;

    outcome := 'cancelled';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  if p_is_first_post_fallback and not v_is_first_post_welcome then
    outcome := 'invalid_payload';
    return next;
    return;
  end if;

  v_should_post := p_should_post;
  v_star_letter_body := p_star_letter_body;
  v_actual_cost_micro_usd := p_actual_cost_micro_usd;

  if v_is_first_post_welcome then
    -- First-post welcome bypasses probability, per-author cooldown, and daily
    -- letter limits. A fallback uses the job reservation rather than recording
    -- an unknown provider call as a false zero-cost success.
    if p_is_first_post_fallback or not v_should_post then
      if p_first_post_fallback_star_letter_body is null then
        outcome := 'invalid_payload';
        return next;
        return;
      end if;

      v_should_post := true;
      v_star_letter_body := p_first_post_fallback_star_letter_body;
    end if;

    if p_is_first_post_fallback then
      v_actual_cost_micro_usd := greatest(p_actual_cost_micro_usd, v_job.reserved_cost_micro_usd);
    end if;
  elsif v_job.observation_context = 'auto_text_post' and v_should_post then
    perform pg_advisory_xact_lock(hashtext('ai_observation_star_letters:hoshizora_chia')::bigint);

    select count(*)
      into v_daily_star_letters
    from public.star_letters sl
    where sl.author_id = p_chia_profile_id
      and sl.created_at >= v_day_start;

    if v_daily_star_letters >= p_auto_star_letter_daily_limit
      or (
        p_auto_star_letter_author_cooldown_seconds > 0
        and exists (
          select 1
          from public.star_letters sl
          join public.posts p on p.id = sl.post_id
          where sl.author_id = p_chia_profile_id
            and p.author_id = v_post.author_id
            and sl.created_at > now() - make_interval(secs => p_auto_star_letter_author_cooldown_seconds)
        )
      )
    then
      v_should_post := false;
      v_star_letter_body := null;
    end if;
  end if;

  insert into public.observations (
    post_id, observer_id, observer_type, ai_resident_key, observation_type,
    analysis_summary, observed_points, should_comment, comment,
    should_recommend, recommendation_message, x_post_draft
  )
  values (
    v_job.post_id, p_chia_profile_id, 'ai_resident', 'hoshizora_chia',
    'ai_observation', nullif(left(coalesce(p_analysis_summary, ''), 1200), ''),
    p_observed_points, v_should_post, v_star_letter_body, false, null, null
  )
  returning id into v_observation_id;

  if v_job.observation_context in ('auto_text_post', 'first_post_welcome') then
    insert into public.resonances (post_id, profile_id, resonance_type)
    values (v_job.post_id, p_chia_profile_id, 'silent');
  end if;

  if v_should_post then
    insert into public.star_letters (post_id, author_id, body)
    values (v_job.post_id, p_chia_profile_id, v_star_letter_body)
    returning id into v_star_letter_id;
  end if;

  if v_is_first_post_welcome then
    insert into public.chia_first_post_welcomes (author_id, first_post_id, star_letter_id)
    values (v_post.author_id, v_job.post_id, v_star_letter_id);
  end if;

  update public.ai_observation_jobs j
    set status = 'succeeded',
        observation_id = v_observation_id,
        star_letter_id = v_star_letter_id,
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        total_tokens = p_total_tokens,
        actual_cost_micro_usd = v_actual_cost_micro_usd,
        public_error_code = null,
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'completed';
  job_id := v_job.id;
  job_status := v_job.status::text;
  observation_id := v_observation_id;
  star_letter_id := v_star_letter_id;
  return next;
end;
$$;

create or replace function public.complete_ai_observation_job(
  p_job_id uuid,
  p_chia_profile_id uuid,
  p_expected_request_fingerprint text,
  p_observed_points jsonb,
  p_analysis_summary text,
  p_should_post boolean,
  p_star_letter_body text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_actual_cost_micro_usd bigint,
  p_auto_star_letter_daily_limit integer,
  p_auto_star_letter_author_cooldown_seconds integer
)
returns table (outcome text, job_id uuid, job_status text, observation_id uuid, star_letter_id uuid)
language sql
security definer
set search_path = ''
as $$
  select * from public.complete_ai_observation_job(
    p_job_id, p_chia_profile_id, p_expected_request_fingerprint,
    p_observed_points, p_analysis_summary, p_should_post, p_star_letter_body,
    p_input_tokens, p_output_tokens, p_total_tokens, p_actual_cost_micro_usd,
    p_auto_star_letter_daily_limit, p_auto_star_letter_author_cooldown_seconds,
    '村人さん、最初の流星便を受け取ったよ。ここに届けてくれた光から、これからの星空が始まるね。', false
  );
$$;

create or replace function public.cancel_ai_observation_job(
  p_job_id uuid,
  p_public_error_code text default 'WORKER_DISPATCH_FAILED'
)
returns table (
  outcome text,
  job_id uuid,
  job_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status <> 'queued'
    and not (
      v_job.status = 'processing'
      and v_job.attempt_count = 0
      and p_public_error_code = 'FIRST_POST_NOT_ELIGIBLE'
    )
  then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    return next;
    return;
  end if;

  if p_public_error_code is null or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$' then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set status = 'cancelled',
        public_error_code = p_public_error_code,
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'cancelled';
  job_id := v_job.id;
  job_status := v_job.status::text;
  return next;
end;
$$;

revoke all on function public.get_chia_first_post_welcome_candidate(uuid) from public, anon, authenticated;
grant execute on function public.get_chia_first_post_welcome_candidate(uuid) to service_role;

revoke all on function public.reserve_chia_first_post_welcome_job(
  uuid, uuid, text, text, text, text, text, text, timestamptz, text,
  bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) from public, anon, authenticated;
grant execute on function public.reserve_chia_first_post_welcome_job(
  uuid, uuid, text, text, text, text, text, text, timestamptz, text,
  bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) to service_role;

revoke all on function public.cancel_ai_observation_job(uuid, text)
from public, anon, authenticated;
grant execute on function public.cancel_ai_observation_job(uuid, text)
to service_role;

revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer, text, boolean
) from public, anon, authenticated;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer, text, boolean
) to service_role;

revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer
) to service_role;

revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) from public, anon, authenticated;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) to service_role;

commit;

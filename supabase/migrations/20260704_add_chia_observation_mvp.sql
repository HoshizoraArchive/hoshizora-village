-- 星空Village 星空ちあ観測MVP.
-- Adds trusted server-side job state transition RPCs. Does not store secrets.

begin;

create or replace function app_private.ai_observation_json_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then 'null'
    else to_json(p_value)::text
  end;
$$;

create or replace function app_private.ai_observation_json_timestamptz(p_value timestamp with time zone)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then 'null'
    else to_json(p_value)::text
  end;
$$;

create or replace function app_private.ai_observation_json_number(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then 'null'
    when p_value = 0 then '0'
    else regexp_replace(
      regexp_replace(
        to_char(p_value, 'FM999999999999999999999999999990.999999999999999999'),
        '0+$',
        ''
      ),
      '\.$',
      ''
    )
  end;
$$;

create or replace function app_private.ai_observation_current_request_fingerprint(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_media public.post_media%rowtype;
  v_media_rows text := '';
  v_media_separator text := '';
  v_input_kind text;
  v_input_size_bytes numeric := 0;
  v_input_duration_seconds numeric := null;
  v_payload text;
begin
  select *
    into v_post
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found
    or v_post.visibility <> 'public'
    or v_post.deleted_at is not null
  then
    return null;
  end if;

  for v_media in
    select *
    from public.post_media pm
    where pm.post_id = p_post_id
    order by pm.sort_order, pm.id
    for share
  loop
    v_media_rows := v_media_rows || v_media_separator || concat(
      '{',
      '"durationSeconds":', app_private.ai_observation_json_number(v_media.duration_seconds), ',',
      '"id":', app_private.ai_observation_json_text(v_media.id::text), ',',
      '"mediaType":', app_private.ai_observation_json_text(v_media.media_type), ',',
      '"mimeType":', app_private.ai_observation_json_text(v_media.mime_type), ',',
      '"sizeBytes":', app_private.ai_observation_json_number(v_media.size_bytes::numeric), ',',
      '"sortOrder":', app_private.ai_observation_json_number(v_media.sort_order::numeric), ',',
      '"storagePath":', app_private.ai_observation_json_text(v_media.storage_path), ',',
      '"thumbnailStoragePath":', app_private.ai_observation_json_text(v_media.thumbnail_storage_path), ',',
      '"uploaderId":', app_private.ai_observation_json_text(v_media.uploader_id::text),
      '}'
    );
    v_media_separator := ',';

    if v_post.type = 'image' then
      v_input_size_bytes := v_input_size_bytes + coalesce(v_media.size_bytes, 0)::numeric;
    elsif v_post.type = 'video' and v_media.sort_order = 0 and v_input_duration_seconds is null then
      v_input_size_bytes := coalesce(v_media.size_bytes, 0)::numeric;
      v_input_duration_seconds := v_media.duration_seconds;
    end if;
  end loop;

  if v_post.type = 'image' then
    v_input_kind := 'image';
  elsif v_post.type = 'video' then
    v_input_kind := 'video';
  elsif v_post.type = 'youtube' then
    v_input_kind := 'youtube';
    v_input_size_bytes := 0;
    v_input_duration_seconds := null;
  else
    v_input_kind := 'text';
    v_input_size_bytes := 0;
    v_input_duration_seconds := null;
  end if;

  v_payload := concat(
    '{',
    '"aiResidentKey":', app_private.ai_observation_json_text('hoshizora_chia'), ',',
    '"body":', app_private.ai_observation_json_text(coalesce(v_post.body, '')), ',',
    '"media":{',
      '"inputDurationSeconds":', app_private.ai_observation_json_number(v_input_duration_seconds), ',',
      '"inputKind":', app_private.ai_observation_json_text(v_input_kind), ',',
      '"inputSizeBytes":', app_private.ai_observation_json_number(v_input_size_bytes),
    '},',
    '"mediaRows":[', v_media_rows, '],',
    '"postId":', app_private.ai_observation_json_text(v_post.id::text), ',',
    '"postType":', app_private.ai_observation_json_text(v_post.type), ',',
    '"updatedAt":', app_private.ai_observation_json_timestamptz(v_post.updated_at), ',',
    '"youtubeUrl":', app_private.ai_observation_json_text(v_post.youtube_url), ',',
    '"youtubeVideoId":', app_private.ai_observation_json_text(v_post.youtube_video_id),
    '}'
  );

  return encode(extensions.digest(v_payload, 'sha256'), 'hex');
end;
$$;

comment on function app_private.ai_observation_current_request_fingerprint(uuid)
is 'Recomputes the AI observation request fingerprint from locked current posts/post_media rows. Canonical field order mirrors netlify/functions/_shared/aiJobReservation.mjs.';

revoke all on function app_private.ai_observation_json_text(text) from public, anon, authenticated;
revoke all on function app_private.ai_observation_json_timestamptz(timestamp with time zone) from public, anon, authenticated;
revoke all on function app_private.ai_observation_json_number(numeric) from public, anon, authenticated;
revoke all on function app_private.ai_observation_current_request_fingerprint(uuid) from public, anon, authenticated;

create or replace function public.reserve_ai_observation_job(
  p_post_id uuid,
  p_requested_by uuid,
  p_ai_resident_key text,
  p_provider text,
  p_model text,
  p_idempotency_key text,
  p_request_fingerprint text,
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
  job_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_daily_requests bigint;
  v_monthly_requests bigint;
  v_daily_cost bigint;
  v_monthly_cost bigint;
begin
  if p_ai_resident_key <> 'hoshizora_chia'
    or p_provider <> 'gemini'
    or p_model <> 'gemini-3.5-flash'
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]{32,128}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_input_kind not in ('text', 'image', 'audio', 'video', 'youtube')
    or p_input_size_bytes < 0
    or p_reserved_cost_micro_usd < 1
    or p_max_attempts < 1
    or p_max_attempts > 10
    or p_daily_request_limit < 1
    or p_monthly_request_limit < 1
    or p_daily_cost_limit_micro_usd < 1
    or p_monthly_cost_limit_micro_usd < 1
    or p_min_seconds_between_requests < 0
  then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('ai_observation_jobs:global')::bigint);
  perform pg_advisory_xact_lock(hashtext('ai_observation_jobs:' || p_post_id::text || ':' || p_ai_resident_key)::bigint);

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and p.visibility = 'public'
      and p.deleted_at is null
      and p.type in ('text', 'image', 'video', 'youtube')
  ) then
    outcome := 'post_not_found';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.idempotency_key = p_idempotency_key
  ) then
    outcome := 'duplicate_idempotency';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status in ('queued', 'processing')
  ) then
    outcome := 'already_queued';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status = 'succeeded'
  ) then
    outcome := 'already_succeeded';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status = 'failed'
  ) then
    outcome := 'already_failed';
    return next;
    return;
  end if;

  if p_min_seconds_between_requests > 0 and exists (
    select 1
    from public.ai_observation_jobs j
    where j.requested_by = p_requested_by
      and j.created_at > now() - make_interval(secs => p_min_seconds_between_requests)
      and j.status in ('queued', 'processing', 'succeeded', 'failed')
  ) then
    outcome := 'retry_too_soon';
    return next;
    return;
  end if;

  select count(*),
    coalesce(sum(app_private.ai_observation_billable_cost_micro_usd(
      j.status,
      j.attempt_count,
      j.reserved_cost_micro_usd,
      j.actual_cost_micro_usd
    )), 0)
    into v_daily_requests, v_daily_cost
  from public.ai_observation_jobs j
  where j.created_at >= v_day_start
    and j.status in ('queued', 'processing', 'succeeded', 'failed');

  select count(*),
    coalesce(sum(app_private.ai_observation_billable_cost_micro_usd(
      j.status,
      j.attempt_count,
      j.reserved_cost_micro_usd,
      j.actual_cost_micro_usd
    )), 0)
    into v_monthly_requests, v_monthly_cost
  from public.ai_observation_jobs j
  where j.created_at >= v_month_start
    and j.status in ('queued', 'processing', 'succeeded', 'failed');

  if v_daily_requests >= p_daily_request_limit
    or v_monthly_requests >= p_monthly_request_limit
    or v_daily_cost + p_reserved_cost_micro_usd > p_daily_cost_limit_micro_usd
    or v_monthly_cost + p_reserved_cost_micro_usd > p_monthly_cost_limit_micro_usd
  then
    outcome := 'rate_limited';
    return next;
    return;
  end if;

  insert into public.ai_observation_jobs (
    post_id,
    requested_by,
    ai_resident_key,
    provider,
    model,
    status,
    idempotency_key,
    request_fingerprint,
    max_attempts,
    input_kind,
    input_size_bytes,
    input_duration_seconds,
    reserved_cost_micro_usd
  )
  values (
    p_post_id,
    p_requested_by,
    p_ai_resident_key,
    p_provider,
    p_model,
    'queued',
    p_idempotency_key,
    p_request_fingerprint,
    p_max_attempts,
    p_input_kind,
    p_input_size_bytes,
    p_input_duration_seconds,
    p_reserved_cost_micro_usd
  )
  returning id into v_job_id;

  outcome := 'reserved';
  job_id := v_job_id;
  job_status := 'queued';
  return next;

exception
  when unique_violation then
    outcome := 'already_queued';
    job_id := null;
    job_status := null;
    return next;
end;
$$;

create or replace function public.claim_ai_observation_job(p_job_id uuid)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  post_id uuid,
  request_fingerprint text,
  attempt_count integer,
  max_attempts integer,
  input_kind text,
  model text
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

  if v_job.status = 'queued' then
    update public.ai_observation_jobs j
      set status = 'processing',
          started_at = coalesce(j.started_at, now()),
          public_error_code = null
    where j.id = p_job_id
    returning * into v_job;
    outcome := 'claimed';
  else
    outcome := 'already_' || v_job.status::text;
  end if;

  job_id := v_job.id;
  job_status := v_job.status::text;
  post_id := v_job.post_id;
  request_fingerprint := v_job.request_fingerprint;
  attempt_count := v_job.attempt_count;
  max_attempts := v_job.max_attempts;
  input_kind := v_job.input_kind;
  model := v_job.model;
  return next;
end;
$$;

create or replace function public.start_ai_observation_attempt(p_job_id uuid)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  attempt_count integer,
  max_attempts integer
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

  if v_job.status <> 'processing' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    attempt_count := v_job.attempt_count;
    max_attempts := v_job.max_attempts;
    return next;
    return;
  end if;

  if v_job.attempt_count >= v_job.max_attempts then
    outcome := 'max_attempts_exceeded';
    job_id := v_job.id;
    job_status := v_job.status::text;
    attempt_count := v_job.attempt_count;
    max_attempts := v_job.max_attempts;
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set attempt_count = j.attempt_count + 1
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'attempt_started';
  job_id := v_job.id;
  job_status := v_job.status::text;
  attempt_count := v_job.attempt_count;
  max_attempts := v_job.max_attempts;
  return next;
end;
$$;

drop function if exists public.complete_ai_observation_job(
  uuid, uuid, jsonb, text, boolean, text, integer, integer, integer, bigint
);

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
  p_actual_cost_micro_usd bigint
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

  insert into public.observations (
    post_id,
    observer_id,
    observer_type,
    ai_resident_key,
    observation_type,
    analysis_summary,
    observed_points,
    should_comment,
    comment,
    should_recommend,
    recommendation_message,
    x_post_draft
  )
  values (
    v_job.post_id,
    p_chia_profile_id,
    'ai_resident',
    'hoshizora_chia',
    'ai_observation',
    nullif(left(coalesce(p_analysis_summary, ''), 1200), ''),
    p_observed_points,
    p_should_post,
    p_star_letter_body,
    false,
    null,
    null
  )
  returning id into v_observation_id;

  if p_should_post then
    insert into public.star_letters (
      post_id,
      author_id,
      body
    )
    values (
      v_job.post_id,
      p_chia_profile_id,
      p_star_letter_body
    )
    returning id into v_star_letter_id;
  end if;

  update public.ai_observation_jobs j
    set status = 'succeeded',
        observation_id = v_observation_id,
        star_letter_id = v_star_letter_id,
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        total_tokens = p_total_tokens,
        actual_cost_micro_usd = p_actual_cost_micro_usd,
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

create or replace function public.fail_ai_observation_job(
  p_job_id uuid,
  p_public_error_code text,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_total_tokens integer default null,
  p_actual_cost_micro_usd bigint default null
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

  if v_job.status in ('succeeded', 'failed', 'cancelled') then
    outcome := 'already_' || v_job.status::text;
    job_id := v_job.id;
    job_status := v_job.status::text;
    return next;
    return;
  end if;

  if p_public_error_code is null
    or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$'
    or (p_input_tokens is not null and p_input_tokens < 0)
    or (p_output_tokens is not null and p_output_tokens < 0)
    or (p_total_tokens is not null and p_total_tokens < 0)
    or (p_actual_cost_micro_usd is not null and p_actual_cost_micro_usd < 0)
  then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set status = 'failed',
        public_error_code = p_public_error_code,
        input_tokens = coalesce(p_input_tokens, j.input_tokens),
        output_tokens = coalesce(p_output_tokens, j.output_tokens),
        total_tokens = coalesce(p_total_tokens, j.total_tokens),
        actual_cost_micro_usd = coalesce(p_actual_cost_micro_usd, j.actual_cost_micro_usd),
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'failed';
  job_id := v_job.id;
  job_status := v_job.status::text;
  return next;
end;
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

  if v_job.status <> 'queued' then
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

comment on column public.ai_observation_jobs.actual_cost_micro_usd is 'AI実行後にprovider usageから推定した料金。Gemini 3.5 Flash Standardのpricing snapshotに基づくmicro USD整数で、請求書上の確定額ではない。';

revoke all on function public.reserve_ai_observation_job(
  uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) from public, anon, authenticated;
revoke all on function public.claim_ai_observation_job(uuid) from public, anon, authenticated;
revoke all on function public.start_ai_observation_attempt(uuid) from public, anon, authenticated;
revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) from public, anon, authenticated;
revoke all on function public.fail_ai_observation_job(
  uuid, text, integer, integer, integer, bigint
) from public, anon, authenticated;
revoke all on function public.cancel_ai_observation_job(uuid, text) from public, anon, authenticated;

grant execute on function public.reserve_ai_observation_job(
  uuid, uuid, text, text, text, text, text, text, bigint, numeric, bigint, integer, integer, integer, bigint, bigint, integer
) to service_role;
grant execute on function public.claim_ai_observation_job(uuid) to service_role;
grant execute on function public.start_ai_observation_attempt(uuid) to service_role;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) to service_role;
grant execute on function public.fail_ai_observation_job(
  uuid, text, integer, integer, integer, bigint
) to service_role;
grant execute on function public.cancel_ai_observation_job(uuid, text) to service_role;

commit;

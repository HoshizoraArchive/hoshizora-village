begin;

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

commit;
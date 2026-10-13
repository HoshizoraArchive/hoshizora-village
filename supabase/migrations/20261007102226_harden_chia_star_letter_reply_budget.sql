begin;

-- Preserve the existing eligibility/idempotency implementation as an owner-only
-- internal primitive. Browser roles and service_role must use the capped wrappers.
alter function public.claim_chia_star_letter_reply_run(uuid, uuid)
  rename to claim_chia_star_letter_reply_run_uncapped;

revoke all on function public.claim_chia_star_letter_reply_run_uncapped(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.claim_chia_star_letter_reply_run_v2(
  p_source_star_letter_id uuid,
  p_chia_profile_id uuid,
  p_daily_provider_call_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recent_attempts bigint;
  v_result jsonb;
  v_claimed boolean;
begin
  if p_source_star_letter_id is null
    or p_chia_profile_id is null
    or p_daily_provider_call_limit is null
    or p_daily_provider_call_limit < 1
    or p_daily_provider_call_limit > 1000
  then
    return jsonb_build_object('claimed', false, 'outcome', 'invalid_payload');
  end if;

  -- Scheduler invocations can overlap. Serialize the rolling provider-call budget
  -- before the existing claim RPC increments attempts so the limit is authoritative.
  perform pg_advisory_xact_lock(
    hashtext('chia_star_letter_reply_budget:' || p_chia_profile_id::text)::bigint
  );

  select coalesce(sum(run.attempts), 0)
    into v_recent_attempts
  from public.chia_star_letter_reply_runs run
  where run.updated_at >= now() - interval '24 hours';

  if v_recent_attempts >= p_daily_provider_call_limit then
    return jsonb_build_object(
      'claimed', false,
      'outcome', 'daily_limit',
      'recent_attempts', v_recent_attempts
    );
  end if;

  v_result := public.claim_chia_star_letter_reply_run_uncapped(
    p_source_star_letter_id,
    p_chia_profile_id
  );
  v_claimed := coalesce((v_result ->> 'claimed')::boolean, false);

  return v_result || jsonb_build_object(
    'recent_attempts', v_recent_attempts + case when v_claimed then 1 else 0 end
  );
end;
$function$;

-- Keep the old signature safe for an in-flight/previous Function deploy. It uses
-- the current beta default instead of leaving an uncapped compatibility hole.
create or replace function public.claim_chia_star_letter_reply_run(
  p_source_star_letter_id uuid,
  p_chia_profile_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select public.claim_chia_star_letter_reply_run_v2(
    p_source_star_letter_id,
    p_chia_profile_id,
    50
  );
$function$;

revoke all on function public.claim_chia_star_letter_reply_run_v2(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.claim_chia_star_letter_reply_run(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_chia_star_letter_reply_run_v2(uuid, uuid, integer)
  to service_role;
grant execute on function public.claim_chia_star_letter_reply_run(uuid, uuid)
  to service_role;

comment on function public.claim_chia_star_letter_reply_run_v2(uuid, uuid, integer) is
  '星空ちあ星文返信のprovider call予算を24時間rolling sum(attempts)でtransaction内予約してからclaimする。';
comment on function public.claim_chia_star_letter_reply_run(uuid, uuid) is
  '旧Function互換の安全なwrapper。provider call日次上限50でv2 claimへ委譲する。';

commit;

begin;

-- Authenticated clients must use the RPC so the throttle cannot be bypassed.
revoke insert on table public.resonances from public, anon, authenticated;
drop policy if exists resonances_insert_logged_in on public.resonances;

-- The user-wide window is checked first. Once it passes, at most 59 recent
-- rows remain for the narrower user/post check, so one composite index covers
-- both lookups without scanning a user's full resonance history.
create index if not exists resonances_profile_created_at_idx
  on public.resonances (profile_id, created_at desc);

create or replace function public.add_post_resonance_v1(
  p_post_id uuid,
  p_resonance_type text default 'sparkle'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_resonance_id uuid;
  v_count bigint;
  v_viewer_count bigint;
  v_revision bigint;
begin
  if v_user_id is null
    or p_post_id is null
    or p_resonance_type not in ('silent', 'sparkle', 'afterglow', 'life', 'world', 'deep')
  then
    raise exception 'invalid resonance payload' using errcode = '22023';
  end if;

  if not app_private.lock_accessible_post(p_post_id, v_user_id) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  -- Serialize all requests for this authenticated user. The lock is held until
  -- transaction end, so concurrent RPC calls cannot all pass the same count.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('post_resonance:' || v_user_id::text, 0)
  );

  if exists (
    select 1
    from public.resonances r
    where r.profile_id = v_user_id
      and r.created_at >= now() - interval '60 seconds'
    order by r.created_at desc
    offset 59
    limit 1
  ) then
    raise exception 'resonance rate limit exceeded' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.resonances r
    where r.profile_id = v_user_id
      and r.post_id = p_post_id
      and r.created_at >= now() - interval '10 seconds'
    order by r.created_at desc
    offset 19
    limit 1
  ) then
    raise exception 'resonance rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.resonances (post_id, profile_id, resonance_type)
  values (p_post_id, v_user_id, p_resonance_type)
  returning id into v_resonance_id;

  select
    count(*) filter (
      where not app_private.is_black_hole_between_profiles(v_user_id, r.profile_id)
    ),
    count(*) filter (where r.profile_id = v_user_id)
  into v_count, v_viewer_count
  from public.resonances r
  where r.post_id = p_post_id;

  select revision into v_revision
  from app_private.post_domain_revisions
  where post_id = p_post_id and domain = 'resonance';

  return jsonb_build_object(
    'outcome', 'created',
    'post_id', p_post_id,
    'resonance_id', v_resonance_id,
    'resonance_count', v_count,
    'viewer_resonance_count', v_viewer_count,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'resonance_revision', v_revision::text,
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  );
end;
$$;

revoke all on function public.add_post_resonance_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.add_post_resonance_v1(uuid, text)
  to authenticated;

commit;

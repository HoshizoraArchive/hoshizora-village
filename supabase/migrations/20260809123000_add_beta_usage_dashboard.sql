begin;

create or replace function public.get_beta_usage_dashboard(p_day date default null)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  event_count bigint,
  last_opened_at timestamptz,
  events jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, (timezone('Asia/Tokyo', now()))::date);
  v_start timestamptz := (v_day::timestamp at time zone 'Asia/Tokyo');
  v_end timestamptz := ((v_day + 1)::timestamp at time zone 'Asia/Tokyo');
begin
  if not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select
    p.id as profile_id,
    p.display_name,
    p.username,
    count(e.id)::bigint as event_count,
    max(e.opened_at) as last_opened_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'opened_at', e.opened_at,
          'source', e.source,
          'app_mode', e.app_mode,
          'platform', e.platform
        )
        order by e.opened_at
      ) filter (where e.id is not null),
      '[]'::jsonb
    ) as events
  from public.profile_cohorts pc
  join public.profiles p
    on p.id = pc.profile_id
  left join public.app_open_events e
    on e.user_id = p.id
   and e.opened_at >= v_start
   and e.opened_at < v_end
  where pc.cohort_key = 'beta_resident'
  group by p.id, p.display_name, p.username, pc.joined_at
  order by pc.joined_at asc, p.display_name asc;
end;
$$;

comment on function public.get_beta_usage_dashboard(date) is
'運営専用のβ利用集計。beta_resident cohortについて、指定した日本時間の日のapp_open_eventsだけを返す。';

revoke all on function public.get_beta_usage_dashboard(date) from public, anon;
grant execute on function public.get_beta_usage_dashboard(date) to authenticated;

commit;

begin;

create table if not exists public.signup_open_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  app_mode text not null check (app_mode in ('standalone', 'browser')),
  platform text not null check (platform in ('ios', 'android', 'desktop', 'other')),
  client_opened_at timestamptz not null,
  opened_at timestamptz not null default now(),
  constraint signup_open_events_visitor_id_unique unique (visitor_id)
);

comment on table public.signup_open_events is
'未ログイン利用者が入村手続き（会員登録）画面を開いた事実を、個人情報を保存せず1ブラウザセッション1件で記録する内部利用ログ。';
comment on column public.signup_open_events.visitor_id is
'ブラウザのsessionStorage内だけで保持するランダムUUID。同一セッション内の重複計測防止にのみ利用し、アカウントとは紐付けない。';
comment on column public.signup_open_events.app_mode is
'ホーム画面追加PWA等のstandalone表示か、通常browser表示か。';
comment on column public.signup_open_events.platform is
'生のUser-Agentを保存せず、ios/android/desktop/otherの粗い端末分類だけを保存する。';
comment on column public.signup_open_events.client_opened_at is
'端末側で会員登録画面を開いた瞬間の時刻。信頼できる集計基準はサーバー時刻opened_atを使用する。';
comment on column public.signup_open_events.opened_at is
'DBがイベントを受信したサーバー時刻。日次集計の正とする。';

create index if not exists signup_open_events_opened_at_idx
  on public.signup_open_events (opened_at desc);

alter table public.signup_open_events enable row level security;
revoke all on table public.signup_open_events from public, anon, authenticated;

drop function if exists public.record_signup_open(uuid, text, text, timestamptz);
create function public.record_signup_open(
  p_visitor_id uuid,
  p_app_mode text,
  p_platform text,
  p_client_opened_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_visitor_id is null then
    raise exception 'invalid_visitor_id' using errcode = '22023';
  end if;

  if p_app_mode not in ('standalone', 'browser') then
    raise exception 'invalid_app_mode' using errcode = '22023';
  end if;

  if p_platform not in ('ios', 'android', 'desktop', 'other') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  if p_client_opened_at is null then
    raise exception 'invalid_client_opened_at' using errcode = '22023';
  end if;

  insert into public.signup_open_events (
    visitor_id,
    app_mode,
    platform,
    client_opened_at
  )
  values (
    p_visitor_id,
    p_app_mode,
    p_platform,
    p_client_opened_at
  )
  on conflict (visitor_id) do nothing;
end;
$$;

revoke all on function public.record_signup_open(uuid, text, text, timestamptz) from public;
grant execute on function public.record_signup_open(uuid, text, text, timestamptz) to anon, authenticated;

drop function if exists public.get_signup_open_dashboard(date);
create function public.get_signup_open_dashboard(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Tokyo')::date);
  v_start timestamptz := v_day::timestamp at time zone 'Asia/Tokyo';
  v_end timestamptz := (v_day + 1)::timestamp at time zone 'Asia/Tokyo';
  v_event_count bigint;
  v_events jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)
  into v_event_count
  from public.signup_open_events e
  where e.opened_at >= v_start
    and e.opened_at < v_end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'opened_at', e.opened_at,
        'app_mode', e.app_mode,
        'platform', e.platform
      )
      order by e.opened_at desc
    ),
    '[]'::jsonb
  )
  into v_events
  from public.signup_open_events e
  where e.opened_at >= v_start
    and e.opened_at < v_end;

  return jsonb_build_object(
    'day', v_day,
    'event_count', v_event_count,
    'events', v_events
  );
end;
$$;

revoke all on function public.get_signup_open_dashboard(date) from public, anon;
grant execute on function public.get_signup_open_dashboard(date) to authenticated;

commit;

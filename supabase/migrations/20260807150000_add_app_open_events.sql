begin;

create table if not exists public.app_open_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('launch', 'foreground')),
  app_mode text not null check (app_mode in ('standalone', 'browser')),
  platform text not null check (platform in ('ios', 'android', 'desktop', 'other')),
  client_opened_at timestamptz not null,
  opened_at timestamptz not null default now()
);

comment on table public.app_open_events is
'ログイン済み村人が星空Villageを開いた時刻を記録する内部利用ログ。日次利用確認・継続率の計測に使う。';
comment on column public.app_open_events.source is
'launchはページ/PWAの初回表示、foregroundはバックグラウンドから再表示された時。';
comment on column public.app_open_events.app_mode is
'ホーム画面追加PWA等のstandalone表示か、通常browser表示か。';
comment on column public.app_open_events.platform is
'生のUser-Agentを保存せず、ios/android/desktop/otherの粗い端末分類だけを保存する。';
comment on column public.app_open_events.client_opened_at is
'端末側で開いた瞬間の時刻。信頼できる集計基準はサーバー時刻opened_atを使用する。';
comment on column public.app_open_events.opened_at is
'DBがイベントを受信したサーバー時刻。日次アクティブ判定の正とする。';

create index if not exists app_open_events_user_opened_at_idx
  on public.app_open_events (user_id, opened_at desc);

create index if not exists app_open_events_opened_at_idx
  on public.app_open_events (opened_at desc);

alter table public.app_open_events enable row level security;

revoke all on table public.app_open_events from anon, authenticated;
grant insert on table public.app_open_events to authenticated;

drop policy if exists app_open_events_insert_own on public.app_open_events;
create policy app_open_events_insert_own
on public.app_open_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

commit;

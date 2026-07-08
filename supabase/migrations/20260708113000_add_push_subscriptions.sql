-- Add server-managed Web Push subscriptions for R.Connect mobile notifications.
-- This migration only stores device subscriptions. It does not send Push
-- notifications automatically.

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check check (
    endpoint = btrim(endpoint)
    and endpoint <> ''
    and char_length(endpoint) <= 2048
    and endpoint like 'https://%'
  ),
  constraint push_subscriptions_p256dh_check check (
    p256dh = btrim(p256dh)
    and p256dh <> ''
    and char_length(p256dh) <= 512
  ),
  constraint push_subscriptions_auth_check check (
    auth = btrim(auth)
    and auth <> ''
    and char_length(auth) <= 256
  ),
  constraint push_subscriptions_user_agent_check check (
    user_agent is null or char_length(user_agent) <= 512
  )
);

comment on table public.push_subscriptions is
'R.ConnectスマホPush通知用の端末購読情報。Netlify Functionのservice_role経由でのみ登録し、このmigrationでは自動Push送信を実装しない。';
comment on column public.push_subscriptions.profile_id is
'購読端末を登録したプロフィール。ブラウザから直接insert/updateさせず、認証済みNetlify Functionが検証済みaccess tokenから設定する。';
comment on column public.push_subscriptions.endpoint is
'Web Push endpoint。端末購読の一意キー。';
comment on column public.push_subscriptions.p256dh is
'PushSubscription keys.p256dh。';
comment on column public.push_subscriptions.auth is
'PushSubscription keys.auth。';
comment on column public.push_subscriptions.disabled_at is
'将来の送信失敗時に購読を無効化するための時刻。このPRでは送信処理は行わない。';

create index if not exists push_subscriptions_profile_id_idx
on public.push_subscriptions(profile_id);

create index if not exists push_subscriptions_disabled_at_idx
on public.push_subscriptions(disabled_at);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update on table public.push_subscriptions to service_role;

commit;

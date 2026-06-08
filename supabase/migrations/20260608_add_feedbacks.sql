-- 星空Village feedback form migration
-- Execute this file in the Supabase SQL Editor after merging the PR.
-- Adds a private feedback inbox for logged-in beta testers without exposing other users' feedback.

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('不具合', '分かりにくい', '改善案', 'ほしい機能', '感想', 'その他')),
  body text not null check (
    char_length(trim(body)) > 0
    and char_length(trim(body)) <= 1000
  ),
  status text not null default 'new' check (status in ('new')),
  created_at timestamptz not null default now()
);

comment on table public.feedbacks is
  '星の目安箱。先行住民テスターから届いた不具合、感想、改善案を保存する。';

comment on column public.feedbacks.user_id is
  'フィードバックを送ったログインユーザー。ユーザー削除時はnullになる。';

comment on column public.feedbacks.type is
  'フィードバック種別。不具合、分かりにくい、改善案、ほしい機能、感想、その他。';

comment on column public.feedbacks.body is
  'フィードバック本文。MVPでは1000文字以内。';

comment on column public.feedbacks.status is
  '運営確認用ステータス。MVPではnewのみ。';

create index if not exists feedbacks_user_created_at_idx on public.feedbacks(user_id, created_at desc);
create index if not exists feedbacks_status_created_at_idx on public.feedbacks(status, created_at desc);

alter table public.feedbacks enable row level security;

revoke all on table public.feedbacks from anon, authenticated;
grant select, insert on table public.feedbacks to authenticated;

drop policy if exists feedbacks_select_own on public.feedbacks;
create policy feedbacks_select_own on public.feedbacks
for select to authenticated
using (user_id = auth.uid());

drop policy if exists feedbacks_insert_own on public.feedbacks;
create policy feedbacks_insert_own on public.feedbacks
for insert to authenticated
with check (user_id = auth.uid());

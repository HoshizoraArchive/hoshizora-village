-- 星空Village: 流星便ソフト削除MVP
-- 既存の流星便、共鳴、Archive、星文、通知は削除しません。

alter table public.posts
  add column if not exists deleted_at timestamptz;

comment on column public.posts.deleted_at is '流星便のソフト削除時刻。null のものだけ通常一覧に表示する。';

create index if not exists posts_deleted_at_idx on public.posts(deleted_at);
create index if not exists posts_visibility_deleted_created_at_idx
  on public.posts(visibility, deleted_at, created_at desc);

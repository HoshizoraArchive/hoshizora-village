-- Meteor tags MVP.
-- Adds searchable hashtag-style tags extracted from post bodies.

create table if not exists public.meteor_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0 and char_length(trim(name)) <= 30),
  normalized_name text not null unique check (char_length(trim(normalized_name)) > 0 and char_length(trim(normalized_name)) <= 30),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.meteor_tags is '流星タグ辞書。流星便本文中の#タグを検索・一覧化するために保存する。';
comment on column public.meteor_tags.name is '表示用の流星タグ名。最初に作成された自然な表記を維持する。';
comment on column public.meteor_tags.normalized_name is '検索・重複防止用の正規化名。クライアントでNFKC化し英字大小を畳む。';
comment on column public.meteor_tags.created_by is 'この流星タグを最初に作成したプロフィール。';

create table if not exists public.post_meteor_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.meteor_tags(id) on delete cascade,
  sort_order integer not null check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id),
  unique (post_id, sort_order)
);

comment on table public.post_meteor_tags is '流星便と流星タグの関連。1投稿最大3件まで保存する。';
comment on column public.post_meteor_tags.sort_order is '本文中で最初に現れた順序。0から2まで。';

create index if not exists meteor_tags_normalized_name_idx on public.meteor_tags(normalized_name);
create index if not exists meteor_tags_created_by_idx on public.meteor_tags(created_by);
create index if not exists post_meteor_tags_tag_id_idx on public.post_meteor_tags(tag_id);
create index if not exists post_meteor_tags_post_sort_order_idx on public.post_meteor_tags(post_id, sort_order);

alter table public.meteor_tags enable row level security;
alter table public.post_meteor_tags enable row level security;

revoke all on table public.meteor_tags from anon, authenticated;
grant select on table public.meteor_tags to anon, authenticated;
grant insert on table public.meteor_tags to authenticated;

revoke all on table public.post_meteor_tags from anon, authenticated;
grant select on table public.post_meteor_tags to anon, authenticated;
grant insert, delete on table public.post_meteor_tags to authenticated;

drop policy if exists meteor_tags_select_public on public.meteor_tags;
create policy meteor_tags_select_public on public.meteor_tags
for select using (true);

drop policy if exists meteor_tags_insert_authenticated on public.meteor_tags;
create policy meteor_tags_insert_authenticated on public.meteor_tags
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and char_length(trim(name)) > 0
  and char_length(trim(normalized_name)) > 0
);

drop policy if exists post_meteor_tags_select_visible on public.post_meteor_tags;
create policy post_meteor_tags_select_visible on public.post_meteor_tags
for select using (
  exists (
    select 1
    from public.posts p
    where p.id = public.post_meteor_tags.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = (select auth.uid())
      )
  )
);

drop policy if exists post_meteor_tags_insert_by_post_author on public.post_meteor_tags;
create policy post_meteor_tags_insert_by_post_author on public.post_meteor_tags
for insert to authenticated
with check (
  sort_order between 0 and 2
  and exists (
    select 1
    from public.posts p
    where p.id = public.post_meteor_tags.post_id
      and p.author_id = (select auth.uid())
      and p.deleted_at is null
  )
);

drop policy if exists post_meteor_tags_delete_by_post_author on public.post_meteor_tags;
create policy post_meteor_tags_delete_by_post_author on public.post_meteor_tags
for delete to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = public.post_meteor_tags.post_id
      and p.author_id = (select auth.uid())
  )
);

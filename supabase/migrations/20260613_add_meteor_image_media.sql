-- 星空Village meteor image media setup.
-- Run this in Supabase SQL Editor before using the 流星便画像投稿MVP.
-- This migration creates the public-read meteor-media bucket, adds post_media,
-- and relaxes posts image constraints so image metadata can live in post_media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meteor-media',
  'meteor-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_media_public_read'
  ) then
    create policy meteor_media_public_read
    on storage.objects
    for select
    to public
    using (bucket_id = 'meteor-media');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_media_insert_own_folder'
  ) then
    create policy meteor_media_insert_own_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'meteor-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_media_delete_own_folder'
  ) then
    create policy meteor_media_delete_own_folder
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'meteor-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;

alter table public.posts
  drop constraint if exists posts_body_or_media_present;

alter table public.posts
  add constraint posts_body_or_media_present check (
    char_length(trim(body)) > 0
    or type = 'image'
    or media_url is not null
    or youtube_url is not null
  );

alter table public.posts
  drop constraint if exists posts_media_requirements;

alter table public.posts
  add constraint posts_media_requirements check (
    type in ('text', 'image')
    or (type in ('audio', 'video') and media_url is not null)
    or (type = 'youtube' and youtube_url is not null and youtube_video_id is not null)
  );

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null default 'image' check (media_type in ('image')),
  storage_path text not null,
  sort_order integer not null check (sort_order between 0 and 3),
  mime_type text check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint check (size_bytes is null or (size_bytes > 0 and size_bytes <= 8388608)),
  created_at timestamptz not null default now(),
  unique (post_id, sort_order),
  unique (storage_path)
);

comment on table public.post_media is '流星便に添えるメディア。画像投稿MVPでは最大4枚の画像を保存する。';
comment on column public.post_media.storage_path is 'meteor-media bucket 内のStorage path。公開URLはクライアント側で生成する。';
comment on column public.post_media.sort_order is '同一流星便内の表示順。MVPでは0から3まで。';

create index if not exists post_media_post_id_idx on public.post_media(post_id);
create index if not exists post_media_post_sort_order_idx on public.post_media(post_id, sort_order);
create index if not exists post_media_uploader_id_idx on public.post_media(uploader_id);
create index if not exists post_media_storage_path_idx on public.post_media(storage_path);

alter table public.post_media enable row level security;

revoke all on table public.post_media from anon, authenticated;
grant select on table public.post_media to anon, authenticated;
grant insert, delete on table public.post_media to authenticated;

drop policy if exists post_media_select_visible on public.post_media;
create policy post_media_select_visible on public.post_media
for select using (
  exists (
    select 1 from public.posts p
    where p.id = public.post_media.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists post_media_insert_own_post on public.post_media;
create policy post_media_insert_own_post on public.post_media
for insert to authenticated
with check (
  uploader_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = public.post_media.post_id
      and p.author_id = auth.uid()
  )
);

drop policy if exists post_media_delete_own_upload on public.post_media;
create policy post_media_delete_own_upload on public.post_media
for delete to authenticated
using (uploader_id = auth.uid());

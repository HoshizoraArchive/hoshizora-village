-- 星空Village meteor short video media setup.
-- Run this in Supabase SQL Editor before using the 流星便動画投稿MVP.
-- This migration adds the public-read meteor-video bucket and extends post_media
-- so images and one short video per post can share the same metadata table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meteor-video',
  'meteor-video',
  true,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm']
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
      and policyname = 'meteor_video_public_read'
  ) then
    create policy meteor_video_public_read
    on storage.objects
    for select
    to public
    using (bucket_id = 'meteor-video');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_video_insert_own_folder'
  ) then
    create policy meteor_video_insert_own_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'meteor-video'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_video_delete_own_folder'
  ) then
    create policy meteor_video_delete_own_folder
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'meteor-video'
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
    or type in ('image', 'video')
    or media_url is not null
    or youtube_url is not null
  );

alter table public.posts
  drop constraint if exists posts_media_requirements;

alter table public.posts
  add constraint posts_media_requirements check (
    type in ('text', 'image', 'video')
    or (type = 'audio' and media_url is not null)
    or (type = 'youtube' and youtube_url is not null and youtube_video_id is not null)
  );

alter table public.posts
  drop constraint if exists posts_audio_video_duration_limit;

alter table public.posts
  add constraint posts_audio_video_duration_limit check (
    (type <> 'audio' or (duration_seconds is not null and duration_seconds <= 30))
    and (type <> 'video' or duration_seconds is null or duration_seconds <= 35)
  );

alter table public.post_media
  add column if not exists thumbnail_storage_path text,
  add column if not exists duration_seconds numeric;

alter table public.post_media
  drop constraint if exists post_media_media_type_check,
  drop constraint if exists post_media_sort_order_check,
  drop constraint if exists post_media_mime_type_check,
  drop constraint if exists post_media_size_bytes_check,
  drop constraint if exists post_media_storage_path_required,
  drop constraint if exists post_media_video_duration_check,
  drop constraint if exists post_media_image_size_check,
  drop constraint if exists post_media_video_size_check,
  drop constraint if exists post_media_thumbnail_mime_path_check;

alter table public.post_media
  add constraint post_media_media_type_check check (media_type in ('image', 'video')),
  add constraint post_media_storage_path_required check (char_length(trim(storage_path)) > 0),
  add constraint post_media_sort_order_check check (
    (media_type = 'image' and sort_order between 0 and 3)
    or (media_type = 'video' and sort_order = 0)
  ),
  add constraint post_media_mime_type_check check (
    (media_type = 'image' and (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')))
    or (media_type = 'video' and mime_type is not null and mime_type in ('video/mp4', 'video/quicktime', 'video/webm'))
  ),
  add constraint post_media_image_size_check check (
    media_type <> 'image'
    or size_bytes is null
    or (size_bytes > 0 and size_bytes <= 8388608)
  ),
  add constraint post_media_video_size_check check (
    media_type <> 'video'
    or (size_bytes is not null and size_bytes > 0 and size_bytes <= 104857600)
  ),
  add constraint post_media_video_duration_check check (
    media_type <> 'video'
    or (duration_seconds is not null and duration_seconds > 0 and duration_seconds <= 35)
  );

comment on table public.post_media is '流星便に添えるメディア。画像は最大4枚、動画は1投稿1本まで保存する。';
comment on column public.post_media.storage_path is '画像はmeteor-media、動画はmeteor-video bucket 内のStorage path。公開URLはクライアント側で生成する。';
comment on column public.post_media.thumbnail_storage_path is '動画カード用サムネイルのmeteor-media bucket内Storage path。未設定時はクライアントでプレースホルダー表示する。';
comment on column public.post_media.duration_seconds is '動画の再生時間。動画は35秒以内。画像ではnull。';
comment on column public.post_media.sort_order is '画像は0から3までの表示順。動画は0固定。';

create unique index if not exists post_media_one_video_per_post_idx
on public.post_media(post_id)
where media_type = 'video';

create index if not exists post_media_media_type_idx on public.post_media(media_type);
create index if not exists post_media_thumbnail_storage_path_idx on public.post_media(thumbnail_storage_path);

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.prevent_mixed_post_media()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.post_media existing
    where existing.post_id = new.post_id
      and existing.media_type <> new.media_type
      and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'A post cannot mix image and video media.';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prevent_mixed_post_media() from public, anon, authenticated;

drop trigger if exists post_media_prevent_mixed_media on public.post_media;
create trigger post_media_prevent_mixed_media
before insert or update on public.post_media
for each row
execute function app_private.prevent_mixed_post_media();

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

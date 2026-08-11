-- PREVIEW-V2 ONLY / DO NOT APPLY TO PRODUCTION.
-- Normalize the direct schema snapshot to the reviewed 20260616 migration and
-- the current Production catalog. No rows are read or changed.

begin;

alter table public.post_media
  drop constraint if exists post_media_check,
  drop constraint if exists post_media_check1,
  drop constraint if exists post_media_check2,
  drop constraint if exists post_media_storage_path_check,
  drop constraint if exists post_media_size_bytes_check,
  drop constraint if exists post_media_storage_path_required,
  drop constraint if exists post_media_sort_order_check,
  drop constraint if exists post_media_mime_type_check,
  drop constraint if exists post_media_image_size_check,
  drop constraint if exists post_media_video_size_check;

alter table public.post_media
  add constraint post_media_storage_path_required check (
    char_length(trim(storage_path)) > 0
  ),
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
  );

commit;

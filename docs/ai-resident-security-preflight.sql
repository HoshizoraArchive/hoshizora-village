-- AI resident security foundation preflight.
-- Read-only checks. Run before applying:
-- supabase/migrations/20260703_add_ai_observation_security_foundation.sql
--
-- If every violation count is 0, the Storage path owner CHECK constraints can
-- be applied. If any count is greater than 0, inspect the affected
-- public.post_media rows before applying the migration.
--
-- This file intentionally depends only on the existing public.post_media table.
-- It does not reference objects created by the AI resident security migration.

-- 01. Required owner-folder and path-shape checks for storage_path.
select
  '01_storage_path_preflight' as check_name,
  count(*) filter (
    where storage_path is null or storage_path = ''
  ) as empty_path_count,
  count(*) filter (
    where storage_path is not null
      and storage_path <> btrim(storage_path)
  ) as outer_whitespace_count,
  count(*) filter (
    where storage_path is not null
      and (storage_path ~ '^/' or storage_path ~ '/$')
  ) as edge_slash_count,
  count(*) filter (
    where storage_path is not null
      and position('/' in storage_path) = 0
  ) as missing_folder_separator_count,
  count(*) filter (
    where storage_path is not null
      and storage_path ~ '//'
  ) as empty_segment_count,
  count(*) filter (
    where storage_path is not null
      and storage_path ~ '(^|/)\.{1,2}(/|$)'
  ) as dot_segment_count,
  count(*) filter (
    where storage_path is not null
      and position(chr(92) in storage_path) > 0
  ) as backslash_count,
  count(*) filter (
    where storage_path is not null
      and position('%' in storage_path) > 0
  ) as percent_count,
  count(*) filter (
    where storage_path is not null
      and position('/' in storage_path) > 0
      and split_part(storage_path, '/', 1) <> uploader_id::text
  ) as owner_uuid_folder_mismatch_count,
  count(*) filter (
    where storage_path is not null
      and split_part(storage_path, '/', 1) <> uploader_id::text
  ) as first_segment_uploader_id_mismatch_count,
  count(*) filter (
    where storage_path is null
      or storage_path <> btrim(storage_path)
      or storage_path = ''
      or position('/' in storage_path) = 0
      or split_part(storage_path, '/', 1) <> uploader_id::text
      or storage_path ~ '^/'
      or storage_path ~ '/$'
      or storage_path ~ '//'
      or storage_path ~ '(^|/)\.{1,2}(/|$)'
      or position(chr(92) in storage_path) > 0
      or position('%' in storage_path) > 0
  ) as total_violation_count
from public.post_media;

-- 02. Required owner-folder and path-shape checks for thumbnail_storage_path.
-- Null thumbnails are allowed.
select
  '02_thumbnail_storage_path_preflight' as check_name,
  count(*) filter (
    where thumbnail_storage_path is not null
      and thumbnail_storage_path = ''
  ) as empty_path_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and thumbnail_storage_path <> btrim(thumbnail_storage_path)
  ) as outer_whitespace_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and (thumbnail_storage_path ~ '^/' or thumbnail_storage_path ~ '/$')
  ) as edge_slash_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and position('/' in thumbnail_storage_path) = 0
  ) as missing_folder_separator_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and thumbnail_storage_path ~ '//'
  ) as empty_segment_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and thumbnail_storage_path ~ '(^|/)\.{1,2}(/|$)'
  ) as dot_segment_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and position(chr(92) in thumbnail_storage_path) > 0
  ) as backslash_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and position('%' in thumbnail_storage_path) > 0
  ) as percent_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and position('/' in thumbnail_storage_path) > 0
      and split_part(thumbnail_storage_path, '/', 1) <> uploader_id::text
  ) as owner_uuid_folder_mismatch_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and split_part(thumbnail_storage_path, '/', 1) <> uploader_id::text
  ) as first_segment_uploader_id_mismatch_count,
  count(*) filter (
    where thumbnail_storage_path is not null
      and (
        thumbnail_storage_path <> btrim(thumbnail_storage_path)
        or thumbnail_storage_path = ''
        or position('/' in thumbnail_storage_path) = 0
        or split_part(thumbnail_storage_path, '/', 1) <> uploader_id::text
        or thumbnail_storage_path ~ '^/'
        or thumbnail_storage_path ~ '/$'
        or thumbnail_storage_path ~ '//'
        or thumbnail_storage_path ~ '(^|/)\.{1,2}(/|$)'
        or position(chr(92) in thumbnail_storage_path) > 0
        or position('%' in thumbnail_storage_path) > 0
      )
  ) as total_violation_count
from public.post_media;

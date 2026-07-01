-- 星空Village PR #48 follow-up hardening verification.
-- Read-only checks. Run after supabase/migrations/20260702_security_hardening.sql.

-- 01. Soft-deleted public posts should not be visible to anon/authenticated via policy.
select
  'posts_select_visible_policy' as check_name,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and tablename = 'posts'
  and policyname = 'posts_select_visible';

-- 02. Observations raw table should not have browser-role table privileges.
select
  'observations_browser_grants' as check_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'observations'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

-- 03. Meteor media/video buckets should be private with existing size/MIME limits.
select
  'storage_bucket_privacy' as check_name,
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('avatars', 'meteor-media', 'meteor-video')
order by id;

-- 04. Meteor media/video public-read policies should be gone, visible-post policies should exist.
select
  'storage_media_policies' as check_name,
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'meteor_media_public_read',
    'meteor_media_read_visible_post',
    'meteor_video_public_read',
    'meteor_video_read_visible_post'
  )
order by policyname;

-- 05. Existing media should not be orphaned or linked to hidden posts.
select
  'post_media_orphans' as check_name,
  count(*) as row_count
from public.post_media pm
left join public.posts p on p.id = pm.post_id
where p.id is null
union all
select
  'post_media_deleted_posts' as check_name,
  count(*) as row_count
from public.post_media pm
join public.posts p on p.id = pm.post_id
where p.deleted_at is not null
union all
select
  'post_media_private_posts' as check_name,
  count(*) as row_count
from public.post_media pm
join public.posts p on p.id = pm.post_id
where p.visibility <> 'public';

-- 06. Resonance notification duplicates should be removed and blocked by a partial unique index.
select
  'duplicate_resonance_notifications' as check_name,
  count(*) as duplicate_groups,
  coalesce(sum(notification_count - 1), 0) as extra_rows
from (
  select recipient_id, actor_id, post_id, count(*) as notification_count
  from public.notifications
  where type = 'resonance'
    and actor_id is not null
    and post_id is not null
  group by recipient_id, actor_id, post_id
  having count(*) > 1
) grouped;

select
  'resonance_unique_index' as check_name,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'notifications'
  and indexname = 'notifications_resonance_once_per_actor_post_idx';

-- 07. Browser roles should not have TRUNCATE, and PUBLIC should not have writes.
select
  'unexpected_browser_write_grants' as check_name,
  grantee,
  table_name,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  and (
    grantee = 'PUBLIC'
    or privilege_type = 'TRUNCATE'
  )
order by grantee, table_name, privilege_type;

-- 08. DB constraints should mirror frontend text limits.
select
  'text_limit_constraints' as check_name,
  conrelid::regclass::text as table_name,
  conname,
  pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conname in (
  'posts_body_500_chars',
  'star_letters_body_500_chars',
  'profile_tags_label_30_chars',
  'post_tags_label_30_chars'
)
order by table_name, conname;

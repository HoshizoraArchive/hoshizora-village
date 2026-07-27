-- Issue #97 interactive onboarding preflight.
-- Read-only and safe to run before the migration.

-- Required schemas, tables, and the shared updated_at trigger function.
select
  to_regnamespace('app_private') is not null as app_private_schema_exists,
  to_regclass('auth.users') is not null as auth_users_exists,
  to_regclass('public.posts') is not null as posts_exists,
  to_regclass('public.profiles') is not null as profiles_exists,
  to_regclass('public.archives') is not null as archives_exists,
  to_regclass('public.push_subscriptions') is not null as push_subscriptions_exists,
  to_regprocedure('public.set_updated_at()') is not null as set_updated_at_exists;

-- Existing users are intentionally not backfilled. Record this count before
-- migration so rollout review can distinguish existing and future signups.
select count(*) as existing_auth_user_count
from auth.users;

-- At least one public, undeleted post is needed for the Archive experience.
-- A zero count does not block migration, but new users will pause safely at the
-- Archive prompt until a suitable post exists.
select count(*) as onboarding_candidate_post_count
from public.posts
where visibility = 'public'
  and deleted_at is null;

-- The migration depends on these columns and does not mutate their data.
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'posts' and column_name in (
      'id',
      'author_id',
      'visibility',
      'deleted_at',
      'created_at'
    ))
    or (table_name = 'profiles' and column_name in (
      'id',
      'display_name',
      'avatar_url'
    ))
    or (table_name = 'archives' and column_name in (
      'profile_id',
      'post_id'
    ))
    or (table_name = 'push_subscriptions' and column_name in (
      'profile_id',
      'disabled_at'
    ))
  )
order by table_name, column_name;

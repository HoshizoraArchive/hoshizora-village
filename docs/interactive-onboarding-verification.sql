-- Issue #97 interactive onboarding post-migration verification.
-- Read-only: this file does not insert, update, or delete application data.

-- 1. Table, required columns, and RLS must exist.
select
  c.relrowsecurity as rls_enabled,
  to_regclass('public.user_onboarding_progress') is not null as table_exists
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'user_onboarding_progress';

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_onboarding_progress'
order by ordinal_position;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.user_onboarding_progress'::regclass
  and conname in (
    'user_onboarding_progress_current_step_check',
    'user_onboarding_progress_notification_permission_check',
    'user_onboarding_progress_welcome_video_status_check',
    'user_onboarding_progress_push_registration_status_check',
    'user_onboarding_progress_push_test_status_check',
    'user_onboarding_progress_completed_state_check'
  )
order by conname;

-- 2. Authenticated users may SELECT only their own row through RLS.
-- Direct INSERT / UPDATE / DELETE grants must remain absent.
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'user_onboarding_progress'
order by grantee, privilege_type;

select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'user_onboarding_progress'
order by policyname;

-- 3. Only authenticated may execute the transition RPC. Only service_role may
-- record the result of an actual server-side Web Push delivery.
select
  p.oid::regprocedure::text as function_signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'advance_initial_onboarding',
    'record_initial_onboarding_push_test'
  )
order by p.proname, p.oid::regprocedure::text;

-- 4. The Auth trigger creates progress only for users inserted after migration.
-- There is deliberately no backfill statement for existing auth.users rows.
select
  t.tgname as trigger_name,
  p.oid::regprocedure::text as trigger_function,
  t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal
  and t.tgname = 'auth_users_create_initial_onboarding_progress';

-- 5. Operational summary. Existing users should not suddenly receive rows;
-- only post-migration signups should appear here.
select
  current_step,
  count(*) as progress_count
from public.user_onboarding_progress
group by current_step
order by current_step;

select
  count(*) filter (where completed_at is null) as active_count,
  count(*) filter (where completed_at is not null) as completed_count,
  count(*) filter (
    where current_step = 'completed'
      and completed_at is null
  ) as invalid_completed_rows,
  count(*) filter (
    where current_step <> 'completed'
      and completed_at is not null
  ) as invalid_active_rows
from public.user_onboarding_progress;

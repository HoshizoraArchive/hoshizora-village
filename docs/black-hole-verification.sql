-- Issue #157 ブラックホール機能のread-only検証。
-- migration適用後の検証用Supabaseで実行する。本番データは変更しない。

select
  to_regclass('public.profile_blocks') is not null as profile_blocks_exists,
  (
    select relrowsecurity
    from pg_class
    where oid = to_regclass('public.profile_blocks')
  ) as rls_enabled;

select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profile_blocks',
    'profiles',
    'posts',
    'resonances',
    'archives',
    'notifications',
    'star_letters',
    'star_letter_archives'
  )
order by tablename, policyname;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'profile_blocks'
order by grantee, privilege_type;

select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('app_private', 'is_black_hole_between_profiles'),
  ('app_private', 'is_black_hole_between'),
  ('app_private', 'is_black_hole_protected'),
  ('public', 'block_profile'),
  ('public', 'unblock_profile'),
  ('public', 'get_my_profile_blocks'),
  ('public', 'is_notification_black_holed')
)
order by n.nspname, p.proname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'profile_blocks'
order by indexname;

-- Expected plan: profile_blocks_blocker_blocked_key or
-- profile_blocks_blocked_blocker_idx is used for each direction.
explain (costs off)
select 1
from public.profile_blocks relation
where (
  relation.blocker_id = '00000000-0000-0000-0000-000000000001'::uuid
  and relation.blocked_id = '00000000-0000-0000-0000-000000000002'::uuid
)
or (
  relation.blocker_id = '00000000-0000-0000-0000-000000000002'::uuid
  and relation.blocked_id = '00000000-0000-0000-0000-000000000001'::uuid
);

select
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema in ('public', 'auth')
  and trigger_name in (
    'profile_blocks_refresh_onboarding_target',
    'user_onboarding_progress_filter_black_hole_target_insert',
    'user_onboarding_progress_filter_black_hole_target_update'
  )
order by trigger_name;

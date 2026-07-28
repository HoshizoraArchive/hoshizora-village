-- Issue #108 star-letter conversation foundation post-migration verification.
-- Read-only: this file does not insert, update, or delete application data.
-- All anomaly_count values should be 0 before enabling the follow-up thread UI.

select
  '01_required_columns' as check_name,
  7 - count(*) as anomaly_count
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'star_letters' and column_name in (
      'parent_star_letter_id',
      'client_request_id',
      'edited_at',
      'deleted_at'
    ))
    or (table_name = 'notifications' and column_name = 'star_letter_id')
    or (table_name = 'star_letter_resonances' and column_name = 'client_request_id')
    or (table_name = 'star_letter_archives' and column_name = 'post_id')
  );

select
  '02_required_tables' as check_name,
  2 - count(*) as anomaly_count
from information_schema.tables
where table_schema = 'public'
  and table_name in ('star_letter_resonances', 'star_letter_archives');

select
  '03_required_rpcs' as check_name,
  6 - count(*) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_star_letter_thread',
    'create_star_letter_reply',
    'update_star_letter',
    'delete_star_letter',
    'add_star_letter_resonance',
    'set_star_letter_archive'
  );

select
  '04_rpc_security' as check_name,
  count(*) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_star_letter_thread',
    'create_star_letter_reply',
    'update_star_letter',
    'delete_star_letter',
    'add_star_letter_resonance',
    'set_star_letter_archive'
  )
  and (
    p.prosecdef is not true
    or pg_get_functiondef(p.oid) not like '%SET search_path TO %'
  );

select
  '05_mutation_rpc_browser_grants' as check_name,
  count(*) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
) as acl
left join pg_roles granted_role on granted_role.oid = acl.grantee
where n.nspname = 'public'
  and p.proname in (
    'create_star_letter_reply',
    'update_star_letter',
    'delete_star_letter',
    'add_star_letter_resonance',
    'set_star_letter_archive'
  )
  and acl.privilege_type = 'EXECUTE'
  and (acl.grantee = 0 or granted_role.rolname = 'anon');

select
  '06_authenticated_mutation_rpc_grants' as check_name,
  5 - count(*) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_star_letter_reply',
    'update_star_letter',
    'delete_star_letter',
    'add_star_letter_resonance',
    'set_star_letter_archive'
  )
  and has_function_privilege('authenticated', p.oid, 'EXECUTE');

select
  '07_rls_enabled' as check_name,
  count(*) filter (where c.relrowsecurity is not true) as anomaly_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('star_letters', 'star_letter_resonances', 'star_letter_archives');

select
  '08_cross_post_replies' as check_name,
  count(*) as anomaly_count
from public.star_letters child
join public.star_letters parent on parent.id = child.parent_star_letter_id
where child.post_id <> parent.post_id;

with recursive reply_paths as (
  select
    sl.id as origin_id,
    sl.id,
    sl.parent_star_letter_id,
    array[sl.id]::uuid[] as visited,
    false as cycle
  from public.star_letters sl

  union all

  select
    paths.origin_id,
    parent.id,
    parent.parent_star_letter_id,
    paths.visited || parent.id,
    parent.id = any(paths.visited)
  from reply_paths paths
  join public.star_letters parent on parent.id = paths.parent_star_letter_id
  where paths.cycle is false
)
select
  '09_reply_cycles' as check_name,
  count(*) as anomaly_count
from reply_paths
where cycle is true;

select
  '10_archive_post_mismatch' as check_name,
  count(*) as anomaly_count
from public.star_letter_archives archive
join public.star_letters letter on letter.id = archive.star_letter_id
where archive.post_id <> letter.post_id;

select
  '11_duplicate_star_letter_archives' as check_name,
  count(*) as anomaly_count
from (
  select profile_id, star_letter_id
  from public.star_letter_archives
  group by profile_id, star_letter_id
  having count(*) > 1
) duplicates;

select
  '12_self_star_letter_notifications' as check_name,
  count(*) as anomaly_count
from public.notifications
where type in ('star_letter', 'star_letter_reply', 'star_letter_resonance')
  and recipient_id = actor_id;

select
  '13_duplicate_star_letter_resonance_notifications' as check_name,
  count(*) as anomaly_count
from (
  select recipient_id, actor_id, star_letter_id
  from public.notifications
  where type = 'star_letter_resonance'
  group by recipient_id, actor_id, star_letter_id
  having count(*) > 1
) duplicates;

select
  '14_existing_root_star_letters' as check_name,
  count(*) filter (where parent_star_letter_id is null) as root_count,
  count(*) as total_star_letter_count
from public.star_letters;

select
  '15_current_interaction_counts' as check_name,
  (select count(*) from public.star_letter_resonances) as resonance_count,
  (select count(*) from public.star_letter_archives) as archive_count,
  (select count(*) from public.star_letters where parent_star_letter_id is not null) as reply_count;

-- Issue #108 star-letter conversation foundation post-migration verification.
-- Read-only: this file does not insert, update, or delete application data.
-- All anomaly_count values should be 0 before enabling the follow-up thread UI.
-- Concurrency, RLS mutation denial, and trigger behavior still require real
-- authenticated test transactions in a verification Supabase project.

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

select
  '16_archive_letter_post_foreign_key' as check_name,
  1 - count(*) as anomaly_count
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'star_letter_archives'
  and c.conname = 'star_letter_archives_letter_post_fkey'
  and c.contype = 'f'
  and pg_get_constraintdef(c.oid) like
    'FOREIGN KEY (star_letter_id, post_id) REFERENCES star_letters(id, post_id) ON DELETE CASCADE';

select
  '17_browser_table_level_write_grants' as check_name,
  count(*) as anomaly_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(c.relacl, pg_catalog.acldefault('r'::"char", c.relowner))
) as acl
left join pg_roles granted_role on granted_role.oid = acl.grantee
where n.nspname = 'public'
  and (
    (
      c.relname = 'star_letters'
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE')
    )
    or (
      c.relname = 'star_letter_resonances'
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    )
    or (
      c.relname = 'star_letter_archives'
      and acl.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    )
  )
  and (
    acl.grantee = 0
    or granted_role.rolname in ('anon', 'authenticated')
  );

select
  '18_authenticated_star_letter_insert_columns' as check_name,
  3 - count(*) as anomaly_count
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'star_letters'
  and c.column_name in ('post_id', 'author_id', 'body')
  and has_column_privilege(
    'authenticated',
    format('%I.%I', c.table_schema, c.table_name),
    c.column_name,
    'INSERT'
  );

select
  '19_forbidden_star_letter_insert_columns' as check_name,
  count(*) as anomaly_count
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'star_letters'
  and c.column_name in (
    'id',
    'parent_star_letter_id',
    'client_request_id',
    'edited_at',
    'deleted_at',
    'created_at',
    'updated_at'
  )
  and has_column_privilege(
    'authenticated',
    format('%I.%I', c.table_schema, c.table_name),
    c.column_name,
    'INSERT'
  );

select
  '20_relationship_concurrency_guard' as check_name,
  count(*) filter (
    where lower(pg_get_functiondef(p.oid)) not like '%pg_advisory_xact_lock%'
      or lower(pg_get_functiondef(p.oid)) not like '%for key share%'
      or lower(pg_get_functiondef(p.oid)) not like '%deleted_at is null%'
  ) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private'
  and p.proname = 'validate_star_letter_relationship';

select
  '21_private_helper_execute_grants' as check_name,
  count(*) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
) as acl
left join pg_roles granted_role on granted_role.oid = acl.grantee
where n.nspname = 'app_private'
  and p.proname in (
    'can_access_post',
    'lock_accessible_post',
    'validate_star_letter_relationship',
    'mark_star_letter_edited',
    'soft_delete_star_letter_with_replies',
    'create_star_letter_notification',
    'create_star_letter_resonance_notification'
  )
  and acl.privilege_type = 'EXECUTE'
  and (
    acl.grantee = 0
    or granted_role.rolname in ('anon', 'authenticated')
  );

select
  '22_authenticated_star_letter_select_columns' as check_name,
  9 - count(*) as anomaly_count
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'star_letters'
  and c.column_name in (
    'id',
    'post_id',
    'author_id',
    'parent_star_letter_id',
    'body',
    'created_at',
    'updated_at',
    'edited_at',
    'deleted_at'
  )
  and has_column_privilege(
    'authenticated',
    format('%I.%I', c.table_schema, c.table_name),
    c.column_name,
    'SELECT'
  );

select
  '23_private_star_letter_columns' as check_name,
  count(*) as anomaly_count
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'star_letters'
  and c.column_name = 'client_request_id'
  and (
    has_column_privilege(
      'anon',
      format('%I.%I', c.table_schema, c.table_name),
      c.column_name,
      'SELECT'
    )
    or has_column_privilege(
      'authenticated',
      format('%I.%I', c.table_schema, c.table_name),
      c.column_name,
      'SELECT'
    )
  );

with required_grants(table_name, privilege_type) as (
  values
    ('star_letters', 'SELECT'),
    ('star_letters', 'INSERT'),
    ('star_letters', 'UPDATE'),
    ('star_letters', 'DELETE'),
    ('star_letter_resonances', 'SELECT'),
    ('star_letter_resonances', 'INSERT'),
    ('star_letter_resonances', 'UPDATE'),
    ('star_letter_resonances', 'DELETE'),
    ('star_letter_archives', 'SELECT'),
    ('star_letter_archives', 'INSERT'),
    ('star_letter_archives', 'UPDATE'),
    ('star_letter_archives', 'DELETE')
)
select
  '24_service_role_table_grants' as check_name,
  count(*) filter (
    where not has_table_privilege(
      'service_role',
      format('public.%I', required_grants.table_name),
      required_grants.privilege_type
    )
  ) as anomaly_count
from required_grants;

select
  '25_notification_trigger_chain' as check_name,
  3 - count(*) as anomaly_count
from pg_trigger t
join pg_class rel on rel.oid = t.tgrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where t.tgisinternal is false
  and nsp.nspname = 'public'
  and (
    (rel.relname = 'star_letters' and t.tgname = 'star_letters_create_notification')
    or (
      rel.relname = 'star_letter_resonances'
      and t.tgname = 'star_letter_resonances_create_notification'
    )
    or (
      rel.relname = 'notifications'
      and t.tgname = 'notifications_enqueue_push_notification_job'
    )
  );

select
  '26_notification_type_constraint' as check_name,
  1 - count(*) as anomaly_count
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'notifications'
  and c.conname = 'notifications_type_check'
  and c.contype = 'c'
  and pg_get_constraintdef(c.oid) like '%star_letter_reply%'
  and pg_get_constraintdef(c.oid) like '%star_letter_resonance%';

select
  '27_notification_star_letter_post_mismatch' as check_name,
  count(*) as anomaly_count
from public.notifications notification
join public.star_letters letter on letter.id = notification.star_letter_id
where notification.type in ('star_letter', 'star_letter_reply', 'star_letter_resonance')
  and notification.post_id is distinct from letter.post_id;

select
  '28_mutation_post_lock' as check_name,
  count(*) filter (
    where p.prosecdef is not true
      or lower(pg_get_functiondef(p.oid)) not like '%for share%'
  ) as anomaly_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private'
  and p.proname = 'lock_accessible_post';

select
  '29_authenticated_star_letter_update_columns' as check_name,
  (case
    when has_column_privilege(
      'authenticated',
      'public.star_letters',
      'body',
      'UPDATE'
    )
    then 0
    else 1
  end)
  + count(*) filter (
    where c.column_name <> 'body'
      and has_column_privilege(
        'authenticated',
        format('%I.%I', c.table_schema, c.table_name),
        c.column_name,
        'UPDATE'
      )
  ) as anomaly_count
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'star_letters';

select
  '30_resonance_request_key' as check_name,
  1 - count(*) as anomaly_count
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'star_letter_resonances'
  and c.conname = 'star_letter_resonances_request_key'
  and c.contype = 'u'
  and pg_get_constraintdef(c.oid) = 'UNIQUE (profile_id, client_request_id)';

select
  '31_duplicate_resonance_request_ids' as check_name,
  count(*) as anomaly_count
from (
  select profile_id, client_request_id
  from public.star_letter_resonances
  group by profile_id, client_request_id
  having count(*) > 1
) duplicates;

select
  '32_star_letter_delete_grants' as check_name,
  (case
    when has_table_privilege(
      'authenticated',
      'public.star_letters',
      'DELETE'
    )
    then 0
    else 1
  end)
  + count(*) as anomaly_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(c.relacl, pg_catalog.acldefault('r'::"char", c.relowner))
) as acl
left join pg_roles granted_role on granted_role.oid = acl.grantee
where n.nspname = 'public'
  and c.relname = 'star_letters'
  and acl.privilege_type = 'DELETE'
  and (
    acl.grantee = 0
    or granted_role.rolname = 'anon'
  );

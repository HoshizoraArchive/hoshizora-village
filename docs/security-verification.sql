-- 星空Village security verification SQL
-- Purpose: read-only Supabase SQL Editor checks for beta security review.
-- Do not paste result rows containing secrets into public issues or PRs.
-- This script is intended to inspect policy/config/data-shape drift. It does
-- not alter schema, policies, functions, buckets, or data.

select '00_runtime_context' as section, current_database() as database_name, current_user as sql_user, now() as checked_at;

-- 01. RLS status for app-owned tables.
select
  '01_rls_status' as section,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname = 'public'
  and c.relname in (
    'profiles',
    'posts',
    'post_media',
    'profile_tags',
    'post_tags',
    'meteor_tags',
    'post_meteor_tags',
    'resonances',
    'notifications',
    'feedbacks',
    'star_letters',
    'archives',
    'observations'
  )
order by c.relname;

-- 02. Client-facing table/view/sequence grants.
-- Uses pg_catalog ACLs instead of information_schema.role_table_grants so the
-- PUBLIC pseudo-role is included. Column-level grants are checked separately.
select
  '02_relation_privileges_aclexplode' as section,
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'S' then 'sequence'
    when 'f' then 'foreign_table'
    else c.relkind::text
  end as object_type,
  pg_get_userbyid(c.relowner) as owner_name,
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(
  coalesce(
    c.relacl,
    acldefault((case when c.relkind = 'S' then 'S' else 'r' end)::"char", c.relowner)
  )
) as acl
where n.nspname in ('public', 'storage')
  and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  and (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated'))
order by schema_name, object_type, object_name, grantee, acl.privilege_type;

-- 02b. Schema privileges for exposed/internal schemas.
select
  '02b_schema_privileges_aclexplode' as section,
  n.nspname as schema_name,
  pg_get_userbyid(n.nspowner) as owner_name,
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_namespace n
cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n'::"char", n.nspowner))) as acl
where n.nspname in ('public', 'storage', 'app_private')
  and (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated'))
order by schema_name, grantee, acl.privilege_type;

-- 03. Explicit column-level grants.
-- Table-level SELECT/INSERT/UPDATE/DELETE privileges are reported in section 02.
-- This section reports explicit per-column ACLs, including PUBLIC grants.
select
  '03_column_privileges_explicit_aclexplode' as section,
  n.nspname as schema_name,
  c.relname as table_name,
  a.attname as column_name,
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
cross join lateral aclexplode(a.attacl) as acl
where n.nspname in ('public', 'storage')
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
  and a.attnum > 0
  and not a.attisdropped
  and a.attacl is not null
  and (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated'))
order by schema_name, table_name, column_name, grantee, acl.privilege_type;

-- 03b. PUBLIC / anon / authenticated default privileges.
-- Object types: r=table/view, S=sequence, f=function, n=schema, T=type.
select
  '03b_default_privileges' as section,
  pg_get_userbyid(d.defaclrole) as owner_name,
  coalesce(n.nspname, '<all schemas>') as schema_name,
  case d.defaclobjtype
    when 'r' then 'table'
    when 'S' then 'sequence'
    when 'f' then 'function'
    when 'n' then 'schema'
    when 'T' then 'type'
    else d.defaclobjtype::text
  end as object_type,
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) as acl
where (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated'))
order by owner_name, schema_name, object_type, grantee, acl.privilege_type;

-- 03c. Public schema object inventory.
-- Metadata only: no table rows, URLs, UUIDs, or user content are returned.
with relation_policy_counts as (
  select
    schemaname,
    tablename,
    count(*) as policy_count
  from pg_policies
  where schemaname = 'public'
  group by schemaname, tablename
),
relation_privileges as (
  select
    c.oid as object_oid,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    array_agg(distinct acl.privilege_type order by acl.privilege_type) as privileges
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(
    coalesce(
      c.relacl,
      acldefault((case when c.relkind = 'S' then 'S' else 'r' end)::"char", c.relowner)
    )
  ) as acl
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    and (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated'))
  group by c.oid, grantee
),
function_privileges as (
  select
    p.oid as object_oid,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    array_agg(distinct acl.privilege_type order by acl.privilege_type) as privileges
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) as acl
  where n.nspname = 'public'
    and (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated'))
  group by p.oid, grantee
),
relation_objects as (
  select
    c.oid as object_oid,
    n.nspname as schema_name,
    c.relname as object_name,
    case c.relkind
      when 'r' then 'table'
      when 'p' then 'partitioned_table'
      when 'v' then 'view'
      when 'm' then 'materialized_view'
      when 'S' then 'sequence'
      when 'f' then 'foreign_table'
      else c.relkind::text
    end as object_type,
    pg_get_userbyid(c.relowner) as owner_name,
    case when c.relkind in ('r', 'p') then c.relrowsecurity else null end as rls_enabled,
    case when c.relkind in ('r', 'p') then c.relforcerowsecurity else null end as force_rls,
    coalesce(rpc.policy_count, 0) as policy_count,
    coalesce(pub.privileges, array[]::text[]) as public_privileges,
    coalesce(anon.privileges, array[]::text[]) as anon_privileges,
    coalesce(authenticated.privileges, array[]::text[]) as authenticated_privileges
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join relation_policy_counts rpc on rpc.schemaname = n.nspname and rpc.tablename = c.relname
  left join relation_privileges pub on pub.object_oid = c.oid and pub.grantee = 'PUBLIC'
  left join relation_privileges anon on anon.object_oid = c.oid and anon.grantee = 'anon'
  left join relation_privileges authenticated on authenticated.object_oid = c.oid and authenticated.grantee = 'authenticated'
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
),
function_objects as (
  select
    p.oid as object_oid,
    n.nspname as schema_name,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object_name,
    'function' as object_type,
    pg_get_userbyid(p.proowner) as owner_name,
    null::boolean as rls_enabled,
    null::boolean as force_rls,
    null::bigint as policy_count,
    coalesce(pub.privileges, array[]::text[]) as public_privileges,
    coalesce(anon.privileges, array[]::text[]) as anon_privileges,
    coalesce(authenticated.privileges, array[]::text[]) as authenticated_privileges
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join function_privileges pub on pub.object_oid = p.oid and pub.grantee = 'PUBLIC'
  left join function_privileges anon on anon.object_oid = p.oid and anon.grantee = 'anon'
  left join function_privileges authenticated on authenticated.object_oid = p.oid and authenticated.grantee = 'authenticated'
  where n.nspname = 'public'
)
select
  '03c_public_schema_object_inventory' as section,
  schema_name,
  object_name,
  object_type,
  owner_name,
  rls_enabled,
  force_rls,
  policy_count,
  public_privileges,
  anon_privileges,
  authenticated_privileges
from relation_objects
union all
select
  '03c_public_schema_object_inventory',
  schema_name,
  object_name,
  object_type,
  owner_name,
  rls_enabled,
  force_rls,
  policy_count,
  public_privileges,
  anon_privileges,
  authenticated_privileges
from function_objects
order by object_type, object_name;

-- 03d. RLS anomaly extraction for public schema tables.
with public_tables as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    c.relkind,
    c.relrowsecurity as rls_enabled,
    coalesce(count(p.policyname), 0) as policy_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
  group by n.nspname, c.relname, c.relkind, c.relrowsecurity
)
select
  '03d_rls_anomalies' as section,
  'rls_enabled_policy_count_zero' as anomaly_type,
  schema_name,
  table_name,
  rls_enabled,
  policy_count
from public_tables
where rls_enabled is true and policy_count = 0
union all
select
  '03d_rls_anomalies',
  'policies_exist_but_rls_disabled',
  schema_name,
  table_name,
  rls_enabled,
  policy_count
from public_tables
where rls_enabled is false and policy_count > 0
union all
select
  '03d_rls_anomalies',
  'public_schema_rls_disabled',
  schema_name,
  table_name,
  rls_enabled,
  policy_count
from public_tables
where rls_enabled is false
order by anomaly_type, schema_name, table_name;

-- 03e. PUBLIC / anon / authenticated write privileges on public schema relation objects.
with write_privileges as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    case c.relkind
      when 'r' then 'table'
      when 'p' then 'partitioned_table'
      when 'v' then 'view'
      when 'm' then 'materialized_view'
      when 'f' then 'foreign_table'
      else c.relkind::text
    end as object_type,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) as acl
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and (
      acl.grantee = 0
      or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
    )
    and acl.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
)
select
  '03e_browser_role_write_grants' as section,
  schema_name,
  table_name,
  object_type,
  grantee,
  array_agg(distinct privilege_type order by privilege_type) as write_privileges
from write_privileges
group by schema_name, table_name, object_type, grantee
order by schema_name, table_name, grantee;

-- 04. Public/storage RLS policies.
select
  '04_policies' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 05. Security-definer functions and search_path settings.
select
  '05_security_definer_functions' as section,
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app_private')
order by n.nspname, p.proname;

-- 06. Function execute privileges for PUBLIC / anon / authenticated.
select
  '06_function_execute_privileges' as section,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) as acl
where n.nspname in ('public', 'app_private')
  and (
    acl.grantee = 0
    or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
  )
  and acl.privilege_type = 'EXECUTE'
order by n.nspname, p.proname, identity_arguments, grantee;

-- 07. Check constraints for size/length/type enforcement.
select
  '07_constraints' as section,
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace in ('public'::regnamespace)
  and conrelid::regclass::text in (
    'profiles',
    'posts',
    'post_media',
    'feedbacks',
    'star_letters',
    'archives',
    'meteor_tags',
    'post_meteor_tags',
    'resonances',
    'observations'
  )
order by table_name, conname;

-- 08. Storage bucket settings.
select
  '08_storage_buckets' as section,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('avatars', 'meteor-media', 'meteor-video')
order by id;

-- 09. Storage object aggregate counts only. Does not print object paths.
select
  '09_storage_object_counts' as section,
  bucket_id,
  count(*) as object_count,
  count(*) filter (where (storage.foldername(name))[1] is null) as missing_first_folder_count,
  count(*) filter (where (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as non_uuid_first_folder_count
from storage.objects
where bucket_id in ('avatars', 'meteor-media', 'meteor-video')
group by bucket_id
order by bucket_id;

-- 10. Storage objects that are not referenced by post_media, aggregate only.
-- Avatar objects are intentionally excluded because profiles.avatar_url stores public URLs.
select
  '10_unreferenced_meteor_storage_objects' as section,
  o.bucket_id,
  count(*) as unreferenced_object_count
from storage.objects o
left join public.post_media pm
  on (o.bucket_id = 'meteor-media' and (pm.storage_path = o.name or pm.thumbnail_storage_path = o.name))
  or (o.bucket_id = 'meteor-video' and pm.storage_path = o.name)
where o.bucket_id in ('meteor-media', 'meteor-video')
  and pm.id is null
group by o.bucket_id
order by o.bucket_id;

-- 11. post_media metadata quality.
select
  '11_post_media_metadata_quality' as section,
  count(*) as post_media_rows,
  count(*) filter (where storage_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/') as storage_path_not_uuid_folder,
  count(*) filter (where thumbnail_storage_path is not null and thumbnail_storage_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/') as thumbnail_path_not_uuid_folder,
  count(*) filter (where mime_type is null) as missing_mime_count,
  count(*) filter (where size_bytes is null or size_bytes <= 0) as missing_or_invalid_size_count
from public.post_media;

-- 12. post_media rows linked to deleted/private posts.
select
  '12_post_media_visibility_shape' as section,
  count(*) as post_media_rows,
  count(*) filter (where p.id is null) as orphan_post_media_rows,
  count(*) filter (where p.deleted_at is not null) as linked_to_deleted_posts,
  count(*) filter (where p.visibility <> 'public') as linked_to_non_public_posts
from public.post_media pm
left join public.posts p on p.id = pm.post_id;

-- 13. Soft-delete exposure shape.
select
  '13_deleted_post_counts' as section,
  count(*) filter (where deleted_at is not null) as deleted_posts,
  count(*) filter (where visibility = 'public' and deleted_at is not null) as deleted_public_posts,
  count(*) filter (where visibility = 'private' and deleted_at is not null) as deleted_private_posts
from public.posts;

-- 14. Child rows linked to deleted posts. Counts only.
select '14_child_rows_on_deleted_posts' as section, 'resonances' as table_name, count(*) as row_count
from public.resonances r
join public.posts p on p.id = r.post_id
where p.deleted_at is not null
union all
select '14_child_rows_on_deleted_posts', 'star_letters', count(*)
from public.star_letters s
join public.posts p on p.id = s.post_id
where p.deleted_at is not null
union all
select '14_child_rows_on_deleted_posts', 'archives', count(*)
from public.archives a
join public.posts p on p.id = a.post_id
where p.deleted_at is not null
union all
select '14_child_rows_on_deleted_posts', 'observations', count(*)
from public.observations o
join public.posts p on p.id = o.post_id
where p.deleted_at is not null
union all
select '14_child_rows_on_deleted_posts', 'post_tags', count(*)
from public.post_tags t
join public.posts p on p.id = t.post_id
where p.deleted_at is not null
union all
select '14_child_rows_on_deleted_posts', 'post_meteor_tags', count(*)
from public.post_meteor_tags t
join public.posts p on p.id = t.post_id
where p.deleted_at is not null;

-- 15. Observations data-shape risk. Counts only, no note/analysis values.
select
  '15_observation_counts' as section,
  observer_type,
  observation_type,
  count(*) as row_count,
  count(*) filter (where note is not null) as with_note,
  count(*) filter (where analysis_summary is not null) as with_analysis_summary,
  count(*) filter (where jsonb_array_length(observed_points) > 0) as with_observed_points,
  count(*) filter (where x_post_draft is not null) as with_x_post_draft
from public.observations
group by observer_type, observation_type
order by observer_type, observation_type;

select
  '16_public_post_observation_counts' as section,
  count(*) as rows_on_public_non_deleted_posts,
  count(*) filter (where o.observer_type = 'ai_resident') as ai_rows_on_public_non_deleted_posts,
  count(*) filter (where o.analysis_summary is not null) as with_analysis_summary,
  count(*) filter (where o.x_post_draft is not null) as with_x_post_draft
from public.observations o
join public.posts p on p.id = o.post_id
where p.visibility = 'public'
  and p.deleted_at is null;

-- 17. Oversized content that bypassed UI limits. Counts only.
select '17_oversized_content' as section, 'posts.body_over_500_trimmed_chars' as check_name, count(*) as row_count
from public.posts
where char_length(trim(body)) > 500
union all
select '17_oversized_content', 'star_letters.body_over_500_trimmed_chars', count(*)
from public.star_letters
where char_length(trim(body)) > 500
union all
select '17_oversized_content', 'profile_tags.label_over_30_trimmed_chars', count(*)
from public.profile_tags
where char_length(trim(label)) > 30
union all
select '17_oversized_content', 'post_tags.label_over_30_trimmed_chars', count(*)
from public.post_tags
where char_length(trim(label)) > 30;

-- 18. Duplicate resonance shape.
select
  '18_duplicate_resonances' as section,
  count(*) as duplicated_post_profile_pairs,
  coalesce(max(repeat_count), 0) as max_repeats_for_one_pair
from (
  select post_id, profile_id, count(*) as repeat_count
  from public.resonances
  group by post_id, profile_id
  having count(*) > 1
) repeated;

-- 19. Public profile data shape. Counts only.
select
  '19_profile_shape' as section,
  count(*) as profile_count,
  count(*) filter (where avatar_url is not null and trim(avatar_url) <> '') as profiles_with_avatar_url,
  count(*) filter (where bio is not null and trim(bio) <> '') as profiles_with_bio,
  count(*) filter (where constellation_note is not null and trim(constellation_note) <> '') as profiles_with_constellation_note,
  count(*) filter (where notify_authors_when_i_archive is false) as archive_notify_off_count,
  count(*) filter (where notify_authors_when_i_resonate is false) as resonance_notify_off_count
from public.profiles;

-- 20. Notifications consistency. Counts only.
select
  '20_notification_shape' as section,
  type,
  count(*) as row_count,
  count(*) filter (where recipient_id = actor_id) as self_notification_count,
  count(*) filter (where post_id is null) as no_post_id_count
from public.notifications
group by type
order by type;

-- 21. Feedback status shape.
select
  '21_feedback_status_shape' as section,
  status,
  count(*) as row_count
from public.feedbacks
group by status
order by status;

-- 22. Realtime/publication exposure, if Realtime publications are configured.
select
  '22_publication_tables' as section,
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where schemaname in ('public', 'storage')
order by pubname, schemaname, tablename;

-- 23. Views and materialized views that may expose public data.
select
  '23_public_views' as section,
  schemaname,
  viewname as object_name,
  'view' as object_type
from pg_views
where schemaname in ('public', 'app_private')
union all
select
  '23_public_views',
  schemaname,
  matviewname,
  'materialized_view'
from pg_matviews
where schemaname in ('public', 'app_private')
order by schemaname, object_name;

-- 24. Migration table existence. Run the optional query below only if this
-- returns `supabase_migrations.schema_migrations`.
select
  '24_migration_table' as section,
  to_regclass('supabase_migrations.schema_migrations') as migration_table_regclass;

-- Optional, run only if 24_migration_table reports the table exists:
-- select version, name, inserted_at
-- from supabase_migrations.schema_migrations
-- order by version;

-- 25. Manual dashboard checks cannot be completed from SQL.
select '25_manual_dashboard_checks' as section, 'Needs live verification: Supabase Auth settings, provider rate limits, CAPTCHA/bot protection, project API key exposure, Netlify env vars, deployed HTTP headers.' as note;

-- H-3 FINAL-B / READ ONLY.
-- Compares schema/catalog metadata only. It never reads application, Auth, or
-- Storage object rows. The baseline was measured from Production at main
-- eeeebddd3f632ebe330a1e3bc3d34fe0d0351b0e on 2026-08-14; function values
-- include the intentional Opening Memorial operator RPC migration and the
-- additive founding-resident numbering trigger/functions in this branch.

begin;
set transaction read only;

with metadata_rows(category, item) as (
  select 'tables', format('%s|%s|%s', c.relname, c.relrowsecurity, c.relforcerowsecurity)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')

  union all
  select 'columns', concat_ws('|', c.relname, a.attnum::text, a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
    nullif(a.attidentity, ''), nullif(a.attgenerated, ''),
    pg_catalog.pg_get_expr(d.adbin, d.adrelid))
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and a.attnum > 0 and not a.attisdropped

  union all
  select 'constraints', concat_ws('|', c.relname, con.conname, con.contype,
    pg_catalog.pg_get_constraintdef(con.oid, true))
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_namespace n on n.oid = con.connamespace
  join pg_catalog.pg_class c on c.oid = con.conrelid
  where n.nspname = 'public' and con.contype in ('p', 'f', 'u', 'c', 'x')

  union all
  select 'indexes', concat_ws('|', tab.relname, idx.relname,
    i.indisprimary::text, i.indisunique::text, i.indisvalid::text,
    pg_catalog.pg_get_indexdef(i.indexrelid))
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  join pg_catalog.pg_namespace n on n.oid = idx.relnamespace
  join pg_catalog.pg_class tab on tab.oid = i.indrelid
  where n.nspname = 'public'

  union all
  select 'enums', concat_ws('|', t.typname, e.enumsortorder::text, e.enumlabel)
  from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  join pg_catalog.pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public'

  union all
  select 'views', concat_ws('|', c.relname, c.relkind,
    pg_catalog.pg_get_viewdef(c.oid, true))
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')

  union all
  select 'functions', concat_ws('|', n.nspname, p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid),
    pg_catalog.pg_get_function_result(p.oid), p.provolatile::text,
    p.prosecdef::text,
    regexp_replace(
      regexp_replace(
        regexp_replace(
          pg_catalog.pg_get_functiondef(p.oid),
          '--[^' || chr(10) || ']*',
          '',
          'g'
        ),
        '[[:space:]]+',
        '',
        'g'
      ),
      '[()]',
      '',
      'g'
    )
  )
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app_private')

  union all
  select 'triggers', concat_ws('|', n.nspname, c.relname, t.tgname,
    pg_catalog.pg_get_triggerdef(t.oid, true))
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname in ('public', 'auth')

  union all
  select 'policies', concat_ws('|', schemaname, tablename, policyname,
    permissive, array_to_string(roles, ','), cmd, qual, with_check)
  from pg_catalog.pg_policies
  where schemaname in ('public', 'storage')
    and policyname not in (
      'profile_kinds_select_public',
      'profile_roles_select_public',
      'profile_cohorts_select_public'
    )

  union all
  -- The privacy-safe 20260807063919 reconstruction uses `profile` where the
  -- Production statement used `p` as a subquery alias. Compare the audited
  -- policy contract after normalizing only that known non-semantic exception.
  select 'profile_identity_policy_contract', concat_ws('|',
    schemaname, tablename, policyname, permissive,
    array_to_string(roles, ','), cmd,
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(qual, ''), '[[:space:]]+', '', 'g'),
        'profiles(p|profile)', 'profilesprofile_ref', 'g'
      ),
      '(p|profile)[.]', 'profile_ref.', 'g'
    ),
    coalesce(with_check, '')
  )
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and policyname in (
      'profile_kinds_select_public',
      'profile_roles_select_public',
      'profile_cohorts_select_public'
    )

  union all
  select 'relation_grants', concat_ws('|', n.nspname, c.relname,
    coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type,
    acl.is_grantable::text)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname in ('public', 'app_private')
    and c.relkind in ('r', 'p', 'v', 'm')
    and coalesce(grantee.rolname, 'PUBLIC') in (
      'PUBLIC', 'anon', 'authenticated', 'service_role'
    )

  union all
  select 'function_grants', concat_ws('|', n.nspname, p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid),
    coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type,
    acl.is_grantable::text)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname in ('public', 'app_private')
    and coalesce(grantee.rolname, 'PUBLIC') in (
      'PUBLIC', 'anon', 'authenticated', 'service_role'
    )

  union all
  select 'sequence_grants', concat_ws('|', n.nspname, c.relname,
    coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type,
    acl.is_grantable::text)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl, pg_catalog.acldefault('S', c.relowner))
  ) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname in ('public', 'app_private') and c.relkind = 'S'
    and coalesce(grantee.rolname, 'PUBLIC') in (
      'PUBLIC', 'anon', 'authenticated', 'service_role'
    )

  union all
  select 'schema_grants', concat_ws('|', n.nspname,
    coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type,
    acl.is_grantable::text)
  from pg_catalog.pg_namespace n
  cross join lateral pg_catalog.aclexplode(
    coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
  ) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname in ('public', 'app_private')
    and coalesce(grantee.rolname, 'PUBLIC') in (
      'PUBLIC', 'anon', 'authenticated', 'service_role'
    )

  union all
  select 'column_grants', concat_ws('|', n.nspname, c.relname, a.attname,
    coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type,
    acl.is_grantable::text)
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(a.attacl) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
    and coalesce(grantee.rolname, 'PUBLIC') in (
      'PUBLIC', 'anon', 'authenticated', 'service_role'
    )
),
categories(category) as (
  values ('tables'), ('columns'), ('constraints'), ('indexes'), ('enums'),
    ('views'), ('functions'), ('triggers'), ('policies'),
    ('profile_identity_policy_contract'), ('relation_grants'),
    ('function_grants'), ('sequence_grants'), ('schema_grants'), ('column_grants')
),
actual as (
  select
    categories.category,
    count(metadata_rows.item)::int as item_count,
    coalesce(
      md5(string_agg(metadata_rows.item, E'\n' order by metadata_rows.item collate "C")),
      md5('')
    ) as fingerprint
  from categories
  left join metadata_rows using (category)
  group by categories.category
),
expected(category, item_count, fingerprint) as (
  values
    ('column_grants', 41, 'fbff28e73cd9b2492a06fe59cf80fb53'),
    ('columns', 316, '970facc834fe96c0e1b4eefadc288011'),
    ('constraints', 240, 'c120130c09edcc38f8b0db6a659fc723'),
    ('enums', 5, '08c45d6b2c72748be6bc31b1c21d7b6c'),
    ('function_grants', 124, '1ebb1cdbe9d9c869c4d32905cf43635e'),
    ('functions', 109, 'bb2c2330e26959dc8cd0bbb21523bc2b'),
    ('indexes', 156, '556ab478ecdd8bfff390e95af41e86a7'),
    ('policies', 73, 'd0ce97d4d8e908e7eadfe23dbd5a0d27'),
    ('profile_identity_policy_contract', 3, '3166d0b171746fb5a5143b303d2a1892'),
    ('relation_grants', 401, '6ea02d91a7d015eb7087245d01a9cf97'),
    ('schema_grants', 4, '854909e6b7d3b8f0a3b6afa9f3029567'),
    ('sequence_grants', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
    ('tables', 37, 'c719260c1c397aff56bfd6c9ebe3d992'),
    ('triggers', 42, '95db25748b484b471853b3bbd09c100e'),
    ('views', 0, 'd41d8cd98f00b204e9800998ecf8427e')
),
comparison as (
  select
    expected.category,
    actual.item_count as actual_count,
    expected.item_count as expected_count,
    actual.fingerprint as actual_fingerprint,
    expected.fingerprint as expected_fingerprint,
    actual.item_count = expected.item_count
      and actual.fingerprint = expected.fingerprint as matches
  from expected
  join actual using (category)
),
result as (
  select
    comparison.*,
    count(*) filter (where not matches) over () as mismatch_count
  from comparison
)
select *
from result
order by result.category;

rollback;

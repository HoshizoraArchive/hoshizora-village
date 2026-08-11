-- PREVIEW-V2 BASELINE AUDIT / READ ONLY.
-- Produces deterministic metadata fingerprints without reading user rows.
-- Function source is normalized for comments, whitespace and redundant
-- parentheses; review production-inventory.sql for the complete definitions.

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
    and coalesce(grantee.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')

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
    and coalesce(grantee.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')

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
    and coalesce(grantee.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated', 'service_role')

  union all
  select 'buckets', concat_ws('|', id, name, public::text,
    file_size_limit::text, array_to_string(allowed_mime_types, ','))
  from storage.buckets
  where id in ('avatars', 'meteor-media', 'meteor-video')

  union all
  select 'profile_frames_catalog', concat_ws('|', frame_key, name, description,
    asset_path, acquisition_type, rarity, frame_scale::text,
    frame_offset_x::text, frame_offset_y::text, is_active::text)
  from public.profile_frames

  union all
  select 'titles_catalog', concat_ws('|', key, label, description, variant,
    emblem_path, is_active::text, sort_order::text)
  from public.titles

  union all
  select 'guide_sections_catalog', concat_ws('|', section_row.section_key,
    section_row.title, parent.section_key, section_row.display_variant,
    section_row.sort_order::text, section_row.is_visible::text)
  from public.guide_sections section_row
  left join public.guide_sections parent on parent.id = section_row.parent_id

  union all
  select 'guide_entries_catalog', concat_ws('|', entry.entry_key,
    section_row.section_key, entry.entry_type, entry.body,
    entry.sort_order::text, entry.is_visible::text)
  from public.guide_entries entry
  join public.guide_sections section_row on section_row.id = entry.section_id
),
categories(category) as (
  values ('tables'), ('columns'), ('constraints'), ('indexes'), ('enums'),
    ('views'), ('functions'), ('triggers'), ('policies'), ('relation_grants'),
    ('function_grants'), ('column_grants'), ('buckets'),
    ('profile_frames_catalog'), ('titles_catalog'),
    ('guide_sections_catalog'), ('guide_entries_catalog')
)
select
  categories.category,
  count(metadata_rows.item)::int as item_count,
  coalesce(md5(string_agg(metadata_rows.item, E'\n' order by metadata_rows.item collate "C")), md5('')) as fingerprint
from categories
left join metadata_rows using (category)
group by categories.category
order by categories.category;

rollback;

-- H-3 FINAL-B / LOCAL ONLY / READ ONLY.
-- Fails when the isolated local replay ledger or required core objects differ
-- from the audited 77-migration chain.

begin;
set transaction read only;

with ledger as (
  select
    count(*)::int as rows,
    count(distinct version)::int as distinct_versions,
    min(version) as first_version,
    max(version) as latest_version,
    count(*)::int - count(distinct version)::int as duplicate_versions
  from supabase_migrations.schema_migrations
),
baseline_row as (
  select count(*)::int as rows
  from supabase_migrations.schema_migrations
  where version = '20260524'
    and name = 'historical_core_baseline'
),
required_relations(relation_name) as (
  values ('profiles'), ('posts'), ('profile_tags'), ('post_tags'),
    ('resonances'), ('star_letters'), ('archives'), ('observations')
),
missing_relations as (
  select required_relations.relation_name
  from required_relations
  left join pg_catalog.pg_class c
    on c.relname = required_relations.relation_name
    and c.relkind in ('r', 'p')
  left join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
    and n.nspname = 'public'
  where n.oid is null
),
signup_open_acl as (
  select
    count(*)::int as rows,
    coalesce(bool_and(p.prosecdef), false) as security_definer,
    coalesce(bool_and(p.proconfig @> array['search_path=pg_catalog, public']), false) as fixed_search_path,
    coalesce(bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE')), false) as anon_blocked,
    coalesce(bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE')), false) as authenticated_blocked,
    coalesce(bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')), false) as service_role_allowed
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'record_signup_open'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_visitor_id uuid, p_app_mode text, p_platform text, p_client_opened_at timestamp with time zone'
),
actual as (
  select
    ledger.*,
    baseline_row.rows as baseline_rows,
    (select count(*)::int from missing_relations) as missing_core_relations,
    signup_open_acl.rows as signup_open_function_rows,
    signup_open_acl.security_definer as signup_open_security_definer,
    signup_open_acl.fixed_search_path as signup_open_fixed_search_path,
    signup_open_acl.anon_blocked as signup_open_anon_blocked,
    signup_open_acl.authenticated_blocked as signup_open_authenticated_blocked,
    signup_open_acl.service_role_allowed as signup_open_service_role_allowed
  from ledger
  cross join baseline_row
  cross join signup_open_acl
),
assertion as (
  select 1 / ((
    rows = 77
    and distinct_versions = 77
    and first_version = '20260524'
    and latest_version = '20260824122431'
    and duplicate_versions = 0
    and baseline_rows = 1
    and missing_core_relations = 0
    and signup_open_function_rows = 1
    and signup_open_security_definer
    and signup_open_fixed_search_path
    and signup_open_anon_blocked
    and signup_open_authenticated_blocked
    and signup_open_service_role_allowed
  )::int) as passed
  from actual
)
select actual.*, assertion.passed
from actual
cross join assertion;

rollback;

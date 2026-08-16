-- H-3 FINAL-B / LOCAL ONLY / READ ONLY.
-- Fails when the isolated local replay ledger or required core objects differ
-- from the audited 74-migration chain.

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
actual as (
  select
    ledger.*,
    baseline_row.rows as baseline_rows,
    (select count(*)::int from missing_relations) as missing_core_relations
  from ledger
  cross join baseline_row
),
assertion as (
  select 1 / ((
    rows = 74
    and distinct_versions = 74
    and first_version = '20260524'
    and latest_version = '20260816191500'
    and duplicate_versions = 0
    and baseline_rows = 1
    and missing_core_relations = 0
  )::int) as passed
  from actual
)
select actual.*, assertion.passed
from actual
cross join assertion;

rollback;

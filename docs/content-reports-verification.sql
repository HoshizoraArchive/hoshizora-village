-- Issue #158: 観測局のread-only verification SQL.
-- Supabase SQL Editorで実行し、全行のanomaly_countが0であることを確認する。

with checks as (
  select
    '01_table_exists'::text as check_name,
    case when to_regclass('public.content_reports') is null then 1 else 0 end::bigint as anomaly_count

  union all

  select
    '02_rls_enabled',
    case when coalesce(c.relrowsecurity, false) then 0 else 1 end::bigint
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'content_reports'

  union all

  select
    '03_no_browser_table_privileges',
    count(*)::bigint
  from information_schema.table_privileges privilege
  where privilege.table_schema = 'public'
    and privilege.table_name = 'content_reports'
    and privilege.grantee in ('PUBLIC', 'anon', 'authenticated')

  union all

  select
    '04_no_browser_policies',
    count(*)::bigint
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename = 'content_reports'

  union all

  select
    '05_required_indexes',
    (7 - count(*))::bigint
  from pg_catalog.pg_indexes index_row
  where index_row.schemaname = 'public'
    and index_row.tablename = 'content_reports'
    and index_row.indexname in (
      'content_reports_reporter_target_reason_created_idx',
      'content_reports_status_created_idx',
      'content_reports_target_created_idx',
      'content_reports_reporter_id_idx',
      'content_reports_target_post_id_idx',
      'content_reports_target_profile_id_idx',
      'content_reports_reviewed_by_idx'
    )

  union all

  select
    '06_security_definer_search_path',
    count(*) filter (
      where not p.prosecdef
        or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
    )::bigint
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_content_report',
      'get_content_reports',
      'update_content_report'
    )

  union all

  select
    '07_anon_cannot_execute',
    count(*) filter (
      where has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
    )::bigint
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_content_report',
      'get_content_reports',
      'update_content_report'
    )

  union all

  select
    '08_authenticated_rpc_grants',
    (3 - count(*))::bigint
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_content_report',
      'get_content_reports',
      'update_content_report'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')

  union all

  select
    '09_snapshot_is_object',
    count(*)::bigint
  from public.content_reports report
  where jsonb_typeof(report.snapshot) is distinct from 'object'

  union all

  select
    '10_target_reference_consistency',
    count(*)::bigint
  from public.content_reports report
  where not (
    (
      report.target_type = 'post'
      and report.target_profile_id is null
      and (
        report.target_post_id is null
        or report.target_post_id = report.target_original_id
      )
    )
    or (
      report.target_type = 'profile'
      and report.target_post_id is null
      and (
        report.target_profile_id is null
        or report.target_profile_id = report.target_original_id
      )
    )
  )

  union all

  select
    '11_no_report_notifications',
    count(*)::bigint
  from pg_catalog.pg_trigger trigger_row
  join pg_catalog.pg_class table_row on table_row.oid = trigger_row.tgrelid
  join pg_catalog.pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'content_reports'
    and not trigger_row.tgisinternal
)
select check_name, anomaly_count
from checks
order by check_name;

-- 主要な管理一覧クエリが複合indexを利用できることを確認するための計画。
-- 実データ量が少ない環境ではSeq Scanが選択されても異常ではない。
explain (costs true, verbose false)
select report.id, report.created_at
from public.content_reports report
where report.status = 'open'
order by report.created_at desc, report.id desc
limit 100;

explain (costs true, verbose false)
select report.id
from public.content_reports report
where report.reporter_original_id = '00000000-0000-0000-0000-000000000001'::uuid
  and report.target_type = 'post'
  and report.target_original_id = '00000000-0000-0000-0000-000000000002'::uuid
  and report.reason = 'other'
  and report.created_at >= now() - interval '24 hours'
order by report.created_at desc, report.id desc
limit 1;

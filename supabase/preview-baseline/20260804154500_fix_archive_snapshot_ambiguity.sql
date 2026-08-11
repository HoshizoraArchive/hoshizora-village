-- PREVIEW-V2 ONLY / DO NOT APPLY TO PRODUCTION.
-- Schema-only continuation copied from the reviewed Git migration.

begin;

-- Follow-up for the causal revision migration: in PL/pgSQL, the RETURNS TABLE
-- output parameter named post_id is also a variable. Qualify the CTE column so
-- Archive reads work at runtime, including the >100-current-Archive batching path.
create or replace function public.get_archived_post_snapshots_v1(
  p_known_post_ids uuid[] default '{}'::uuid[]
)
returns table (
  post_id uuid,
  id uuid,
  available boolean,
  tombstoned boolean,
  author_id uuid,
  type text,
  body text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  revision_epoch uuid,
  content_revision text,
  assets_revision text,
  viewer_context_revision text,
  media_rows jsonb,
  tag_rows jsonb,
  is_archived boolean,
  archive_id uuid,
  archived_at timestamptz,
  archive_revision text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
begin
  if v_viewer_id is null then
    return;
  end if;
  if coalesce(cardinality(p_known_post_ids), 0) > 100 then
    raise exception 'too many post ids' using errcode = '22023';
  end if;

  return query
  with candidate_ids as (
    select current_archives.post_id
    from (
      select a.post_id
      from public.archives a
      where a.profile_id = v_viewer_id
      order by a.created_at desc, a.id
    ) current_archives
    union
    select known_id
    from unnest(coalesce(p_known_post_ids, '{}'::uuid[])) known_id
    where known_id is not null
  ), numbered_candidates as (
    select
      candidate_ids.post_id,
      ((row_number() over (order by candidate_ids.post_id) - 1) / 100)::integer as batch_number
    from candidate_ids
  ), snapshot_batches as (
    select
      numbered_candidates.batch_number,
      array_agg(
        numbered_candidates.post_id
        order by numbered_candidates.post_id
      ) as post_ids
    from numbered_candidates
    group by numbered_candidates.batch_number
  ), snapshots as (
    select snapshot.*
    from snapshot_batches
    cross join lateral public.get_post_snapshots_v1(snapshot_batches.post_ids) snapshot
  )
  select
    snapshots.post_id,
    snapshots.id,
    snapshots.available,
    snapshots.tombstoned,
    snapshots.author_id,
    snapshots.type,
    snapshots.body,
    snapshots.visibility,
    snapshots.created_at,
    snapshots.updated_at,
    snapshots.deleted_at,
    snapshots.revision_epoch,
    snapshots.content_revision,
    snapshots.assets_revision,
    snapshots.viewer_context_revision,
    snapshots.media_rows,
    snapshots.tag_rows,
    archive_row.id is not null,
    archive_row.id,
    archive_row.created_at,
    coalesce(archive_revision.revision, 0)::text
  from snapshots
  left join public.archives archive_row
    on archive_row.profile_id = v_viewer_id
   and archive_row.post_id = snapshots.post_id
  left join app_private.viewer_post_domain_revisions archive_revision
    on archive_revision.viewer_id = v_viewer_id
   and archive_revision.post_id = snapshots.post_id
   and archive_revision.domain = 'archive'
  order by archive_row.created_at desc nulls last, snapshots.post_id;
end;
$$;

revoke all on function public.get_archived_post_snapshots_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.get_archived_post_snapshots_v1(uuid[]) to authenticated;

commit;

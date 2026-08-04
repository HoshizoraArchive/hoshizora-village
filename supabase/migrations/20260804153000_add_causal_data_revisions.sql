begin;

-- Causal revisions are private implementation data. Public callers only see
-- the minimum revision metadata returned by the RPCs below.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table if not exists app_private.data_revision_epoch (
  singleton boolean primary key default true check (singleton),
  epoch uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists app_private.post_domain_revisions (
  post_id uuid not null,
  domain text not null check (domain in ('post_content', 'post_assets', 'resonance', 'star_thread')),
  revision bigint not null check (revision > 0),
  tombstoned boolean not null default false,
  author_id uuid,
  was_public boolean not null default false,
  changed_at timestamptz not null default now(),
  primary key (post_id, domain)
);

create table if not exists app_private.viewer_post_domain_revisions (
  viewer_id uuid not null,
  post_id uuid not null,
  domain text not null check (domain in ('archive', 'star_thread_viewer')),
  revision bigint not null check (revision > 0),
  changed_at timestamptz not null default now(),
  primary key (viewer_id, post_id, domain)
);

create table if not exists app_private.viewer_context_revisions (
  viewer_id uuid primary key,
  revision bigint not null check (revision > 0),
  changed_at timestamptz not null default now()
);

revoke all on table app_private.data_revision_epoch from public, anon, authenticated;
revoke all on table app_private.post_domain_revisions from public, anon, authenticated;
revoke all on table app_private.viewer_post_domain_revisions from public, anon, authenticated;
revoke all on table app_private.viewer_context_revisions from public, anon, authenticated;

insert into app_private.data_revision_epoch (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function app_private.current_data_revision_epoch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select epoch
  from app_private.data_revision_epoch
  where singleton = true;
$$;

create or replace function app_private.viewer_context_revision(p_viewer_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select revision
    from app_private.viewer_context_revisions
    where viewer_id = p_viewer_id
  ), 0::bigint);
$$;

create or replace function app_private.bump_post_domain_revision(
  p_post_id uuid,
  p_domain text,
  p_tombstoned boolean default false,
  p_author_id uuid default null,
  p_was_public boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if p_post_id is null then
    return 0;
  end if;

  insert into app_private.post_domain_revisions (
    post_id,
    domain,
    revision,
    tombstoned,
    author_id,
    was_public,
    changed_at
  )
  values (
    p_post_id,
    p_domain,
    1,
    coalesce(p_tombstoned, false),
    p_author_id,
    coalesce(p_was_public, false),
    now()
  )
  on conflict (post_id, domain)
  do update set
    revision = app_private.post_domain_revisions.revision + 1,
    tombstoned = excluded.tombstoned,
    author_id = coalesce(excluded.author_id, app_private.post_domain_revisions.author_id),
    was_public = excluded.was_public or app_private.post_domain_revisions.was_public,
    changed_at = excluded.changed_at
  returning revision into v_revision;

  return v_revision;
end;
$$;

create or replace function app_private.bump_viewer_post_domain_revision(
  p_viewer_id uuid,
  p_post_id uuid,
  p_domain text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if p_viewer_id is null or p_post_id is null then
    return 0;
  end if;

  insert into app_private.viewer_post_domain_revisions (
    viewer_id,
    post_id,
    domain,
    revision,
    changed_at
  )
  values (p_viewer_id, p_post_id, p_domain, 1, now())
  on conflict (viewer_id, post_id, domain)
  do update set
    revision = app_private.viewer_post_domain_revisions.revision + 1,
    changed_at = excluded.changed_at
  returning revision into v_revision;

  return v_revision;
end;
$$;

create or replace function app_private.bump_viewer_context_revision(p_viewer_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if p_viewer_id is null then
    return 0;
  end if;

  insert into app_private.viewer_context_revisions (
    viewer_id,
    revision,
    changed_at
  )
  values (p_viewer_id, 1, now())
  on conflict (viewer_id)
  do update set
    revision = app_private.viewer_context_revisions.revision + 1,
    changed_at = excluded.changed_at
  returning revision into v_revision;

  return v_revision;
end;
$$;

revoke all on function app_private.current_data_revision_epoch() from public, anon, authenticated;
revoke all on function app_private.viewer_context_revision(uuid) from public, anon, authenticated;
revoke all on function app_private.bump_post_domain_revision(uuid, text, boolean, uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.bump_viewer_post_domain_revision(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.bump_viewer_context_revision(uuid) from public, anon, authenticated;

-- Mutations must never treat an author's soft-deleted post as writable. This
-- keeps the existing visibility/black-hole boundary while tightening only the
-- trusted mutation lock used by the RPCs below.
create or replace function app_private.lock_accessible_post(
  p_post_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  select true
  into v_found
  from public.posts p
  where p.id = p_post_id
    and p.deleted_at is null
    and (
      p.visibility = 'public'
      or (p_user_id is not null and p.author_id = p_user_id)
    )
    and (
      p_user_id is null
      or not app_private.is_black_hole_between_profiles(
        p_user_id,
        p.author_id
      )
    )
  for share;

  return coalesce(v_found, false);
end;
$$;

revoke all on function app_private.lock_accessible_post(uuid, uuid)
from public, anon, authenticated;

-- SHARE ROW EXCLUSIVE blocks INSERT/UPDATE/DELETE while allowing reads. The
-- locks are held through trigger installation and idempotent backfill, so no
-- write can commit without a revision before the triggers become visible.
set local lock_timeout = '15s';
lock table
  public.profiles,
  public.posts,
  public.post_media,
  public.post_meteor_tags,
  public.resonances,
  public.archives,
  public.star_letters,
  public.star_letter_resonances,
  public.star_letter_archives,
  public.profile_blocks
in share row exclusive mode;

create or replace function app_private.track_post_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.bump_post_domain_revision(new.id, 'post_content', new.deleted_at is not null, new.author_id, new.visibility = 'public');
    perform app_private.bump_post_domain_revision(new.id, 'post_assets', new.deleted_at is not null, new.author_id, new.visibility = 'public');
    perform app_private.bump_post_domain_revision(new.id, 'resonance', new.deleted_at is not null, new.author_id, new.visibility = 'public');
    perform app_private.bump_post_domain_revision(new.id, 'star_thread', new.deleted_at is not null, new.author_id, new.visibility = 'public');
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if row(old.author_id, old.type, old.body, old.visibility, old.created_at, old.updated_at, old.deleted_at)
      is distinct from row(new.author_id, new.type, new.body, new.visibility, new.created_at, new.updated_at, new.deleted_at)
    then
      perform app_private.bump_post_domain_revision(new.id, 'post_content', new.deleted_at is not null, new.author_id, new.visibility = 'public');
    end if;

    if row(old.media_url, old.youtube_url, old.youtube_video_id, old.duration_seconds)
      is distinct from row(new.media_url, new.youtube_url, new.youtube_video_id, new.duration_seconds)
    then
      perform app_private.bump_post_domain_revision(new.id, 'post_assets', new.deleted_at is not null, new.author_id, new.visibility = 'public');
    end if;
    return new;
  end if;

  perform app_private.bump_post_domain_revision(old.id, 'post_content', true, old.author_id, old.visibility = 'public');
  perform app_private.bump_post_domain_revision(old.id, 'post_assets', true, old.author_id, old.visibility = 'public');
  return old;
end;
$$;

create or replace function app_private.track_post_asset_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_post_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.post_id else null end;
  v_new_post_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.post_id else null end;
begin
  if v_old_post_id is not null and v_old_post_id is distinct from v_new_post_id then
    perform app_private.bump_post_domain_revision(v_old_post_id, 'post_assets');
  end if;
  if v_new_post_id is not null then
    perform app_private.bump_post_domain_revision(v_new_post_id, 'post_assets');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.track_post_resonance_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_post_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.post_id else null end;
  v_new_post_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.post_id else null end;
begin
  if v_old_post_id is not null and v_old_post_id is distinct from v_new_post_id then
    perform app_private.bump_post_domain_revision(v_old_post_id, 'resonance');
  end if;
  if v_new_post_id is not null then
    perform app_private.bump_post_domain_revision(v_new_post_id, 'resonance');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.track_archive_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.bump_viewer_post_domain_revision(old.profile_id, old.post_id, 'archive');
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and row(old.profile_id, old.post_id) is distinct from row(new.profile_id, new.post_id)) then
    perform app_private.bump_viewer_post_domain_revision(new.profile_id, new.post_id, 'archive');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.track_star_letter_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_post_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.post_id else null end;
  v_new_post_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.post_id else null end;
begin
  if v_old_post_id is not null and v_old_post_id is distinct from v_new_post_id then
    perform app_private.bump_post_domain_revision(v_old_post_id, 'star_thread');
  end if;
  if v_new_post_id is not null then
    perform app_private.bump_post_domain_revision(v_new_post_id, 'star_thread');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.track_star_letter_resonance_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select post_id into v_post_id from public.star_letters where id = old.star_letter_id;
    if v_post_id is not null then
      perform app_private.bump_post_domain_revision(v_post_id, 'star_thread');
      perform app_private.bump_viewer_post_domain_revision(old.profile_id, v_post_id, 'star_thread_viewer');
    end if;
  end if;

  if tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and row(old.star_letter_id, old.profile_id) is distinct from row(new.star_letter_id, new.profile_id))
  then
    select post_id into v_post_id from public.star_letters where id = new.star_letter_id;
    if v_post_id is not null then
      perform app_private.bump_post_domain_revision(v_post_id, 'star_thread');
      perform app_private.bump_viewer_post_domain_revision(new.profile_id, v_post_id, 'star_thread_viewer');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.track_star_letter_archive_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.bump_viewer_post_domain_revision(old.profile_id, old.post_id, 'star_thread_viewer');
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and row(old.profile_id, old.post_id) is distinct from row(new.profile_id, new.post_id)) then
    perform app_private.bump_viewer_post_domain_revision(new.profile_id, new.post_id, 'star_thread_viewer');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.track_viewer_context_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_ids uuid[];
  v_viewer_id uuid;
begin
  if tg_op = 'INSERT' then
    v_viewer_ids := array[new.blocker_id, new.blocked_id];
  elsif tg_op = 'DELETE' then
    v_viewer_ids := array[old.blocker_id, old.blocked_id];
  else
    v_viewer_ids := array[
      old.blocker_id,
      old.blocked_id,
      new.blocker_id,
      new.blocked_id
    ];
  end if;

  -- Reciprocal block operations take revision-row locks in the same UUID
  -- order, avoiding an otherwise unnecessary A->B / B->A deadlock.
  for v_viewer_id in
    select distinct requested.viewer_id
    from unnest(v_viewer_ids) requested(viewer_id)
    where requested.viewer_id is not null
    order by requested.viewer_id
  loop
    perform app_private.bump_viewer_context_revision(v_viewer_id);
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.track_profile_viewer_context_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.bump_viewer_context_revision(new.id);
  return new;
end;
$$;

drop trigger if exists causal_revision_posts on public.posts;
create trigger causal_revision_posts
after insert or update or delete on public.posts
for each row execute function app_private.track_post_revision();

drop trigger if exists causal_revision_post_media on public.post_media;
create trigger causal_revision_post_media
after insert or update or delete on public.post_media
for each row execute function app_private.track_post_asset_revision();

drop trigger if exists causal_revision_post_meteor_tags on public.post_meteor_tags;
create trigger causal_revision_post_meteor_tags
after insert or update or delete on public.post_meteor_tags
for each row execute function app_private.track_post_asset_revision();

drop trigger if exists causal_revision_resonances on public.resonances;
create trigger causal_revision_resonances
after insert or update or delete on public.resonances
for each row execute function app_private.track_post_resonance_revision();

drop trigger if exists causal_revision_archives on public.archives;
create trigger causal_revision_archives
after insert or update or delete on public.archives
for each row execute function app_private.track_archive_revision();

drop trigger if exists causal_revision_star_letters on public.star_letters;
create trigger causal_revision_star_letters
after insert or update or delete on public.star_letters
for each row execute function app_private.track_star_letter_revision();

drop trigger if exists causal_revision_star_letter_resonances on public.star_letter_resonances;
create trigger causal_revision_star_letter_resonances
after insert or update or delete on public.star_letter_resonances
for each row execute function app_private.track_star_letter_resonance_revision();

drop trigger if exists causal_revision_star_letter_archives on public.star_letter_archives;
create trigger causal_revision_star_letter_archives
after insert or update or delete on public.star_letter_archives
for each row execute function app_private.track_star_letter_archive_revision();

drop trigger if exists causal_revision_profile_blocks on public.profile_blocks;
create trigger causal_revision_profile_blocks
after insert or update or delete on public.profile_blocks
for each row execute function app_private.track_viewer_context_revision();

drop trigger if exists causal_revision_profiles on public.profiles;
create trigger causal_revision_profiles
after insert on public.profiles
for each row execute function app_private.track_profile_viewer_context_revision();

-- Idempotent backfill. A row created by a trigger always wins over baseline 1.
insert into app_private.post_domain_revisions (
  post_id, domain, revision, tombstoned, author_id, was_public, changed_at
)
select
  p.id,
  domain.name,
  1,
  p.deleted_at is not null,
  p.author_id,
  p.visibility = 'public',
  coalesce(p.updated_at, p.created_at, now())
from public.posts p
cross join (values ('post_content'), ('post_assets'), ('resonance'), ('star_thread')) as domain(name)
on conflict (post_id, domain) do nothing;

insert into app_private.viewer_post_domain_revisions (
  viewer_id, post_id, domain, revision, changed_at
)
select a.profile_id, a.post_id, 'archive', 1, max(a.created_at)
from public.archives a
group by a.profile_id, a.post_id
on conflict (viewer_id, post_id, domain) do nothing;

insert into app_private.viewer_post_domain_revisions (
  viewer_id, post_id, domain, revision, changed_at
)
select source.viewer_id, source.post_id, 'star_thread_viewer', 1, max(source.changed_at)
from (
  select sla.profile_id as viewer_id, sla.post_id, sla.created_at as changed_at
  from public.star_letter_archives sla
  union all
  select slr.profile_id, sl.post_id, slr.created_at
  from public.star_letter_resonances slr
  join public.star_letters sl on sl.id = slr.star_letter_id
) source
group by source.viewer_id, source.post_id
on conflict (viewer_id, post_id, domain) do nothing;

insert into app_private.viewer_context_revisions (viewer_id, revision, changed_at)
select p.id, 1, now()
from public.profiles p
on conflict (viewer_id) do nothing;

create or replace function public.get_post_snapshots_v1(p_post_ids uuid[])
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
  tag_rows jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
begin
  if coalesce(cardinality(p_post_ids), 0) > 100 then
    raise exception 'too many post ids' using errcode = '22023';
  end if;

  return query
  with requested as (
    select distinct requested_id as post_id
    from unnest(coalesce(p_post_ids, '{}'::uuid[])) requested_id
    where requested_id is not null
  ), versioned as (
    select
      requested.post_id,
      content.revision as content_revision,
      content.tombstoned,
      content.author_id as ledger_author_id,
      content.was_public,
      coalesce(assets.revision, 1) as assets_revision,
      p.*,
      (
        p.id is not null
        and p.deleted_at is null
        and app_private.can_access_post(p.id, v_viewer_id)
      ) as available
    from requested
    join app_private.post_domain_revisions content
      on content.post_id = requested.post_id
     and content.domain = 'post_content'
    left join app_private.post_domain_revisions assets
      on assets.post_id = requested.post_id
     and assets.domain = 'post_assets'
    left join public.posts p on p.id = requested.post_id
    where content.was_public or content.author_id = v_viewer_id
  )
  select
    versioned.post_id,
    versioned.post_id,
    versioned.available,
    versioned.tombstoned or versioned.deleted_at is not null or versioned.id is null,
    case when versioned.available then versioned.author_id else null end,
    case when versioned.available then versioned.type else null end,
    case when versioned.available then versioned.body else null end,
    case when versioned.available then versioned.visibility else null end,
    case when versioned.available then versioned.created_at else null end,
    case when versioned.available then versioned.updated_at else null end,
    case when versioned.available then versioned.deleted_at else null end,
    app_private.current_data_revision_epoch(),
    versioned.content_revision::text,
    versioned.assets_revision::text,
    app_private.viewer_context_revision(v_viewer_id)::text,
    case when versioned.available then media.media_rows else '[]'::jsonb end,
    case when versioned.available then tags.tag_rows else '[]'::jsonb end
  from versioned
  left join lateral (
    select coalesce(jsonb_agg(to_jsonb(pm) order by pm.sort_order, pm.id), '[]'::jsonb) as media_rows
    from public.post_media pm
    where pm.post_id = versioned.post_id
  ) media on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'post_id', pmt.post_id,
          'sort_order', pmt.sort_order,
          'meteor_tags', jsonb_build_object(
            'id', mt.id,
            'name', mt.name,
            'normalized_name', mt.normalized_name,
            'created_at', mt.created_at
          )
        ) order by pmt.sort_order, pmt.tag_id
      ),
      '[]'::jsonb
    ) as tag_rows
    from public.post_meteor_tags pmt
    join public.meteor_tags mt on mt.id = pmt.tag_id
    where pmt.post_id = versioned.post_id
  ) tags on true
  order by array_position(p_post_ids, versioned.post_id);
end;
$$;

revoke all on function public.get_post_snapshots_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_snapshots_v1(uuid[]) to anon, authenticated;

create or replace function public.get_post_engagement_snapshots_v1(p_post_ids uuid[])
returns table (
  post_id uuid,
  revision_epoch uuid,
  resonance_count bigint,
  viewer_resonance_count bigint,
  resonance_revision text,
  is_archived boolean,
  archive_id uuid,
  archived_at timestamptz,
  archive_revision text,
  viewer_context_revision text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
begin
  if coalesce(cardinality(p_post_ids), 0) > 100 then
    raise exception 'too many post ids' using errcode = '22023';
  end if;

  return query
  with requested as (
    select distinct requested_id as post_id
    from unnest(coalesce(p_post_ids, '{}'::uuid[])) requested_id
    where requested_id is not null
  )
  select
    requested.post_id,
    app_private.current_data_revision_epoch(),
    coalesce(counts.total_count, 0)::bigint,
    coalesce(counts.viewer_count, 0)::bigint,
    resonance_revision.revision::text,
    archive_row.id is not null,
    archive_row.id,
    archive_row.created_at,
    coalesce(archive_revision.revision, 0)::text,
    app_private.viewer_context_revision(v_viewer_id)::text
  from requested
  join public.posts p
    on p.id = requested.post_id
   and p.deleted_at is null
   and app_private.can_access_post(p.id, v_viewer_id)
  join app_private.post_domain_revisions resonance_revision
    on resonance_revision.post_id = requested.post_id
   and resonance_revision.domain = 'resonance'
  left join app_private.viewer_post_domain_revisions archive_revision
    on archive_revision.viewer_id = v_viewer_id
   and archive_revision.post_id = requested.post_id
   and archive_revision.domain = 'archive'
  left join public.archives archive_row
    on archive_row.profile_id = v_viewer_id
   and archive_row.post_id = requested.post_id
  left join lateral (
    select
      count(*) filter (
        where v_viewer_id is null
           or not app_private.is_black_hole_between_profiles(v_viewer_id, r.profile_id)
      )::bigint as total_count,
      count(*) filter (where r.profile_id = v_viewer_id)::bigint as viewer_count
    from public.resonances r
    where r.post_id = requested.post_id
  ) counts on true
  order by array_position(p_post_ids, requested.post_id);
end;
$$;

revoke all on function public.get_post_engagement_snapshots_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_engagement_snapshots_v1(uuid[]) to anon, authenticated;

create or replace function public.get_star_thread_snapshots_v1(p_post_ids uuid[])
returns table (
  post_id uuid,
  revision_epoch uuid,
  thread_revision text,
  viewer_revision text,
  viewer_context_revision text,
  letters jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
begin
  if coalesce(cardinality(p_post_ids), 0) > 100 then
    raise exception 'too many post ids' using errcode = '22023';
  end if;

  return query
  with requested as (
    select distinct requested_id as post_id
    from unnest(coalesce(p_post_ids, '{}'::uuid[])) requested_id
    where requested_id is not null
  )
  select
    requested.post_id,
    app_private.current_data_revision_epoch(),
    domain_revision.revision::text,
    coalesce(viewer_revision.revision, 0)::text,
    app_private.viewer_context_revision(v_viewer_id)::text,
    coalesce(thread.letters, '[]'::jsonb)
  from requested
  join public.posts p
    on p.id = requested.post_id
   and p.deleted_at is null
   and app_private.can_access_post(p.id, v_viewer_id)
  join app_private.post_domain_revisions domain_revision
    on domain_revision.post_id = requested.post_id
   and domain_revision.domain = 'star_thread'
  left join app_private.viewer_post_domain_revisions viewer_revision
    on viewer_revision.viewer_id = v_viewer_id
   and viewer_revision.post_id = requested.post_id
   and viewer_revision.domain = 'star_thread_viewer'
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', sl.id,
        'post_id', sl.post_id,
        'author_id', sl.author_id,
        'parent_star_letter_id', sl.parent_star_letter_id,
        'body', sl.body,
        'is_deleted', sl.deleted_at is not null,
        'created_at', sl.created_at,
        'updated_at', sl.updated_at,
        'edited_at', sl.edited_at,
        'total_resonance_count', coalesce(resonance_counts.total_count, 0),
        'viewer_resonance_count', coalesce(resonance_counts.viewer_count, 0),
        'is_archived', exists (
          select 1
          from public.star_letter_archives sla
          where sla.profile_id = v_viewer_id
            and sla.star_letter_id = sl.id
        )
      ) order by sl.created_at, sl.id
    ) as letters
    from public.star_letters sl
    left join lateral (
      select
        count(*) filter (
          where v_viewer_id is null
             or not app_private.is_black_hole_between_profiles(v_viewer_id, slr.profile_id)
        )::bigint as total_count,
        count(*) filter (where slr.profile_id = v_viewer_id)::bigint as viewer_count
      from public.star_letter_resonances slr
      where slr.star_letter_id = sl.id
    ) resonance_counts on true
    where sl.post_id = requested.post_id
      and (
        v_viewer_id is null
        or not app_private.is_black_hole_between_profiles(v_viewer_id, sl.author_id)
      )
  ) thread on true
  order by array_position(p_post_ids, requested.post_id);
end;
$$;

revoke all on function public.get_star_thread_snapshots_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.get_star_thread_snapshots_v1(uuid[]) to anon, authenticated;

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
      limit 100
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
    select batch_number, array_agg(post_id order by post_id) as post_ids
    from numbered_candidates
    group by batch_number
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

create or replace function app_private.star_letter_projection(
  p_star_letter_id uuid,
  p_viewer_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', sl.id,
    'post_id', sl.post_id,
    'author_id', sl.author_id,
    'parent_star_letter_id', sl.parent_star_letter_id,
    'body', sl.body,
    'is_deleted', sl.deleted_at is not null,
    'created_at', sl.created_at,
    'updated_at', sl.updated_at,
    'edited_at', sl.edited_at,
    'total_resonance_count', (
      select count(*)
      from public.star_letter_resonances slr
      where slr.star_letter_id = sl.id
        and (
          p_viewer_id is null
          or not app_private.is_black_hole_between_profiles(p_viewer_id, slr.profile_id)
        )
    ),
    'viewer_resonance_count', (
      select count(*)
      from public.star_letter_resonances slr
      where slr.star_letter_id = sl.id
        and slr.profile_id = p_viewer_id
    ),
    'is_archived', exists (
      select 1
      from public.star_letter_archives sla
      where sla.star_letter_id = sl.id
        and sla.profile_id = p_viewer_id
    )
  )
  from public.star_letters sl
  where sl.id = p_star_letter_id;
$$;

create or replace function app_private.star_thread_version_json(
  p_post_id uuid,
  p_viewer_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'revision_epoch', app_private.current_data_revision_epoch(),
    'thread_revision', coalesce((
      select revision
      from app_private.post_domain_revisions
      where post_id = p_post_id and domain = 'star_thread'
    ), 0)::text,
    'viewer_revision', coalesce((
      select revision
      from app_private.viewer_post_domain_revisions
      where viewer_id = p_viewer_id
        and post_id = p_post_id
        and domain = 'star_thread_viewer'
    ), 0)::text,
    'viewer_context_revision', app_private.viewer_context_revision(p_viewer_id)::text
  );
$$;

revoke all on function app_private.star_letter_projection(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.star_thread_version_json(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_post_v1(
  p_body text,
  p_type text,
  p_visibility text default 'public'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_result jsonb;
begin
  if v_user_id is null
    or p_type not in ('text', 'image', 'video')
    or p_visibility not in ('public', 'private')
    or p_body is null
    or char_length(p_body) > 500
  then
    raise exception 'invalid post payload' using errcode = '22023';
  end if;

  insert into public.posts (author_id, type, body, visibility)
  values (v_user_id, p_type, p_body, p_visibility)
  returning id into v_post_id;

  select to_jsonb(snapshot)
  into v_result
  from public.get_post_snapshots_v1(array[v_post_id]) snapshot;

  return v_result;
end;
$$;

revoke all on function public.create_post_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.create_post_v1(text, text, text) to authenticated;

create or replace function public.update_post_v1(
  p_post_id uuid,
  p_body text,
  p_tag_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tag_count integer;
  v_result jsonb;
begin
  if v_user_id is null
    or p_post_id is null
    or p_body is null
    or char_length(p_body) > 500
    or coalesce(cardinality(p_tag_ids), 0) > 3
    or coalesce(cardinality(p_tag_ids), 0) <> coalesce((
      select count(distinct requested.tag_id)
      from unnest(coalesce(p_tag_ids, '{}'::uuid[])) as requested(tag_id)
    ), 0)
  then
    raise exception 'invalid post update payload' using errcode = '22023';
  end if;

  select count(*) into v_tag_count
  from public.meteor_tags
  where id = any(coalesce(p_tag_ids, '{}'::uuid[]));
  if v_tag_count <> coalesce(cardinality(p_tag_ids), 0) then
    raise exception 'unknown meteor tag' using errcode = '22023';
  end if;

  perform 1
  from public.posts p
  where p.id = p_post_id
    and p.author_id = v_user_id
    and p.deleted_at is null
  for update;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  update public.posts
  set body = p_body, updated_at = now()
  where id = p_post_id;

  delete from public.post_meteor_tags where post_id = p_post_id;
  insert into public.post_meteor_tags (post_id, tag_id, sort_order)
  select p_post_id, value, (ordinality - 1)::integer
  from unnest(coalesce(p_tag_ids, '{}'::uuid[])) with ordinality as requested(value, ordinality);

  select to_jsonb(snapshot)
  into v_result
  from public.get_post_snapshots_v1(array[p_post_id]) snapshot;
  return v_result;
end;
$$;

revoke all on function public.update_post_v1(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.update_post_v1(uuid, text, uuid[]) to authenticated;

create or replace function public.replace_post_tags_v1(
  p_post_id uuid,
  p_tag_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tag_count integer;
  v_assets_revision bigint;
begin
  if v_user_id is null
    or p_post_id is null
    or coalesce(cardinality(p_tag_ids), 0) > 3
    or coalesce(cardinality(p_tag_ids), 0) <> coalesce((
      select count(distinct requested.tag_id)
      from unnest(coalesce(p_tag_ids, '{}'::uuid[])) as requested(tag_id)
    ), 0)
  then
    raise exception 'invalid post tag payload' using errcode = '22023';
  end if;

  perform 1 from public.posts
  where id = p_post_id and author_id = v_user_id and deleted_at is null
  for update;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  select count(*) into v_tag_count
  from public.meteor_tags
  where id = any(coalesce(p_tag_ids, '{}'::uuid[]));
  if v_tag_count <> coalesce(cardinality(p_tag_ids), 0) then
    raise exception 'unknown meteor tag' using errcode = '22023';
  end if;

  delete from public.post_meteor_tags where post_id = p_post_id;
  insert into public.post_meteor_tags (post_id, tag_id, sort_order)
  select p_post_id, value, (ordinality - 1)::integer
  from unnest(coalesce(p_tag_ids, '{}'::uuid[])) with ordinality as requested(value, ordinality);

  select revision into v_assets_revision
  from app_private.post_domain_revisions
  where post_id = p_post_id and domain = 'post_assets';

  return jsonb_build_object(
    'post_id', p_post_id,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'assets_revision', v_assets_revision::text,
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  );
end;
$$;

revoke all on function public.replace_post_tags_v1(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.replace_post_tags_v1(uuid, uuid[]) to authenticated;

create or replace function public.insert_post_assets_v1(
  p_post_id uuid,
  p_media_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assets_revision bigint;
  v_media_rows jsonb;
begin
  if v_user_id is null
    or p_post_id is null
    or jsonb_typeof(coalesce(p_media_rows, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_media_rows, '[]'::jsonb)) > 4
  then
    raise exception 'invalid post asset payload' using errcode = '22023';
  end if;

  perform 1 from public.posts
  where id = p_post_id and author_id = v_user_id and deleted_at is null
  for update;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  insert into public.post_media (
    post_id,
    uploader_id,
    media_type,
    storage_path,
    thumbnail_storage_path,
    duration_seconds,
    sort_order,
    mime_type,
    size_bytes
  )
  select
    p_post_id,
    v_user_id,
    media_input.media_type,
    media_input.storage_path,
    media_input.thumbnail_storage_path,
    media_input.duration_seconds,
    media_input.sort_order,
    media_input.mime_type,
    media_input.size_bytes
  from jsonb_to_recordset(coalesce(p_media_rows, '[]'::jsonb)) as media_input(
    media_type text,
    storage_path text,
    thumbnail_storage_path text,
    duration_seconds numeric,
    sort_order integer,
    mime_type text,
    size_bytes bigint
  );

  select revision into v_assets_revision
  from app_private.post_domain_revisions
  where post_id = p_post_id and domain = 'post_assets';
  select coalesce(jsonb_agg(to_jsonb(pm) order by pm.sort_order, pm.id), '[]'::jsonb)
  into v_media_rows
  from public.post_media pm
  where pm.post_id = p_post_id;

  return jsonb_build_object(
    'post_id', p_post_id,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'assets_revision', v_assets_revision::text,
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text,
    'media_rows', v_media_rows
  );
end;
$$;

revoke all on function public.insert_post_assets_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_post_assets_v1(uuid, jsonb) to authenticated;

create or replace function public.delete_post_v1(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_at timestamptz := now();
  v_content_revision bigint;
begin
  if v_user_id is null or p_post_id is null then
    raise exception 'invalid post delete payload' using errcode = '22023';
  end if;

  update public.posts
  set deleted_at = v_deleted_at, updated_at = v_deleted_at
  where id = p_post_id
    and author_id = v_user_id
    and deleted_at is null;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  select revision into v_content_revision
  from app_private.post_domain_revisions
  where post_id = p_post_id and domain = 'post_content';

  return jsonb_build_object(
    'id', p_post_id,
    'post_id', p_post_id,
    'available', false,
    'tombstoned', true,
    'deleted_at', v_deleted_at,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'content_revision', v_content_revision::text,
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  );
end;
$$;

revoke all on function public.delete_post_v1(uuid) from public, anon, authenticated;
grant execute on function public.delete_post_v1(uuid) to authenticated;

create or replace function public.add_post_resonance_v1(
  p_post_id uuid,
  p_resonance_type text default 'sparkle'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_resonance_id uuid;
  v_count bigint;
  v_viewer_count bigint;
  v_revision bigint;
begin
  if v_user_id is null
    or p_post_id is null
    or p_resonance_type not in ('silent', 'sparkle', 'afterglow', 'life', 'world', 'deep')
  then
    raise exception 'invalid resonance payload' using errcode = '22023';
  end if;
  if not app_private.lock_accessible_post(p_post_id, v_user_id) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  insert into public.resonances (post_id, profile_id, resonance_type)
  values (p_post_id, v_user_id, p_resonance_type)
  returning id into v_resonance_id;

  select
    count(*) filter (
      where not app_private.is_black_hole_between_profiles(v_user_id, r.profile_id)
    ),
    count(*) filter (where r.profile_id = v_user_id)
  into v_count, v_viewer_count
  from public.resonances r
  where r.post_id = p_post_id;
  select revision into v_revision
  from app_private.post_domain_revisions
  where post_id = p_post_id and domain = 'resonance';

  return jsonb_build_object(
    'outcome', 'created',
    'post_id', p_post_id,
    'resonance_id', v_resonance_id,
    'resonance_count', v_count,
    'viewer_resonance_count', v_viewer_count,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'resonance_revision', v_revision::text,
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  );
end;
$$;

revoke all on function public.add_post_resonance_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.add_post_resonance_v1(uuid, text) to authenticated;

create or replace function public.remove_post_resonance_v1(p_resonance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_count bigint;
  v_viewer_count bigint;
  v_revision bigint;
begin
  if v_user_id is null or p_resonance_id is null then
    raise exception 'invalid resonance payload' using errcode = '22023';
  end if;

  delete from public.resonances r
  where r.id = p_resonance_id and r.profile_id = v_user_id
  returning r.post_id into v_post_id;
  if v_post_id is null then
    raise exception 'resonance not found' using errcode = 'P0002';
  end if;

  select
    count(*) filter (
      where not app_private.is_black_hole_between_profiles(v_user_id, r.profile_id)
    ),
    count(*) filter (where r.profile_id = v_user_id)
  into v_count, v_viewer_count
  from public.resonances r
  where r.post_id = v_post_id;
  select revision into v_revision
  from app_private.post_domain_revisions
  where post_id = v_post_id and domain = 'resonance';

  return jsonb_build_object(
    'outcome', 'deleted',
    'post_id', v_post_id,
    'resonance_id', p_resonance_id,
    'resonance_count', v_count,
    'viewer_resonance_count', v_viewer_count,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'resonance_revision', v_revision::text,
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  );
end;
$$;

revoke all on function public.remove_post_resonance_v1(uuid) from public, anon, authenticated;
grant execute on function public.remove_post_resonance_v1(uuid) to authenticated;

create or replace function public.set_post_archive_v1(
  p_post_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archive_id uuid;
  v_archived_at timestamptz;
  v_archive_revision bigint;
  v_snapshot jsonb;
begin
  if v_user_id is null or p_post_id is null or p_archived is null then
    raise exception 'invalid archive payload' using errcode = '22023';
  end if;
  if not app_private.lock_accessible_post(p_post_id, v_user_id) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  if p_archived then
    insert into public.archives (profile_id, post_id)
    values (v_user_id, p_post_id)
    on conflict (profile_id, post_id)
    do update set post_id = excluded.post_id
    returning id, created_at into v_archive_id, v_archived_at;
  else
    delete from public.archives a
    where a.profile_id = v_user_id and a.post_id = p_post_id
    returning a.id, a.created_at into v_archive_id, v_archived_at;
  end if;

  select revision into v_archive_revision
  from app_private.viewer_post_domain_revisions
  where viewer_id = v_user_id and post_id = p_post_id and domain = 'archive';
  select to_jsonb(snapshot) into v_snapshot
  from public.get_post_snapshots_v1(array[p_post_id]) snapshot;

  return coalesce(v_snapshot, jsonb_build_object(
    'post_id', p_post_id,
    'id', p_post_id,
    'available', false,
    'tombstoned', true,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'content_revision', '0',
    'assets_revision', '0',
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  )) || jsonb_build_object(
    'outcome', case when p_archived then 'archived' else 'unarchived' end,
    'is_archived', p_archived,
    'archive_id', case when p_archived then v_archive_id else null end,
    'archived_at', case when p_archived then v_archived_at else null end,
    'archive_revision', coalesce(v_archive_revision, 0)::text
  );
end;
$$;

revoke all on function public.set_post_archive_v1(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_post_archive_v1(uuid, boolean) to authenticated;

create or replace function public.create_star_letter_v2(
  p_post_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_letter_id uuid;
begin
  if v_user_id is null
    or p_post_id is null
    or p_body is null
    or p_body <> btrim(p_body)
    or char_length(p_body) < 1
    or char_length(p_body) > 500
  then
    raise exception 'invalid star letter payload' using errcode = '22023';
  end if;
  if not app_private.lock_accessible_post(p_post_id, v_user_id) then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  insert into public.star_letters (post_id, author_id, body)
  values (p_post_id, v_user_id, p_body)
  returning id into v_letter_id;

  return jsonb_build_object(
    'outcome', 'created',
    'post_id', p_post_id,
    'star_letter_id', v_letter_id,
    'letter', app_private.star_letter_projection(v_letter_id, v_user_id),
    'removed', false
  ) || app_private.star_thread_version_json(p_post_id, v_user_id);
end;
$$;

revoke all on function public.create_star_letter_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.create_star_letter_v2(uuid, text) to authenticated;

create or replace function public.create_star_letter_reply_v2(
  p_parent_star_letter_id uuid,
  p_body text,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outcome text;
  v_letter_id uuid;
  v_post_id uuid;
begin
  select result.outcome, result.star_letter_id, result.post_id
  into v_outcome, v_letter_id, v_post_id
  from public.create_star_letter_reply(
    p_parent_star_letter_id,
    p_body,
    p_client_request_id
  ) result;

  if v_outcome not in ('created', 'already_created') then
    v_letter_id := null;
    v_post_id := null;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'post_id', v_post_id,
    'star_letter_id', v_letter_id,
    'letter', app_private.star_letter_projection(v_letter_id, v_user_id),
    'removed', false
  ) || app_private.star_thread_version_json(v_post_id, v_user_id);
end;
$$;

revoke all on function public.create_star_letter_reply_v2(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_star_letter_reply_v2(uuid, text, uuid) to authenticated;

create or replace function public.update_star_letter_v2(
  p_star_letter_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outcome text;
  v_letter_id uuid;
  v_updated_at timestamptz;
  v_post_id uuid;
begin
  select post_id into v_post_id
  from public.star_letters
  where id = p_star_letter_id;

  select result.outcome, result.star_letter_id, result.updated_at
  into v_outcome, v_letter_id, v_updated_at
  from public.update_star_letter(p_star_letter_id, p_body) result;

  if v_outcome <> 'updated' then
    v_letter_id := null;
    v_post_id := null;
    v_updated_at := null;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'post_id', v_post_id,
    'star_letter_id', v_letter_id,
    'letter', app_private.star_letter_projection(v_letter_id, v_user_id),
    'removed', false,
    'updated_at', v_updated_at
  ) || app_private.star_thread_version_json(v_post_id, v_user_id);
end;
$$;

revoke all on function public.update_star_letter_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.update_star_letter_v2(uuid, text) to authenticated;

create or replace function public.delete_star_letter_v2(p_star_letter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outcome text;
  v_letter_id uuid;
  v_post_id uuid;
  v_letter jsonb;
begin
  select post_id into v_post_id
  from public.star_letters
  where id = p_star_letter_id;

  select result.outcome, result.star_letter_id
  into v_outcome, v_letter_id
  from public.delete_star_letter(p_star_letter_id) result;

  if v_outcome not in ('deleted', 'soft_deleted', 'already_deleted') then
    v_letter_id := null;
    v_post_id := null;
  end if;
  v_letter := app_private.star_letter_projection(v_letter_id, v_user_id);

  return jsonb_build_object(
    'outcome', v_outcome,
    'post_id', v_post_id,
    'star_letter_id', v_letter_id,
    'letter', v_letter,
    'removed', v_letter is null
  ) || app_private.star_thread_version_json(v_post_id, v_user_id);
end;
$$;

revoke all on function public.delete_star_letter_v2(uuid) from public, anon, authenticated;
grant execute on function public.delete_star_letter_v2(uuid) to authenticated;

create or replace function public.add_star_letter_resonance_v2(
  p_star_letter_id uuid,
  p_client_request_id uuid,
  p_resonance_type text default 'silent'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outcome text;
  v_resonance_id uuid;
  v_total bigint;
  v_viewer bigint;
  v_post_id uuid;
  v_projection jsonb;
begin
  select post_id into v_post_id
  from public.star_letters
  where id = p_star_letter_id;

  select
    result.outcome,
    result.resonance_id,
    result.total_resonance_count,
    result.viewer_resonance_count
  into v_outcome, v_resonance_id, v_total, v_viewer
  from public.add_star_letter_resonance(
    p_star_letter_id,
    p_client_request_id,
    p_resonance_type
  ) result;

  if v_outcome in ('created', 'already_created') then
    v_projection := app_private.star_letter_projection(p_star_letter_id, v_user_id);
    v_total := coalesce((v_projection ->> 'total_resonance_count')::bigint, 0);
    v_viewer := coalesce((v_projection ->> 'viewer_resonance_count')::bigint, 0);
  else
    v_post_id := null;
    v_resonance_id := null;
    v_total := 0;
    v_viewer := 0;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'post_id', v_post_id,
    'star_letter_id', p_star_letter_id,
    'resonance_id', v_resonance_id,
    'total_resonance_count', v_total,
    'viewer_resonance_count', v_viewer
  ) || app_private.star_thread_version_json(v_post_id, v_user_id);
end;
$$;

revoke all on function public.add_star_letter_resonance_v2(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.add_star_letter_resonance_v2(uuid, uuid, text) to authenticated;

create or replace function public.set_star_letter_archive_v2(
  p_star_letter_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outcome text;
  v_archive_id uuid;
  v_post_id uuid;
  v_is_archived boolean;
  v_archived_at timestamptz;
begin
  select
    result.outcome,
    result.archive_id,
    result.post_id,
    result.is_archived
  into v_outcome, v_archive_id, v_post_id, v_is_archived
  from public.set_star_letter_archive(p_star_letter_id, p_archived) result;

  if v_outcome not in ('archived', 'unarchived', 'already_unarchived') then
    v_archive_id := null;
    v_post_id := null;
    v_is_archived := false;
  end if;

  if v_is_archived and v_archive_id is not null then
    select created_at into v_archived_at
    from public.star_letter_archives
    where id = v_archive_id and profile_id = v_user_id;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'post_id', v_post_id,
    'star_letter_id', p_star_letter_id,
    'archive_id', v_archive_id,
    'archived_at', v_archived_at,
    'is_archived', v_is_archived
  ) || app_private.star_thread_version_json(v_post_id, v_user_id);
end;
$$;

revoke all on function public.set_star_letter_archive_v2(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_star_letter_archive_v2(uuid, boolean) to authenticated;

-- Blocking changes every viewer-dependent projection. These wrappers keep the
-- existing authorization rules, while returning the new viewer-context floor
-- from the same transaction as the block mutation.
create or replace function public.block_profile_v2(p_target_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outcome text;
  v_block_id uuid;
begin
  select result.outcome, result.block_id
  into v_outcome, v_block_id
  from public.block_profile(p_target_profile_id) result;

  return jsonb_build_object(
    'outcome', v_outcome,
    'block_id', v_block_id,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  );
end;
$$;

revoke all on function public.block_profile_v2(uuid) from public, anon, authenticated;
grant execute on function public.block_profile_v2(uuid) to authenticated;

create or replace function public.unblock_profile_v2(p_target_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outcome text;
  v_block_id uuid;
begin
  select result.outcome, result.block_id
  into v_outcome, v_block_id
  from public.unblock_profile(p_target_profile_id) result;

  return jsonb_build_object(
    'outcome', v_outcome,
    'block_id', v_block_id,
    'revision_epoch', app_private.current_data_revision_epoch(),
    'viewer_context_revision', app_private.viewer_context_revision(v_user_id)::text
  );
end;
$$;

revoke all on function public.unblock_profile_v2(uuid) from public, anon, authenticated;
grant execute on function public.unblock_profile_v2(uuid) to authenticated;

commit;

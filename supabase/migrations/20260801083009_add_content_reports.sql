begin;

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reporter_original_id uuid not null,
  target_type text not null,
  target_original_id uuid not null,
  target_post_id uuid references public.posts(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open',
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  constraint content_reports_reporter_reference_check check (
    reporter_id is null or reporter_id = reporter_original_id
  ),
  constraint content_reports_target_type_check check (
    target_type in ('post', 'profile')
  ),
  constraint content_reports_target_reference_check check (
    (
      target_type = 'post'
      and target_profile_id is null
      and (target_post_id is null or target_post_id = target_original_id)
    )
    or (
      target_type = 'profile'
      and target_post_id is null
      and (target_profile_id is null or target_profile_id = target_original_id)
    )
  ),
  constraint content_reports_reason_check check (
    reason in (
      'harassment',
      'hate_or_abuse',
      'sexual_content',
      'violence_or_danger',
      'self_harm',
      'impersonation',
      'spam_or_fraud',
      'personal_information',
      'copyright',
      'other'
    )
  ),
  constraint content_reports_details_check check (
    details is null
    or (
      details = btrim(details)
      and details <> ''
      and char_length(details) <= 1000
    )
  ),
  constraint content_reports_status_check check (
    status in ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  constraint content_reports_snapshot_check check (
    jsonb_typeof(snapshot) = 'object'
  ),
  constraint content_reports_resolution_note_check check (
    resolution_note is null
    or (
      resolution_note = btrim(resolution_note)
      and resolution_note <> ''
      and char_length(resolution_note) <= 2000
    )
  )
);

comment on table public.content_reports is
  '観測局へ送られた異常報告。browserからの直接参照・変更は禁止し、送信と運営確認は専用RPCだけを使用する。';
comment on column public.content_reports.reporter_original_id is
  '送信者プロフィールが削除された後も監査対象を識別する元UUID。一般ユーザーには公開しない。';
comment on column public.content_reports.target_original_id is
  '対象が削除された後もsnapshotと結び付ける元UUID。';
comment on column public.content_reports.snapshot is
  '送信時点の対象内容をDB側で生成した監査用snapshot。クライアント入力は受け付けない。';

create index content_reports_reporter_target_reason_created_idx
  on public.content_reports(
    reporter_original_id,
    target_type,
    target_original_id,
    reason,
    created_at desc,
    id desc
  );
create index content_reports_status_created_idx
  on public.content_reports(status, created_at desc, id desc);
create index content_reports_target_created_idx
  on public.content_reports(target_type, target_original_id, created_at desc);
create index content_reports_reporter_id_idx
  on public.content_reports(reporter_id)
  where reporter_id is not null;
create index content_reports_target_post_id_idx
  on public.content_reports(target_post_id)
  where target_post_id is not null;
create index content_reports_target_profile_id_idx
  on public.content_reports(target_profile_id)
  where target_profile_id is not null;
create index content_reports_reviewed_by_idx
  on public.content_reports(reviewed_by)
  where reviewed_by is not null;

alter table public.notifications
  add column content_report_id uuid references public.content_reports(id) on delete set null;

create index notifications_content_report_id_idx
  on public.notifications(content_report_id)
  where content_report_id is not null;

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'resonance',
    'archive',
    'star_letter',
    'star_letter_reply',
    'star_letter_resonance',
    'content_report'
  ));

alter table public.notifications
  add constraint notifications_content_report_reference_check
  check (content_report_id is null or type = 'content_report');

comment on column public.notifications.content_report_id is
  '観測局の管理通知が指すreport。対象ユーザーや送信者へは公開せず、管理者のR.Connect遷移だけに使用する。';
comment on column public.notifications.type is
  '通知タイプ。content_reportは観測局に新しい異常が作成された時だけapp_adminへ送る管理通知。';

alter table public.content_reports enable row level security;

revoke all on table public.content_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.content_reports to service_role;

create or replace function public.create_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns table (
  outcome text,
  report_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_target_author_id uuid;
  v_target_post public.posts%rowtype;
  v_target_profile public.profiles%rowtype;
  v_snapshot jsonb;
  v_existing_report_id uuid;
  v_report_id uuid;
begin
  if v_reporter_id is null or p_target_id is null then
    return query select 'not_allowed'::text, null::uuid;
    return;
  end if;

  if p_target_type is null or p_target_type not in ('post', 'profile') then
    return query select 'invalid_target'::text, null::uuid;
    return;
  end if;

  if p_reason is null or p_reason not in (
    'harassment',
    'hate_or_abuse',
    'sexual_content',
    'violence_or_danger',
    'self_harm',
    'impersonation',
    'spam_or_fraud',
    'personal_information',
    'copyright',
    'other'
  ) then
    return query select 'invalid_reason'::text, null::uuid;
    return;
  end if;

  if v_details is not null and char_length(v_details) > 1000 then
    return query select 'invalid_details'::text, null::uuid;
    return;
  end if;

  if p_target_type = 'post' then
    select post.*
    into v_target_post
    from public.posts post
    where post.id = p_target_id
      and post.visibility = 'public'
      and post.deleted_at is null
    for share;

    if not found then
      return query select 'not_found'::text, null::uuid;
      return;
    end if;

    v_target_author_id := v_target_post.author_id;

    if v_target_author_id = v_reporter_id then
      return query select 'not_allowed'::text, null::uuid;
      return;
    end if;

    select jsonb_build_object(
      'id', v_target_post.id,
      'author_id', v_target_post.author_id,
      'body', left(coalesce(v_target_post.body, ''), 500),
      'body_truncated', char_length(coalesce(v_target_post.body, '')) > 500,
      'type', left(v_target_post.type, 32),
      'visibility', left(v_target_post.visibility, 32),
      'created_at', v_target_post.created_at,
      'youtube_video_id', left(v_target_post.youtube_video_id, 128),
      'youtube_video_id_truncated', char_length(coalesce(v_target_post.youtube_video_id, '')) > 128,
      'media', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'media_type', left(media.media_type, 32),
              'storage_path', left(media.storage_path, 1024),
              'storage_path_truncated', char_length(coalesce(media.storage_path, '')) > 1024,
              'thumbnail_storage_path', left(media.thumbnail_storage_path, 1024),
              'thumbnail_storage_path_truncated', char_length(coalesce(media.thumbnail_storage_path, '')) > 1024,
              'duration_seconds', media.duration_seconds,
              'sort_order', media.sort_order,
              'mime_type', left(media.mime_type, 128),
              'size_bytes', media.size_bytes
            )
            order by media.sort_order, media.id
          )
          from public.post_media media
          where media.post_id = v_target_post.id
        ),
        '[]'::jsonb
      )
    )
    into v_snapshot;
  else
    select target_profile.*
    into v_target_profile
    from public.profiles target_profile
    where target_profile.id = p_target_id
    for share;

    if not found then
      return query select 'not_found'::text, null::uuid;
      return;
    end if;

    if v_target_profile.id = v_reporter_id then
      return query select 'not_allowed'::text, null::uuid;
      return;
    end if;

    v_target_author_id := v_target_profile.id;

    select jsonb_build_object(
      'id', v_target_profile.id,
      'display_name', left(v_target_profile.display_name, 120),
      'display_name_truncated', char_length(coalesce(v_target_profile.display_name, '')) > 120,
      'username', left(v_target_profile.username, 32),
      'username_truncated', char_length(coalesce(v_target_profile.username, '')) > 32,
      'bio', left(v_target_profile.bio, 2000),
      'bio_truncated', char_length(coalesce(v_target_profile.bio, '')) > 2000,
      'avatar_url', case
        when v_target_profile.avatar_url is null
          or char_length(v_target_profile.avatar_url) > 2048
          or lower(v_target_profile.avatar_url) like 'data:%'
          or lower(v_target_profile.avatar_url) like 'blob:%'
          or lower(v_target_profile.avatar_url) like '%/object/sign/%'
          or v_target_profile.avatar_url ~* '[?&](token|signature|x-amz-signature|expires|policy|key-pair-id)='
        then null
        else left(v_target_profile.avatar_url, 2048)
      end,
      'avatar_url_truncated', char_length(coalesce(v_target_profile.avatar_url, '')) > 2048
    )
    into v_snapshot;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        v_reporter_id::text,
        p_target_type,
        p_target_id::text,
        p_reason
      ),
      0
    )
  );

  select report.id
  into v_existing_report_id
  from public.content_reports report
  where report.reporter_original_id = v_reporter_id
    and report.target_type = p_target_type
    and report.target_original_id = p_target_id
    and report.reason = p_reason
    and report.created_at >= now() - interval '24 hours'
  order by report.created_at desc, report.id desc
  limit 1;

  if v_existing_report_id is not null then
    return query select 'already_reported'::text, v_existing_report_id;
    return;
  end if;

  insert into public.content_reports (
    reporter_id,
    reporter_original_id,
    target_type,
    target_original_id,
    target_post_id,
    target_profile_id,
    reason,
    details,
    snapshot
  )
  values (
    v_reporter_id,
    v_reporter_id,
    p_target_type,
    p_target_id,
    case when p_target_type = 'post' then p_target_id else null end,
    case when p_target_type = 'profile' then p_target_id else null end,
    p_reason,
    v_details,
    v_snapshot
  )
  returning id into v_report_id;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    star_letter_id,
    content_report_id,
    type,
    message
  )
  select
    admin_user.user_id,
    null,
    null,
    null,
    v_report_id,
    'content_report',
    '観測局に新しい異常が届きました'
  from public.app_admins admin_user
  join public.profiles admin_profile
    on admin_profile.id = admin_user.user_id
  where admin_user.user_id <> v_reporter_id
    and admin_user.user_id <> v_target_author_id;

  return query select 'created'::text, v_report_id;
end;
$$;

comment on function public.create_content_report(text, uuid, text, text) is
  '認証ユーザー専用。送信者と上限付きsnapshotをDBで確定し、24時間重複を抑止してcreated時だけapp_admin通知を同一transactionで作る。';

revoke all on function public.create_content_report(text, uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_content_report(text, uuid, text, text)
to authenticated, service_role;

create or replace function public.get_content_reports(
  p_status text default null,
  p_limit integer default 100
)
returns table (
  report_id uuid,
  reporter_id uuid,
  reporter_original_id uuid,
  reporter_display_name text,
  reporter_username text,
  target_type text,
  target_original_id uuid,
  target_post_id uuid,
  target_profile_id uuid,
  reason text,
  details text,
  report_status text,
  snapshot jsonb,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_by_display_name text,
  resolution_note text,
  target_report_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_user_id is null or not public.is_app_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_status is not null
    and p_status not in ('open', 'reviewing', 'resolved', 'dismissed')
  then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  return query
  with target_counts as (
    select
      report.target_type,
      report.target_original_id,
      count(*)::bigint as report_count
    from public.content_reports report
    group by report.target_type, report.target_original_id
  )
  select
    report.id,
    report.reporter_id,
    report.reporter_original_id,
    reporter.display_name,
    reporter.username,
    report.target_type,
    report.target_original_id,
    report.target_post_id,
    report.target_profile_id,
    report.reason,
    report.details,
    report.status,
    report.snapshot,
    report.created_at,
    report.reviewed_at,
    report.reviewed_by,
    reviewer.display_name,
    report.resolution_note,
    target_counts.report_count
  from public.content_reports report
  join target_counts
    on target_counts.target_type = report.target_type
    and target_counts.target_original_id = report.target_original_id
  left join public.profiles reporter
    on reporter.id = report.reporter_id
  left join public.profiles reviewer
    on reviewer.id = report.reviewed_by
  where p_status is null or report.status = p_status
  order by report.created_at desc, report.id desc
  limit v_limit;
end;
$$;

comment on function public.get_content_reports(text, integer) is
  'app_admin専用。一般ユーザーへ非公開の観測局一覧・詳細をsnapshot付きで返す。';

revoke all on function public.get_content_reports(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_content_reports(text, integer)
to authenticated, service_role;

create or replace function public.update_content_report(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns table (
  outcome text,
  report_id uuid,
  report_status text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  resolution_note text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_resolution_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
begin
  if v_user_id is null or not public.is_app_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_report_id is null
    or p_status is null
    or p_status not in ('open', 'reviewing', 'resolved', 'dismissed')
  then
    return query
    select 'invalid_payload'::text, null::uuid, null::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  if v_resolution_note is not null and char_length(v_resolution_note) > 2000 then
    return query
    select 'invalid_payload'::text, null::uuid, null::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  return query
  update public.content_reports report
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    resolution_note = v_resolution_note
  where report.id = p_report_id
  returning
    'updated'::text,
    report.id,
    report.status,
    report.reviewed_at,
    report.reviewed_by,
    report.resolution_note;

  if not found then
    return query
    select 'not_found'::text, null::uuid, null::text, null::timestamptz, null::uuid, null::text;
  end if;
end;
$$;

comment on function public.update_content_report(uuid, text, text) is
  'app_admin専用。statusとresolution_noteを更新し、reviewed_at/reviewed_byはサーバー側で確定する。';

revoke all on function public.update_content_report(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.update_content_report(uuid, text, text)
to authenticated, service_role;

commit;
-- Close the remaining SEC-008 authenticated growth paths without changing the
-- existing post-resonance contract. Limits live at the database/Storage RLS
-- boundary and use an atomic token bucket so parallel requests cannot exceed
-- the configured burst capacity.

begin;

create table if not exists app_private.abuse_rate_limits (
  scope text not null,
  actor_id uuid not null,
  tokens numeric not null,
  refilled_at timestamptz not null,
  primary key (scope, actor_id),
  constraint abuse_rate_limits_scope_check check (
    scope = btrim(scope) and scope <> '' and char_length(scope) <= 96
  ),
  constraint abuse_rate_limits_tokens_check check (tokens >= 0)
);

comment on table app_private.abuse_rate_limits is
  'SEC-008用の内部token bucket。scopeとactorごとに1行だけ保持し、並列burstをatomic upsertで直列化する。';

revoke all on table app_private.abuse_rate_limits
from public, anon, authenticated;

create or replace function app_private.consume_abuse_quota(
  p_scope text,
  p_actor_id uuid,
  p_capacity numeric,
  p_refill_seconds integer,
  p_cost numeric default 1
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_allowed boolean := false;
begin
  if p_scope is null
    or p_scope <> btrim(p_scope)
    or p_scope = ''
    or char_length(p_scope) > 96
    or p_actor_id is null
    or p_capacity <= 0
    or p_refill_seconds <= 0
    or p_cost <= 0
    or p_cost > p_capacity
  then
    return false;
  end if;

  insert into app_private.abuse_rate_limits (
    scope,
    actor_id,
    tokens,
    refilled_at
  )
  values (
    p_scope,
    p_actor_id,
    p_capacity - p_cost,
    v_now
  )
  on conflict (scope, actor_id)
  do update
  set
    tokens = least(
      p_capacity,
      app_private.abuse_rate_limits.tokens
        + greatest(
            extract(epoch from (v_now - app_private.abuse_rate_limits.refilled_at)),
            0
          ) * p_capacity / p_refill_seconds
    ) - p_cost,
    refilled_at = v_now
  where least(
    p_capacity,
    app_private.abuse_rate_limits.tokens
      + greatest(
          extract(epoch from (v_now - app_private.abuse_rate_limits.refilled_at)),
          0
        ) * p_capacity / p_refill_seconds
  ) >= p_cost
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function app_private.consume_abuse_quota(text, uuid, numeric, integer, numeric)
from public, anon, authenticated, service_role;

create or replace function app_private.enforce_post_create_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null or new.author_id <> v_user_id then
    raise exception 'invalid post actor' using errcode = '42501';
  end if;

  if not app_private.consume_abuse_quota('post_create', v_user_id, 10, 3600) then
    raise exception 'post rate limit exceeded' using errcode = 'P0001';
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_post_create_rate()
from public, anon, authenticated, service_role;

drop trigger if exists posts_enforce_create_rate on public.posts;
create trigger posts_enforce_create_rate
before insert on public.posts
for each row execute function app_private.enforce_post_create_rate();

create or replace function app_private.enforce_star_letter_create_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null or new.author_id <> v_user_id then
    raise exception 'invalid star letter actor' using errcode = '42501';
  end if;

  -- A normal idempotent retry must not consume another token.
  if new.client_request_id is not null and exists (
    select 1
    from public.star_letters existing
    where existing.author_id = v_user_id
      and existing.client_request_id = new.client_request_id
  ) then
    return new;
  end if;

  if not app_private.consume_abuse_quota('star_letter_create', v_user_id, 30, 3600) then
    raise exception 'star letter rate limit exceeded' using errcode = 'P0001';
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_star_letter_create_rate()
from public, anon, authenticated, service_role;

drop trigger if exists star_letters_enforce_create_rate on public.star_letters;
create trigger star_letters_enforce_create_rate
before insert on public.star_letters
for each row execute function app_private.enforce_star_letter_create_rate();

create or replace function app_private.enforce_star_letter_resonance_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null or new.profile_id <> v_user_id then
    raise exception 'invalid star letter resonance actor' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.star_letter_resonances existing
    where existing.profile_id = v_user_id
      and existing.client_request_id = new.client_request_id
  ) then
    return new;
  end if;

  if not app_private.consume_abuse_quota('star_letter_resonance', v_user_id, 30, 3600) then
    raise exception 'star letter resonance rate limit exceeded' using errcode = 'P0001';
  end if;

  new.created_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_star_letter_resonance_rate()
from public, anon, authenticated, service_role;

drop trigger if exists star_letter_resonances_enforce_create_rate
on public.star_letter_resonances;
create trigger star_letter_resonances_enforce_create_rate
before insert on public.star_letter_resonances
for each row execute function app_private.enforce_star_letter_resonance_rate();

create or replace function app_private.enforce_feedback_create_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null then
    raise exception 'invalid feedback actor' using errcode = '42501';
  end if;

  if not app_private.consume_abuse_quota('feedback_create', v_user_id, 5, 3600) then
    raise exception 'feedback rate limit exceeded' using errcode = 'P0001';
  end if;

  new.user_id := v_user_id;
  new.status := 'new';
  new.created_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_feedback_create_rate()
from public, anon, authenticated, service_role;

drop trigger if exists feedbacks_enforce_create_rate on public.feedbacks;
create trigger feedbacks_enforce_create_rate
before insert on public.feedbacks
for each row execute function app_private.enforce_feedback_create_rate();

create or replace function app_private.enforce_meteor_tag_create_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null then
    raise exception 'invalid meteor tag actor' using errcode = '42501';
  end if;

  if not app_private.consume_abuse_quota('meteor_tag_create', v_user_id, 30, 3600) then
    raise exception 'meteor tag rate limit exceeded' using errcode = 'P0001';
  end if;

  new.created_by := v_user_id;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_meteor_tag_create_rate()
from public, anon, authenticated, service_role;

drop trigger if exists meteor_tags_enforce_create_rate on public.meteor_tags;
create trigger meteor_tags_enforce_create_rate
before insert on public.meteor_tags
for each row execute function app_private.enforce_meteor_tag_create_rate();

create or replace function app_private.enforce_app_open_create_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null then
    raise exception 'invalid app open actor' using errcode = '42501';
  end if;

  if not app_private.consume_abuse_quota('app_open_create', v_user_id, 30, 3600) then
    raise exception 'app open rate limit exceeded' using errcode = 'P0001';
  end if;

  new.user_id := v_user_id;
  new.opened_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_app_open_create_rate()
from public, anon, authenticated, service_role;

drop trigger if exists app_open_events_enforce_create_rate on public.app_open_events;
create trigger app_open_events_enforce_create_rate
before insert on public.app_open_events
for each row execute function app_private.enforce_app_open_create_rate();

create or replace function app_private.enforce_content_report_create_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null or new.reporter_original_id <> v_user_id then
    raise exception 'invalid content report actor' using errcode = '42501';
  end if;

  if not app_private.consume_abuse_quota('content_report_create', v_user_id, 10, 3600) then
    raise exception 'content report rate limit exceeded' using errcode = 'P0001';
  end if;

  new.reporter_id := v_user_id;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_content_report_create_rate()
from public, anon, authenticated, service_role;

drop trigger if exists content_reports_enforce_create_rate on public.content_reports;
create trigger content_reports_enforce_create_rate
before insert on public.content_reports
for each row execute function app_private.enforce_content_report_create_rate();

create table if not exists app_private.storage_upload_reservations (
  bucket_id text not null,
  object_name text not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  primary key (bucket_id, object_name),
  constraint storage_upload_reservations_bucket_check check (
    bucket_id in ('avatars', 'meteor-media', 'meteor-video')
  ),
  constraint storage_upload_reservations_name_check check (
    object_name = btrim(object_name)
    and object_name <> ''
    and char_length(object_name) <= 512
  ),
  constraint storage_upload_reservations_expiry_check check (
    expires_at > created_at
  ),
  constraint storage_upload_reservations_used_check check (
    used_at is null or used_at >= created_at
  )
);

create index if not exists storage_upload_reservations_actor_idx
on app_private.storage_upload_reservations(actor_id, expires_at);

revoke all on table app_private.storage_upload_reservations
from public, anon, authenticated, service_role;

create or replace function public.reserve_storage_upload_v1(
  p_bucket_id text,
  p_extension text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hour_capacity numeric;
  v_day_capacity numeric;
  v_hour_scope text;
  v_day_scope text;
  v_extension text := lower(btrim(coalesce(p_extension, '')));
  v_object_name text;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_user_id is null
  then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  case p_bucket_id
    when 'avatars' then
      if v_extension not in ('jpg', 'jpeg', 'png', 'webp') then
        raise exception 'invalid Storage extension' using errcode = '22023';
      end if;
      v_hour_capacity := 10;
      v_day_capacity := 10;
      v_hour_scope := 'storage_avatars_hour';
      v_day_scope := 'storage_avatars_day';
    when 'meteor-media' then
      if v_extension not in ('jpg', 'jpeg', 'png', 'webp') then
        raise exception 'invalid Storage extension' using errcode = '22023';
      end if;
      v_hour_capacity := 30;
      v_day_capacity := 32;
      v_hour_scope := 'storage_meteor_media_hour';
      v_day_scope := 'storage_meteor_media_day';
    when 'meteor-video' then
      if v_extension not in ('mp4', 'mov', 'webm') then
        raise exception 'invalid Storage extension' using errcode = '22023';
      end if;
      v_hour_capacity := 10;
      v_day_capacity := 5;
      v_hour_scope := 'storage_meteor_video_hour';
      v_day_scope := 'storage_meteor_video_day';
    else
      raise exception 'invalid Storage bucket' using errcode = '22023';
  end case;

  delete from app_private.storage_upload_reservations reservation
  where reservation.actor_id = v_user_id
    and (reservation.used_at is not null or reservation.expires_at <= now());

  if not (
    app_private.consume_abuse_quota(
      v_hour_scope,
      v_user_id,
      v_hour_capacity,
      3600,
      1
    ) and app_private.consume_abuse_quota(
      v_day_scope,
      v_user_id,
      v_day_capacity,
      86400,
      1
    )
  ) then
    raise exception 'storage upload rate limit exceeded' using errcode = 'P0001';
  end if;

  v_object_name := v_user_id::text || '/'
    || extensions.gen_random_uuid()::text || '.' || v_extension;

  insert into app_private.storage_upload_reservations (
    bucket_id,
    object_name,
    actor_id,
    expires_at
  ) values (
    p_bucket_id,
    v_object_name,
    v_user_id,
    now() + interval '15 minutes'
  );

  return v_object_name;
end;
$$;

revoke all on function public.reserve_storage_upload_v1(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_storage_upload_v1(text, text)
to authenticated;

create or replace function app_private.is_storage_upload_reserved(
  p_bucket_id text,
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'authenticated'
    and auth.uid() is not null
    and (storage.foldername(p_name))[1] is not distinct from auth.uid()::text
    and exists (
      select 1
      from app_private.storage_upload_reservations reservation
      where reservation.bucket_id = p_bucket_id
        and reservation.object_name = p_name
        and reservation.actor_id = auth.uid()
        and reservation.used_at is null
        and reservation.expires_at > now()
    );
$$;

revoke all on function app_private.is_storage_upload_reserved(text, text)
from public, anon, authenticated, service_role;
grant execute on function app_private.is_storage_upload_reserved(text, text)
to authenticated;

create or replace function app_private.complete_storage_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app_private.storage_upload_reservations reservation
  set used_at = coalesce(reservation.used_at, now())
  where reservation.bucket_id = new.bucket_id
    and reservation.object_name = new.name
    and reservation.actor_id::text = new.owner_id;

  return new;
end;
$$;

revoke all on function app_private.complete_storage_upload_reservation()
from public, anon, authenticated, service_role;

drop trigger if exists storage_objects_complete_upload_reservation
on storage.objects;
create trigger storage_objects_complete_upload_reservation
after insert or update of bucket_id, name, owner_id
on storage.objects
for each row execute function app_private.complete_storage_upload_reservation();

drop policy if exists avatars_insert_own_folder on storage.objects;
create policy avatars_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and app_private.is_storage_upload_reserved(bucket_id, name)
);

drop policy if exists meteor_media_insert_own_folder on storage.objects;
create policy meteor_media_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meteor-media'
  and app_private.is_storage_upload_reserved(bucket_id, name)
);

drop policy if exists meteor_video_insert_own_folder on storage.objects;
create policy meteor_video_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meteor-video'
  and app_private.is_storage_upload_reserved(bucket_id, name)
);

create or replace function public.reserve_push_subscription_test_v1(
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_profile_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not app_private.consume_abuse_quota(
    'push_subscription_test',
    p_profile_id,
    5,
    3600
  ) then
    raise exception 'push test rate limit exceeded' using errcode = 'P0001';
  end if;

  return true;
end;
$$;

revoke all on function public.reserve_push_subscription_test_v1(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_push_subscription_test_v1(uuid)
to service_role;

create table if not exists app_private.push_subscription_usage (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  active_count integer not null,
  total_count integer not null,
  constraint push_subscription_usage_count_check check (
    active_count between 0 and 20
    and total_count between 0 and 50
    and active_count <= total_count
  )
);

insert into app_private.push_subscription_usage (
  profile_id,
  active_count,
  total_count
)
select
  subscription.profile_id,
  count(*) filter (where subscription.disabled_at is null)::integer,
  count(*)::integer
from public.push_subscriptions subscription
group by subscription.profile_id
on conflict (profile_id)
do update set
  active_count = excluded.active_count,
  total_count = excluded.total_count;

revoke all on table app_private.push_subscription_usage
from public, anon, authenticated;

create or replace function app_private.increment_push_subscription_usage(
  p_profile_id uuid,
  p_add_total boolean,
  p_add_active boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
begin
  if p_profile_id is null
    or (not p_add_total and not p_add_active)
  then
    return false;
  end if;

  insert into app_private.push_subscription_usage (
    profile_id,
    active_count,
    total_count
  )
  values (
    p_profile_id,
    case when p_add_active then 1 else 0 end,
    case when p_add_total then 1 else 0 end
  )
  on conflict (profile_id)
  do update
  set
    active_count = app_private.push_subscription_usage.active_count
      + case when p_add_active then 1 else 0 end,
    total_count = app_private.push_subscription_usage.total_count
      + case when p_add_total then 1 else 0 end
  where app_private.push_subscription_usage.active_count
      + case when p_add_active then 1 else 0 end <= 20
    and app_private.push_subscription_usage.total_count
      + case when p_add_total then 1 else 0 end <= 50
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

create or replace function app_private.decrement_push_subscription_usage(
  p_profile_id uuid,
  p_remove_total boolean,
  p_remove_active boolean
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update app_private.push_subscription_usage
  set
    active_count = greatest(
      active_count - case when p_remove_active then 1 else 0 end,
      0
    ),
    total_count = greatest(
      total_count - case when p_remove_total then 1 else 0 end,
      0
    )
  where profile_id = p_profile_id;
$$;

revoke all on function app_private.increment_push_subscription_usage(uuid, boolean, boolean)
from public, anon, authenticated, service_role;
revoke all on function app_private.decrement_push_subscription_usage(uuid, boolean, boolean)
from public, anon, authenticated, service_role;

create or replace function app_private.enforce_push_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not app_private.increment_push_subscription_usage(
      new.profile_id,
      true,
      new.disabled_at is null
    ) then
      raise exception 'push subscription limit exceeded' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and new.profile_id <> old.profile_id then
    perform app_private.decrement_push_subscription_usage(
      old.profile_id,
      true,
      old.disabled_at is null
    );
    if not app_private.increment_push_subscription_usage(
      new.profile_id,
      true,
      new.disabled_at is null
    ) then
      raise exception 'push subscription limit exceeded' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and old.disabled_at is null and new.disabled_at is not null then
    perform app_private.decrement_push_subscription_usage(
      old.profile_id,
      false,
      true
    );
  elsif tg_op = 'UPDATE' and old.disabled_at is not null and new.disabled_at is null then
    if not app_private.increment_push_subscription_usage(
      new.profile_id,
      false,
      true
    ) then
      raise exception 'push subscription limit exceeded' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.release_push_subscription_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.decrement_push_subscription_usage(
    old.profile_id,
    true,
    old.disabled_at is null
  );
  return old;
end;
$$;

revoke all on function app_private.enforce_push_subscription_limit()
from public, anon, authenticated, service_role;
revoke all on function app_private.release_push_subscription_usage()
from public, anon, authenticated, service_role;

drop trigger if exists push_subscriptions_enforce_limit
on public.push_subscriptions;
create trigger push_subscriptions_enforce_limit
before insert or update of profile_id, disabled_at
on public.push_subscriptions
for each row execute function app_private.enforce_push_subscription_limit();

drop trigger if exists push_subscriptions_release_limit
on public.push_subscriptions;
create trigger push_subscriptions_release_limit
after delete on public.push_subscriptions
for each row execute function app_private.release_push_subscription_usage();

-- Current frontend writes these relations only through SECURITY DEFINER RPCs.
-- Closing the table grants makes the DB rate gates impossible to bypass.
revoke insert, update on table public.posts from public, anon, authenticated;
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_update_own on public.posts;

revoke insert on table public.star_letters from public, anon, authenticated;
revoke insert (post_id, author_id, body) on table public.star_letters
from public, anon, authenticated;
drop policy if exists star_letters_insert_logged_in on public.star_letters;

revoke insert on table public.post_media from public, anon, authenticated;
drop policy if exists post_media_insert_own_post on public.post_media;

revoke insert, delete on table public.post_meteor_tags
from public, anon, authenticated;
drop policy if exists post_meteor_tags_insert_by_post_author
on public.post_meteor_tags;
drop policy if exists post_meteor_tags_delete_by_post_author
on public.post_meteor_tags;

comment on table app_private.storage_upload_reservations is
  'Storage APIのRLS事前検査はrollbackされるため、DB RPCでquotaを消費した一時pathだけをupload可能にする内部予約。実object INSERT triggerで一度限りに使用済み化する。';
comment on function public.reserve_storage_upload_v1(text, text) is
  '15分有効のserver生成Storage pathを返す。bucket既存size/MIME上限と併用し、avatars 10件/時かつ10件/日、画像30件/時かつ32件/日、動画10件/時かつ5件/日をatomicに制限する。';
comment on function app_private.enforce_post_create_rate() is
  '認証ユーザーの流星便作成を10件/時のtoken bucketで制限する。service_role内部処理は対象外。';
comment on function app_private.enforce_star_letter_create_rate() is
  '親星文と返信を合算し、認証ユーザーあたり30件/時に制限する。';
comment on function app_private.enforce_star_letter_resonance_rate() is
  '星文共鳴を認証ユーザーあたり30件/時に制限する。既存の流星便共鳴制限は変更しない。';
comment on function app_private.enforce_feedback_create_rate() is
  'feedbackを認証ユーザーあたり5件/時に制限し、所有者とserver時刻をDBで確定する。';
comment on function app_private.enforce_meteor_tag_create_rate() is
  '新規meteor tagを認証ユーザーあたり30件/時に制限し、作成者とserver時刻をDBで確定する。';
comment on function app_private.enforce_app_open_create_rate() is
  'app open eventを認証ユーザーあたり30件/時に制限し、所有者とserver時刻をDBで確定する。';
comment on function app_private.enforce_content_report_create_rate() is
  'content reportを認証ユーザーあたり10件/時に制限し、作成者・server時刻・通知副作用を同一transactionに閉じ込める。';
comment on table app_private.push_subscription_usage is
  'Push購読をprofileごとにatomic管理し、active最大20件・総保存行最大50件を保証する内部状態。アカウント移管時は両profileの使用量も移す。';
comment on function public.reserve_push_subscription_test_v1(uuid) is
  'Netlify Function専用。本人端末へのPushテスト送信をprofileあたり5回/時に制限し、送信前にatomic予約する。';

commit;

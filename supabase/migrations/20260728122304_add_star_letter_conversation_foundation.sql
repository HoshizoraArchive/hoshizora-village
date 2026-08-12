begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter table public.star_letters
  add column if not exists parent_star_letter_id uuid,
  add column if not exists client_request_id uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.star_letters
  drop constraint if exists star_letters_parent_star_letter_id_fkey;
alter table public.star_letters
  add constraint star_letters_parent_star_letter_id_fkey
  foreign key (parent_star_letter_id)
  references public.star_letters(id)
  on delete set null;

alter table public.star_letters
  drop constraint if exists star_letters_not_own_parent_check;
alter table public.star_letters
  add constraint star_letters_not_own_parent_check
  check (parent_star_letter_id is null or parent_star_letter_id <> id);

create unique index if not exists star_letters_author_client_request_idx
on public.star_letters(author_id, client_request_id)
where client_request_id is not null;

create index if not exists star_letters_parent_created_at_idx
on public.star_letters(parent_star_letter_id, created_at, id);

create unique index if not exists star_letters_id_post_id_idx
on public.star_letters(id, post_id);

comment on column public.star_letters.parent_star_letter_id is
  '返信先の星文。nullの既存行はルート星文。同一流星便内だけを許可する。';
comment on column public.star_letters.client_request_id is
  '返信作成の再試行を冪等にする、クライアント生成UUID。';
comment on column public.star_letters.edited_at is
  '本文が最後に編集された時刻。';
comment on column public.star_letters.deleted_at is
  '返信を持つ星文をsoft deleteした時刻。本文は固定プレースホルダーへ置換する。';

create table if not exists public.star_letter_resonances (
  id uuid primary key default gen_random_uuid(),
  star_letter_id uuid not null references public.star_letters(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  resonance_type text not null default 'silent'
    check (resonance_type in ('silent', 'sparkle', 'afterglow', 'life', 'world', 'deep')),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint star_letter_resonances_request_key
    unique (profile_id, client_request_id)
);

comment on table public.star_letter_resonances is
  '星文への共鳴。同じ利用者が同じ星文へ何度でも共鳴でき、各操作はclient_request_idで冪等化する。';

create index if not exists star_letter_resonances_letter_created_at_idx
on public.star_letter_resonances(star_letter_id, created_at, id);
create index if not exists star_letter_resonances_profile_letter_idx
on public.star_letter_resonances(profile_id, star_letter_id);

create table if not exists public.star_letter_archives (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  star_letter_id uuid not null,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint star_letter_archives_profile_letter_key unique (profile_id, star_letter_id)
);

alter table public.star_letter_archives
  drop constraint if exists star_letter_archives_star_letter_id_fkey;
alter table public.star_letter_archives
  drop constraint if exists star_letter_archives_letter_post_fkey;
alter table public.star_letter_archives
  add constraint star_letter_archives_letter_post_fkey
  foreign key (star_letter_id, post_id)
  references public.star_letters(id, post_id)
  on delete cascade;

comment on table public.star_letter_archives is
  '利用者ごとの星文Archive。post_idとstar_letter_idを保持し、流星便と対象星文へ戻れる。';

create index if not exists star_letter_archives_profile_created_at_idx
on public.star_letter_archives(profile_id, created_at desc, id);
create index if not exists star_letter_archives_post_id_idx
on public.star_letter_archives(post_id);
create index if not exists star_letter_archives_letter_post_idx
on public.star_letter_archives(star_letter_id, post_id);

alter table public.notifications
  add column if not exists star_letter_id uuid references public.star_letters(id) on delete set null;

create index if not exists notifications_star_letter_id_idx
on public.notifications(star_letter_id);

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'resonance',
    'archive',
    'star_letter',
    'star_letter_reply',
    'star_letter_resonance'
  ));

comment on column public.notifications.star_letter_id is
  '星文通知の対象。R.Connectから流星便と星文を特定するために保持する。';
comment on column public.notifications.type is
  '通知タイプ。resonance、archive、star_letter、star_letter_reply、star_letter_resonanceを許可する。';

create unique index if not exists notifications_star_letter_resonance_once_idx
on public.notifications(recipient_id, actor_id, star_letter_id)
where type = 'star_letter_resonance'
  and actor_id is not null
  and star_letter_id is not null;

create or replace function app_private.can_access_post(
  p_post_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or (p_user_id is not null and p.author_id = p_user_id)
      )
  );
$$;

revoke all on function app_private.can_access_post(uuid, uuid)
from public, anon, authenticated;

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
    and (
      (p.visibility = 'public' and p.deleted_at is null)
      or (p_user_id is not null and p.author_id = p_user_id)
    )
  for share;

  return coalesce(v_found, false);
end;
$$;

revoke all on function app_private.lock_accessible_post(uuid, uuid)
from public, anon, authenticated;

create or replace function app_private.validate_star_letter_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_post_id uuid;
  v_cycle_found boolean;
begin
  if auth.uid() is not null
    and not app_private.lock_accessible_post(new.post_id, auth.uid())
  then
    raise exception 'star letter target is not accessible'
      using errcode = '42501';
  end if;

  if new.parent_star_letter_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('star_letter_reply_graph'),
    pg_catalog.hashtext(new.post_id::text)
  );

  select sl.post_id
  into v_parent_post_id
  from public.star_letters sl
  where sl.id = new.parent_star_letter_id
    and sl.deleted_at is null
  for key share;

  if v_parent_post_id is null or v_parent_post_id <> new.post_id then
    raise exception 'reply target must belong to the same post'
      using errcode = '23514';
  end if;

  with recursive ancestors as (
    select
      sl.id,
      sl.parent_star_letter_id,
      array[sl.id]::uuid[] as visited,
      false as cycle
    from public.star_letters sl
    where sl.id = new.parent_star_letter_id

    union all

    select
      parent.id,
      parent.parent_star_letter_id,
      ancestors.visited || parent.id,
      parent.id = any(ancestors.visited)
    from ancestors
    join public.star_letters parent
      on parent.id = ancestors.parent_star_letter_id
    where ancestors.cycle is false
  )
  select coalesce(bool_or(id = new.id or cycle), false)
  into v_cycle_found
  from ancestors;

  if v_cycle_found then
    raise exception 'star letter reply cycle is not allowed'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_star_letter_relationship()
from public, anon, authenticated;

drop trigger if exists star_letters_validate_relationship on public.star_letters;
create trigger star_letters_validate_relationship
before insert or update of post_id, parent_star_letter_id
on public.star_letters
for each row execute function app_private.validate_star_letter_relationship();

create or replace function app_private.mark_star_letter_edited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and not app_private.lock_accessible_post(new.post_id, auth.uid())
  then
    raise exception 'star letter target is not accessible'
      using errcode = '42501';
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

revoke all on function app_private.mark_star_letter_edited()
from public, anon, authenticated;

drop trigger if exists star_letters_mark_edited on public.star_letters;
create trigger star_letters_mark_edited
before update of body on public.star_letters
for each row execute function app_private.mark_star_letter_edited();

create or replace function app_private.soft_delete_star_letter_with_replies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  if not app_private.lock_accessible_post(old.post_id, auth.uid()) then
    raise exception 'star letter target is not accessible'
      using errcode = '42501';
  end if;

  if old.deleted_at is not null then
    return null;
  end if;

  if exists (
    select 1
    from public.star_letters child
    where child.parent_star_letter_id = old.id
  ) then
    update public.star_letters
    set
      body = '削除された星文です。',
      deleted_at = now(),
      edited_at = now()
    where id = old.id;

    return null;
  end if;

  return old;
end;
$$;

revoke all on function app_private.soft_delete_star_letter_with_replies()
from public, anon, authenticated;

drop trigger if exists star_letters_soft_delete_with_replies on public.star_letters;
create trigger star_letters_soft_delete_with_replies
before delete on public.star_letters
for each row execute function app_private.soft_delete_star_letter_with_replies();

create or replace function app_private.create_star_letter_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
  v_type text;
  v_message text;
begin
  if new.parent_star_letter_id is null then
    select p.author_id
    into v_recipient_id
    from public.posts p
    where p.id = new.post_id;

    v_type := 'star_letter';
    v_message := 'あなたの流星便に星文が届きました。';
  else
    select parent.author_id
    into v_recipient_id
    from public.star_letters parent
    where parent.id = new.parent_star_letter_id;

    v_type := 'star_letter_reply';
    v_message := 'あなたの星文に返信が届きました。';
  end if;

  if v_recipient_id is null or v_recipient_id = new.author_id then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    star_letter_id,
    type,
    message
  )
  values (
    v_recipient_id,
    new.author_id,
    new.post_id,
    new.id,
    v_type,
    v_message
  );

  return new;
end;
$$;

revoke all on function app_private.create_star_letter_notification()
from public, anon, authenticated;

create or replace function app_private.create_star_letter_resonance_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
  v_post_id uuid;
begin
  select sl.author_id, sl.post_id
  into v_recipient_id, v_post_id
  from public.star_letters sl
  where sl.id = new.star_letter_id;

  if v_recipient_id is null or v_recipient_id = new.profile_id then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    star_letter_id,
    type,
    message
  )
  values (
    v_recipient_id,
    new.profile_id,
    v_post_id,
    new.star_letter_id,
    'star_letter_resonance',
    'あなたの星文に共鳴が届きました。'
  )
  on conflict (recipient_id, actor_id, star_letter_id)
  where type = 'star_letter_resonance'
    and actor_id is not null
    and star_letter_id is not null
  do nothing;

  return new;
end;
$$;

revoke all on function app_private.create_star_letter_resonance_notification()
from public, anon, authenticated;

drop trigger if exists star_letter_resonances_create_notification
on public.star_letter_resonances;
create trigger star_letter_resonances_create_notification
after insert on public.star_letter_resonances
for each row execute function app_private.create_star_letter_resonance_notification();

create or replace function public.get_star_letter_thread(p_post_id uuid)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  parent_star_letter_id uuid,
  body text,
  is_deleted boolean,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  total_resonance_count bigint,
  viewer_resonance_count bigint,
  is_archived boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if p_post_id is null
    or not app_private.can_access_post(p_post_id, v_user_id)
  then
    return;
  end if;

  return query
  select
    sl.id,
    sl.post_id,
    sl.author_id,
    sl.parent_star_letter_id,
    sl.body,
    sl.deleted_at is not null,
    sl.created_at,
    sl.updated_at,
    sl.edited_at,
    count(slr.id)::bigint,
    count(slr.id) filter (where slr.profile_id = v_user_id)::bigint,
    exists (
      select 1
      from public.star_letter_archives sla
      where sla.star_letter_id = sl.id
        and sla.profile_id = v_user_id
    )
  from public.star_letters sl
  left join public.star_letter_resonances slr
    on slr.star_letter_id = sl.id
  where sl.post_id = p_post_id
  group by sl.id
  order by sl.created_at asc, sl.id asc;
end;
$$;

revoke all on function public.get_star_letter_thread(uuid)
from public, anon, authenticated;
grant execute on function public.get_star_letter_thread(uuid)
to anon, authenticated;

create or replace function public.create_star_letter_reply(
  p_parent_star_letter_id uuid,
  p_body text,
  p_client_request_id uuid
)
returns table (
  outcome text,
  star_letter_id uuid,
  post_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_parent public.star_letters%rowtype;
  v_star_letter_id uuid;
begin
  if v_user_id is null
    or p_parent_star_letter_id is null
    or p_client_request_id is null
    or p_body is null
    or p_body <> btrim(p_body)
    or char_length(p_body) < 1
    or char_length(p_body) > 500
  then
    return query select 'invalid_payload'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_parent
  from public.star_letters sl
  where sl.id = p_parent_star_letter_id
    and sl.deleted_at is null
  for share;

  if not found
    or not app_private.lock_accessible_post(v_parent.post_id, v_user_id)
  then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.star_letters (
    post_id,
    author_id,
    parent_star_letter_id,
    client_request_id,
    body
  )
  values (
    v_parent.post_id,
    v_user_id,
    v_parent.id,
    p_client_request_id,
    p_body
  )
  on conflict (author_id, client_request_id)
  where client_request_id is not null
  do nothing
  returning id into v_star_letter_id;

  if v_star_letter_id is null then
    select sl.id
    into v_star_letter_id
    from public.star_letters sl
    where sl.author_id = v_user_id
      and sl.client_request_id = p_client_request_id
      and sl.parent_star_letter_id = v_parent.id;

    if v_star_letter_id is null then
      return query select 'request_conflict'::text, null::uuid, null::uuid;
      return;
    end if;

    return query select 'already_created'::text, v_star_letter_id, v_parent.post_id;
    return;
  end if;

  return query select 'created'::text, v_star_letter_id, v_parent.post_id;
end;
$$;

revoke all on function public.create_star_letter_reply(uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.create_star_letter_reply(uuid, text, uuid)
to authenticated;

create or replace function public.update_star_letter(
  p_star_letter_id uuid,
  p_body text
)
returns table (
  outcome text,
  star_letter_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_at timestamptz;
begin
  if v_user_id is null
    or p_star_letter_id is null
    or p_body is null
    or p_body <> btrim(p_body)
    or char_length(p_body) < 1
    or char_length(p_body) > 500
  then
    return query select 'invalid_payload'::text, null::uuid, null::timestamptz;
    return;
  end if;

  update public.star_letters sl
  set
    body = p_body,
    edited_at = now()
  where sl.id = p_star_letter_id
    and sl.author_id = v_user_id
    and sl.deleted_at is null
    and app_private.lock_accessible_post(sl.post_id, v_user_id)
  returning sl.updated_at into v_updated_at;

  if not found then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  return query select 'updated'::text, p_star_letter_id, v_updated_at;
end;
$$;

revoke all on function public.update_star_letter(uuid, text)
from public, anon, authenticated;
grant execute on function public.update_star_letter(uuid, text)
to authenticated;

create or replace function public.delete_star_letter(p_star_letter_id uuid)
returns table (
  outcome text,
  star_letter_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_letter public.star_letters%rowtype;
  v_has_replies boolean;
begin
  if v_user_id is null or p_star_letter_id is null then
    return query select 'invalid_payload'::text, null::uuid;
    return;
  end if;

  select *
  into v_letter
  from public.star_letters sl
  where sl.id = p_star_letter_id
  for update;

  if not found
    or v_letter.author_id <> v_user_id
    or not app_private.lock_accessible_post(v_letter.post_id, v_user_id)
  then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if v_letter.deleted_at is not null then
    return query select 'already_deleted'::text, v_letter.id;
    return;
  end if;

  select exists (
    select 1
    from public.star_letters child
    where child.parent_star_letter_id = v_letter.id
  )
  into v_has_replies;

  if v_has_replies then
    update public.star_letters
    set
      body = '削除された星文です。',
      deleted_at = now(),
      edited_at = now()
    where id = v_letter.id;

    return query select 'soft_deleted'::text, v_letter.id;
    return;
  end if;

  delete from public.star_letters where id = v_letter.id;
  return query select 'deleted'::text, v_letter.id;
end;
$$;

revoke all on function public.delete_star_letter(uuid)
from public, anon, authenticated;
grant execute on function public.delete_star_letter(uuid)
to authenticated;

create or replace function public.add_star_letter_resonance(
  p_star_letter_id uuid,
  p_client_request_id uuid,
  p_resonance_type text default 'silent'
)
returns table (
  outcome text,
  resonance_id uuid,
  total_resonance_count bigint,
  viewer_resonance_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_resonance_id uuid;
  v_existing_star_letter_id uuid;
  v_existing_resonance_type text;
  v_post_id uuid;
  v_total bigint;
  v_viewer bigint;
  v_created boolean := false;
begin
  if v_user_id is null
    or p_star_letter_id is null
    or p_client_request_id is null
    or p_resonance_type is null
    or p_resonance_type not in ('silent', 'sparkle', 'afterglow', 'life', 'world', 'deep')
  then
    return query select 'invalid_payload'::text, null::uuid, 0::bigint, 0::bigint;
    return;
  end if;

  select sl.post_id
  into v_post_id
  from public.star_letters sl
  where sl.id = p_star_letter_id
    and sl.deleted_at is null
  for share;

  if v_post_id is null
    or not app_private.lock_accessible_post(v_post_id, v_user_id)
  then
    return query select 'not_found'::text, null::uuid, 0::bigint, 0::bigint;
    return;
  end if;

  insert into public.star_letter_resonances (
    star_letter_id,
    profile_id,
    resonance_type,
    client_request_id
  )
  values (
    p_star_letter_id,
    v_user_id,
    p_resonance_type,
    p_client_request_id
  )
  on conflict (profile_id, client_request_id)
  do nothing
  returning id into v_resonance_id;

  if v_resonance_id is not null then
    v_created := true;
  else
    select
      slr.id,
      slr.star_letter_id,
      slr.resonance_type
    into
      v_resonance_id,
      v_existing_star_letter_id,
      v_existing_resonance_type
    from public.star_letter_resonances slr
    where slr.profile_id = v_user_id
      and slr.client_request_id = p_client_request_id;

    if v_resonance_id is null
      or v_existing_star_letter_id <> p_star_letter_id
      or v_existing_resonance_type <> p_resonance_type
    then
      return query
      select 'request_conflict'::text, null::uuid, 0::bigint, 0::bigint;
      return;
    end if;
  end if;

  select
    count(*)::bigint,
    count(*) filter (where profile_id = v_user_id)::bigint
  into v_total, v_viewer
  from public.star_letter_resonances
  where star_letter_id = p_star_letter_id;

  return query
  select
    case when v_created then 'created' else 'already_created' end,
    v_resonance_id,
    v_total,
    v_viewer;
end;
$$;

revoke all on function public.add_star_letter_resonance(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.add_star_letter_resonance(uuid, uuid, text)
to authenticated;

create or replace function public.set_star_letter_archive(
  p_star_letter_id uuid,
  p_archived boolean
)
returns table (
  outcome text,
  archive_id uuid,
  post_id uuid,
  is_archived boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_archive_id uuid;
begin
  if v_user_id is null
    or p_star_letter_id is null
    or p_archived is null
  then
    return query select 'invalid_payload'::text, null::uuid, null::uuid, false;
    return;
  end if;

  select sl.post_id
  into v_post_id
  from public.star_letters sl
  where sl.id = p_star_letter_id
    and sl.deleted_at is null
  for share;

  if v_post_id is null
    or not app_private.lock_accessible_post(v_post_id, v_user_id)
  then
    return query select 'not_found'::text, null::uuid, null::uuid, false;
    return;
  end if;

  if p_archived then
    insert into public.star_letter_archives (
      profile_id,
      star_letter_id,
      post_id
    )
    values (
      v_user_id,
      p_star_letter_id,
      v_post_id
    )
    on conflict (profile_id, star_letter_id)
    do update set post_id = excluded.post_id
    returning id into v_archive_id;

    return query select 'archived'::text, v_archive_id, v_post_id, true;
    return;
  end if;

  delete from public.star_letter_archives sla
  where sla.profile_id = v_user_id
    and sla.star_letter_id = p_star_letter_id
  returning sla.id into v_archive_id;

  return query
  select
    case when v_archive_id is null then 'already_unarchived' else 'unarchived' end,
    v_archive_id,
    v_post_id,
    false;
end;
$$;

revoke all on function public.set_star_letter_archive(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.set_star_letter_archive(uuid, boolean)
to authenticated;

alter table public.star_letters enable row level security;
alter table public.star_letter_resonances enable row level security;
alter table public.star_letter_archives enable row level security;

revoke all on table public.star_letter_resonances
from public, anon, authenticated;
grant select, insert, update, delete on table public.star_letter_resonances
to service_role;

revoke all on table public.star_letter_archives
from public, anon, authenticated;
grant select on table public.star_letter_archives
to authenticated;
grant select, insert, update, delete on table public.star_letter_archives
to service_role;

revoke select, insert, update, delete on table public.star_letters
from public, anon, authenticated;
grant select (
  id,
  post_id,
  author_id,
  parent_star_letter_id,
  body,
  created_at,
  updated_at,
  edited_at,
  deleted_at
) on table public.star_letters to anon, authenticated;
grant insert (post_id, author_id, body) on table public.star_letters
to authenticated;
grant update (body) on table public.star_letters to authenticated;
grant delete on table public.star_letters to authenticated;
grant select, insert, update, delete on table public.star_letters
to service_role;

drop policy if exists star_letters_select_visible on public.star_letters;
create policy star_letters_select_visible on public.star_letters
for select to anon, authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = (select auth.uid())
      )
  )
);

drop policy if exists star_letters_insert_logged_in on public.star_letters;
create policy star_letters_insert_logged_in on public.star_letters
for insert to authenticated
with check (
  (select auth.uid()) is not null
  and author_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1
    from public.posts p
    where p.id = star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = (select auth.uid())
      )
  )
);

drop policy if exists star_letters_update_own on public.star_letters;
create policy star_letters_update_own on public.star_letters
for update to authenticated
using (
  author_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1
    from public.posts p
    where p.id = star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = (select auth.uid())
      )
  )
)
with check (
  author_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1
    from public.posts p
    where p.id = star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = (select auth.uid())
      )
  )
);

drop policy if exists star_letters_delete_own on public.star_letters;
create policy star_letters_delete_own on public.star_letters
for delete to authenticated
using (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.posts p
    where p.id = star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = (select auth.uid())
      )
  )
);

drop policy if exists star_letter_resonances_select_visible
on public.star_letter_resonances;

drop policy if exists star_letter_archives_select_own
on public.star_letter_archives;
create policy star_letter_archives_select_own
on public.star_letter_archives
for select to authenticated
using (profile_id = (select auth.uid()));

commit;
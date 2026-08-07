begin;

create table if not exists public.profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_blocks_blocker_blocked_key unique (blocker_id, blocked_id),
  constraint profile_blocks_not_self_check check (blocker_id <> blocked_id)
);

comment on table public.profile_blocks is
  'ブラックホール関係。blocker_id本人だけが作成・一覧・解除でき、blocked側には関係を公開しない。';
comment on column public.profile_blocks.blocker_id is
  'ブラックホールへ送ったプロフィール。auth.uid()本人だけがbrowser経由で操作できる。';
comment on column public.profile_blocks.blocked_id is
  'ブラックホールへ送られたプロフィール。blocked側にはこの行をSELECTさせない。';

-- The unique index covers blocker_id lookups and its FK. This reverse index
-- covers blocked_id FK work and the opposite direction of the pair lookup.
create index if not exists profile_blocks_blocked_blocker_idx
  on public.profile_blocks(blocked_id, blocker_id);

alter table public.profile_blocks enable row level security;

revoke all on table public.profile_blocks from public, anon, authenticated;
grant select, insert, delete on table public.profile_blocks to authenticated;
grant select, insert, update, delete on table public.profile_blocks to service_role;

create or replace function app_private.is_black_hole_between_profiles(
  p_left_profile_id uuid,
  p_right_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_left_profile_id is not null
    and p_right_profile_id is not null
    and p_left_profile_id <> p_right_profile_id
    and exists (
      select 1
      from public.profile_blocks relation
      where (
        relation.blocker_id = p_left_profile_id
        and relation.blocked_id = p_right_profile_id
      )
      or (
        relation.blocker_id = p_right_profile_id
        and relation.blocked_id = p_left_profile_id
      )
    );
$$;

comment on function app_private.is_black_hole_between_profiles(uuid, uuid) is
  'RLS・trigger・trusted RPC専用。任意の二者間判定をbrowserへ直接公開しない。';

revoke all on function app_private.is_black_hole_between_profiles(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function app_private.is_black_hole_between(p_target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and p_target_profile_id is not null
    and p_target_profile_id <> (select auth.uid())
    and app_private.is_black_hole_between_profiles(
      (select auth.uid()),
      p_target_profile_id
    );
$$;

comment on function app_private.is_black_hole_between(uuid) is
  'RLS専用。現在の認証ユーザーと対象プロフィールの間に、どちら向きでもブラックホール関係があればtrue。未認証時はfalse。';

revoke all on function app_private.is_black_hole_between(uuid)
from public, anon, authenticated, service_role;
grant execute on function app_private.is_black_hole_between(uuid)
to anon, authenticated;

create or replace function app_private.is_black_hole_protected(p_target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_target_profile_id is not null
    and (
      exists (
        select 1
        from public.app_admins admin_profile
        where admin_profile.user_id = p_target_profile_id
      )
      or exists (
        select 1
        from public.profile_titles assigned_title
        join public.titles title
          on title.id = assigned_title.title_id
        where assigned_title.profile_id = p_target_profile_id
          and assigned_title.is_primary is true
          and title.key = 'celestial_guide'
          and title.is_active is true
      )
    );
$$;

comment on function app_private.is_black_hole_protected(uuid) is
  'RLS・RPC専用。DB管理のapp_adminまたはprimary celestial_guide称号だけを保護対象とする。表示名やusernameは使用しない。';

revoke all on function app_private.is_black_hole_protected(uuid)
from public, anon, authenticated, service_role;
grant execute on function app_private.is_black_hole_protected(uuid)
to authenticated;

drop policy if exists profile_blocks_select_own on public.profile_blocks;
create policy profile_blocks_select_own on public.profile_blocks
for select
to authenticated
using (blocker_id = (select auth.uid()));

drop policy if exists profile_blocks_insert_own on public.profile_blocks;
create policy profile_blocks_insert_own on public.profile_blocks
for insert
to authenticated
with check (
  blocker_id = (select auth.uid())
  and blocked_id <> (select auth.uid())
  and not app_private.is_black_hole_protected(blocked_id)
);

drop policy if exists profile_blocks_delete_own on public.profile_blocks;
create policy profile_blocks_delete_own on public.profile_blocks
for delete
to authenticated
using (blocker_id = (select auth.uid()));

create or replace function public.block_profile(p_target_profile_id uuid)
returns table (
  outcome text,
  block_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_block_id uuid;
begin
  if v_user_id is null
    or p_target_profile_id is null
    or p_target_profile_id = v_user_id
  then
    return query select 'not_allowed'::text, null::uuid;
    return;
  end if;

  if not exists (
    select 1
    from public.profiles target
    where target.id = p_target_profile_id
  )
  or app_private.is_black_hole_protected(p_target_profile_id)
  then
    return query select 'not_allowed'::text, null::uuid;
    return;
  end if;

  insert into public.profile_blocks (blocker_id, blocked_id)
  values (v_user_id, p_target_profile_id)
  on conflict (blocker_id, blocked_id) do nothing
  returning id into v_block_id;

  if v_block_id is null then
    select relation.id
    into v_block_id
    from public.profile_blocks relation
    where relation.blocker_id = v_user_id
      and relation.blocked_id = p_target_profile_id;

    return query select 'already_blocked'::text, v_block_id;
    return;
  end if;

  return query select 'blocked'::text, v_block_id;
end;
$$;

revoke all on function public.block_profile(uuid)
from public, anon, authenticated;
grant execute on function public.block_profile(uuid)
to authenticated;

create or replace function public.unblock_profile(p_target_profile_id uuid)
returns table (
  outcome text,
  block_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_block_id uuid;
begin
  if v_user_id is null
    or p_target_profile_id is null
    or p_target_profile_id = v_user_id
  then
    return query select 'not_allowed'::text, null::uuid;
    return;
  end if;

  delete from public.profile_blocks relation
  where relation.blocker_id = v_user_id
    and relation.blocked_id = p_target_profile_id
  returning relation.id into v_block_id;

  return query
  select
    case when v_block_id is null then 'already_unblocked' else 'unblocked' end,
    v_block_id;
end;
$$;

revoke all on function public.unblock_profile(uuid)
from public, anon, authenticated;
grant execute on function public.unblock_profile(uuid)
to authenticated;

create or replace function public.get_my_profile_blocks()
returns table (
  block_id uuid,
  blocked_id uuid,
  display_name text,
  username text,
  avatar_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    relation.id,
    relation.blocked_id,
    blocked_profile.display_name,
    blocked_profile.username,
    blocked_profile.avatar_url,
    relation.created_at
  from public.profile_blocks relation
  join public.profiles blocked_profile
    on blocked_profile.id = relation.blocked_id
  where relation.blocker_id = (select auth.uid())
    and (select auth.uid()) is not null
  order by relation.created_at desc, relation.id desc;
$$;

revoke all on function public.get_my_profile_blocks()
from public, anon, authenticated;
grant execute on function public.get_my_profile_blocks()
to authenticated;

-- A service-role notification delivery worker can call this without learning
-- any additional profile data. Browser roles cannot execute it.
create or replace function public.is_notification_black_holed(
  p_recipient_id uuid,
  p_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_black_hole_between_profiles(
    p_recipient_id,
    p_actor_id
  );
$$;

revoke all on function public.is_notification_black_holed(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.is_notification_black_holed(uuid, uuid)
to service_role;

-- The onboarding RPC is SECURITY DEFINER and selects a target post directly.
-- Enforce the same relationship boundary whenever it stores a target, without
-- duplicating the full onboarding state machine.
create or replace function app_private.ensure_onboarding_target_not_black_holed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_author_id uuid;
begin
  if new.target_post_id is not null then
    select post.author_id
    into v_target_author_id
    from public.posts post
    where post.id = new.target_post_id;
  end if;

  if new.target_post_id is null
    or v_target_author_id is null
    or app_private.is_black_hole_between_profiles(
      new.user_id,
      v_target_author_id
    )
  then
    select post.id
    into new.target_post_id
    from public.posts post
    where post.visibility = 'public'
      and post.deleted_at is null
      and post.author_id <> new.user_id
      and not app_private.is_black_hole_between_profiles(
        new.user_id,
        post.author_id
      )
    order by post.created_at desc, post.id desc
    limit 1;
  end if;

  return new;
end;
$$;

revoke all on function app_private.ensure_onboarding_target_not_black_holed()
from public, anon, authenticated, service_role;

drop trigger if exists user_onboarding_progress_filter_black_hole_target_insert
on public.user_onboarding_progress;
create trigger user_onboarding_progress_filter_black_hole_target_insert
before insert
on public.user_onboarding_progress
for each row
execute function app_private.ensure_onboarding_target_not_black_holed();

drop trigger if exists user_onboarding_progress_filter_black_hole_target_update
on public.user_onboarding_progress;
create trigger user_onboarding_progress_filter_black_hole_target_update
before update of target_post_id
on public.user_onboarding_progress
for each row
execute function app_private.ensure_onboarding_target_not_black_holed();

create or replace function app_private.refresh_onboarding_target_after_black_hole()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_onboarding_progress progress
  set target_post_id = progress.target_post_id
  where progress.user_id in (new.blocker_id, new.blocked_id)
    and progress.completed_at is null;

  return new;
end;
$$;

revoke all on function app_private.refresh_onboarding_target_after_black_hole()
from public, anon, authenticated, service_role;

drop trigger if exists profile_blocks_refresh_onboarding_target
on public.profile_blocks;
create trigger profile_blocks_refresh_onboarding_target
after insert on public.profile_blocks
for each row
execute function app_private.refresh_onboarding_target_after_black_hole();

-- Shared post access helpers back every star-letter SECURITY DEFINER RPC.
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
      and (
        p_user_id is null
        or not app_private.is_black_hole_between_profiles(
          p_user_id,
          p.author_id
        )
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

-- Public profile and related public metadata.
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
for select
to anon, authenticated
using (
  id = (select auth.uid())
  or not app_private.is_black_hole_between(id)
);

drop policy if exists profile_tags_select_public on public.profile_tags;
create policy profile_tags_select_public on public.profile_tags
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.profiles visible_profile
    where visible_profile.id = profile_tags.profile_id
  )
);

drop policy if exists profile_titles_select_active on public.profile_titles;
create policy profile_titles_select_active on public.profile_titles
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.titles title
    where title.id = profile_titles.title_id
      and title.is_active
  )
  and exists (
    select 1
    from public.profiles visible_profile
    where visible_profile.id = profile_titles.profile_id
  )
);

-- Posts are the root visibility boundary for media and tag relation policies.
drop policy if exists posts_select_visible on public.posts;
create policy posts_select_visible on public.posts
for select
to anon, authenticated
using (
  author_id = (select auth.uid())
  or (
    visibility = 'public'
    and deleted_at is null
    and not app_private.is_black_hole_between(author_id)
  )
);

-- Existing interaction rows stay stored, but blocked actors and blocked post
-- authors disappear from browser reads. New interactions are rejected.
drop policy if exists resonances_select_visible on public.resonances;
create policy resonances_select_visible on public.resonances
for select
to anon, authenticated
using (
  not app_private.is_black_hole_between(profile_id)
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = resonances.post_id
  )
);

drop policy if exists resonances_insert_logged_in on public.resonances;
create policy resonances_insert_logged_in on public.resonances
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = resonances.post_id
      and visible_post.deleted_at is null
  )
);

drop policy if exists resonances_delete_own on public.resonances;
create policy resonances_delete_own on public.resonances
for delete
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = resonances.post_id
  )
);

drop policy if exists archives_select_own on public.archives;
create policy archives_select_own on public.archives
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = archives.post_id
  )
);

drop policy if exists archives_insert_own on public.archives;
create policy archives_insert_own on public.archives
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = archives.post_id
      and visible_post.deleted_at is null
  )
);

drop policy if exists archives_update_own on public.archives;
create policy archives_update_own on public.archives
for update
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = archives.post_id
  )
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = archives.post_id
  )
);

drop policy if exists archives_delete_own on public.archives;
create policy archives_delete_own on public.archives
for delete
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = archives.post_id
  )
);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select
to authenticated
using (
  recipient_id = (select auth.uid())
  and (
    actor_id is null
    or not app_private.is_black_hole_between(actor_id)
  )
  and (
    post_id is null
    or exists (
      select 1
      from public.posts visible_post
      where visible_post.id = notifications.post_id
    )
  )
);

drop policy if exists notifications_update_read_own on public.notifications;
create policy notifications_update_read_own on public.notifications
for update
to authenticated
using (
  recipient_id = (select auth.uid())
  and (
    actor_id is null
    or not app_private.is_black_hole_between(actor_id)
  )
  and (
    post_id is null
    or exists (
      select 1
      from public.posts visible_post
      where visible_post.id = notifications.post_id
    )
  )
)
with check (recipient_id = (select auth.uid()));

drop policy if exists star_letters_select_visible on public.star_letters;
create policy star_letters_select_visible on public.star_letters
for select
to anon, authenticated
using (
  not app_private.is_black_hole_between(author_id)
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = star_letters.post_id
  )
);

drop policy if exists star_letters_insert_logged_in on public.star_letters;
create policy star_letters_insert_logged_in on public.star_letters
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = star_letters.post_id
      and visible_post.deleted_at is null
  )
);

drop policy if exists star_letters_update_own on public.star_letters;
create policy star_letters_update_own on public.star_letters
for update
to authenticated
using (
  author_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = star_letters.post_id
  )
)
with check (
  author_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = star_letters.post_id
  )
);

drop policy if exists star_letters_delete_own on public.star_letters;
create policy star_letters_delete_own on public.star_letters
for delete
to authenticated
using (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = star_letters.post_id
  )
);

drop policy if exists star_letter_archives_select_own
on public.star_letter_archives;
create policy star_letter_archives_select_own
on public.star_letter_archives
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.star_letters visible_letter
    where visible_letter.id = star_letter_archives.star_letter_id
  )
  and exists (
    select 1
    from public.posts visible_post
    where visible_post.id = star_letter_archives.post_id
  )
);

-- Trusted notification triggers must not create Re:Connect rows for either
-- direction of a black-hole relationship.
create or replace function app_private.create_resonance_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  should_notify boolean;
begin
  select p.author_id
  into target_author_id
  from public.posts p
  where p.id = new.post_id;

  if target_author_id is null
    or target_author_id = new.profile_id
    or app_private.is_black_hole_between_profiles(
      target_author_id,
      new.profile_id
    )
  then
    return new;
  end if;

  select coalesce(pr.notify_authors_when_i_resonate, true)
  into should_notify
  from public.profiles pr
  where pr.id = new.profile_id;

  if should_notify is not true then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    type,
    message
  )
  values (
    target_author_id,
    new.profile_id,
    new.post_id,
    'resonance',
    'あなたの流星便に共鳴が届きました。'
  )
  on conflict (recipient_id, actor_id, post_id)
  where type = 'resonance'
  do nothing;

  return new;
end;
$$;

revoke all on function app_private.create_resonance_notification()
from public, anon, authenticated;

create or replace function app_private.create_archive_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
  should_notify boolean;
begin
  select p.author_id
  into target_author_id
  from public.posts p
  where p.id = new.post_id;

  if target_author_id is null
    or target_author_id = new.profile_id
    or app_private.is_black_hole_between_profiles(
      target_author_id,
      new.profile_id
    )
  then
    return new;
  end if;

  select coalesce(pr.notify_authors_when_i_archive, true)
  into should_notify
  from public.profiles pr
  where pr.id = new.profile_id;

  if should_notify is not true then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    post_id,
    type,
    message
  )
  values (
    target_author_id,
    new.profile_id,
    new.post_id,
    'archive',
    'あなたの流星便がArchiveされました。'
  );

  return new;
end;
$$;

revoke all on function app_private.create_archive_notification()
from public, anon, authenticated;

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

  if v_recipient_id is null
    or v_recipient_id = new.author_id
    or app_private.is_black_hole_between_profiles(
      v_recipient_id,
      new.author_id
    )
  then
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

  if v_recipient_id is null
    or v_recipient_id = new.profile_id
    or app_private.is_black_hole_between_profiles(
      v_recipient_id,
      new.profile_id
    )
  then
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

create or replace function app_private.enqueue_push_notification_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_id is null
    or (
      new.actor_id is not null
      and app_private.is_black_hole_between_profiles(
        new.recipient_id,
        new.actor_id
      )
    )
  then
    return new;
  end if;

  insert into public.push_notification_jobs (
    notification_id,
    recipient_id
  )
  values (
    new.id,
    new.recipient_id
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.enqueue_push_notification_job()
from public, anon, authenticated;

-- The thread reader is SECURITY DEFINER, so it filters both post authors and
-- individual letter/resonance actors explicitly.
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
    and (
      v_user_id is null
      or not app_private.is_black_hole_between_profiles(
        v_user_id,
        slr.profile_id
      )
    )
  where sl.post_id = p_post_id
    and (
      v_user_id is null
      or not app_private.is_black_hole_between_profiles(
        v_user_id,
        sl.author_id
      )
    )
  group by sl.id
  order by sl.created_at asc, sl.id asc;
end;
$$;

revoke all on function public.get_star_letter_thread(uuid)
from public, anon, authenticated;
grant execute on function public.get_star_letter_thread(uuid)
to anon, authenticated;

-- Existing star-letter mutation RPCs already verify auth.uid() and lock the
-- post. These replacements add the individual parent/letter author boundary.
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
    or app_private.is_black_hole_between_profiles(
      v_user_id,
      v_parent.author_id
    )
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
  v_letter_author_id uuid;
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

  select sl.post_id, sl.author_id
  into v_post_id, v_letter_author_id
  from public.star_letters sl
  where sl.id = p_star_letter_id
    and sl.deleted_at is null
  for share;

  if v_post_id is null
    or not app_private.lock_accessible_post(v_post_id, v_user_id)
    or app_private.is_black_hole_between_profiles(
      v_user_id,
      v_letter_author_id
    )
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
    count(*) filter (
      where not app_private.is_black_hole_between_profiles(
        v_user_id,
        slr.profile_id
      )
    )::bigint,
    count(*) filter (where slr.profile_id = v_user_id)::bigint
  into v_total, v_viewer
  from public.star_letter_resonances slr
  where slr.star_letter_id = p_star_letter_id;

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
  v_letter_author_id uuid;
  v_archive_id uuid;
begin
  if v_user_id is null
    or p_star_letter_id is null
    or p_archived is null
  then
    return query select 'invalid_payload'::text, null::uuid, null::uuid, false;
    return;
  end if;

  select sl.post_id, sl.author_id
  into v_post_id, v_letter_author_id
  from public.star_letters sl
  where sl.id = p_star_letter_id
    and sl.deleted_at is null
  for share;

  if v_post_id is null
    or not app_private.lock_accessible_post(v_post_id, v_user_id)
    or app_private.is_black_hole_between_profiles(
      v_user_id,
      v_letter_author_id
    )
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

commit;

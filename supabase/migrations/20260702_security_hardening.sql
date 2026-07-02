-- 星空Village security hardening after PR #48 audit.
-- This migration keeps 共鳴 rows repeatable, hides soft-deleted public posts,
-- moves meteor media buckets to private access, and tightens browser-role grants.
-- Do not use service_role keys in the frontend.

begin;

-- 1. Hide soft-deleted public posts and linked public data from browser roles.
drop policy if exists posts_select_visible on public.posts;
create policy posts_select_visible on public.posts
for select using (
  (visibility = 'public' and deleted_at is null)
  or author_id = auth.uid()
);

drop policy if exists post_tags_select_visible on public.post_tags;
create policy post_tags_select_visible on public.post_tags
for select using (
  exists (
    select 1
    from public.posts p
    where p.id = public.post_tags.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists resonances_select_visible on public.resonances;
create policy resonances_select_visible on public.resonances
for select using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.posts p
    where p.id = public.resonances.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists resonances_insert_logged_in on public.resonances;
create policy resonances_insert_logged_in on public.resonances
for insert with check (
  auth.uid() is not null
  and profile_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = public.resonances.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists star_letters_select_visible on public.star_letters;
create policy star_letters_select_visible on public.star_letters
for select using (
  author_id = auth.uid()
  or exists (
    select 1
    from public.posts p
    where p.id = public.star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists star_letters_insert_logged_in on public.star_letters;
create policy star_letters_insert_logged_in on public.star_letters
for insert with check (
  auth.uid() is not null
  and author_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = public.star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists archives_insert_own on public.archives;
create policy archives_insert_own on public.archives
for insert with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = public.archives.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

-- 2. Observations contain AI/internal fields. Browser roles should not read the raw table.
revoke all on table public.observations from anon, authenticated;
drop policy if exists observations_select_visible on public.observations;

-- 3. Private meteor media buckets with RLS-gated signed URL access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meteor-media',
  'meteor-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meteor-video',
  'meteor-video',
  false,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists meteor_media_public_read on storage.objects;
drop policy if exists meteor_media_read_visible_post on storage.objects;
create policy meteor_media_read_visible_post
on storage.objects
for select
to public
using (
  bucket_id = 'meteor-media'
  and exists (
    select 1
    from public.post_media pm
    join public.posts p on p.id = pm.post_id
    where (pm.storage_path = storage.objects.name or pm.thumbnail_storage_path = storage.objects.name)
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists meteor_video_public_read on storage.objects;
drop policy if exists meteor_video_read_visible_post on storage.objects;
create policy meteor_video_read_visible_post
on storage.objects
for select
to public
using (
  bucket_id = 'meteor-video'
  and exists (
    select 1
    from public.post_media pm
    join public.posts p on p.id = pm.post_id
    where pm.storage_path = storage.objects.name
      and pm.media_type = 'video'
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

-- Keep existing upload/delete ownership boundaries for media buckets.
drop policy if exists meteor_media_insert_own_folder on storage.objects;
create policy meteor_media_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meteor-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists meteor_media_delete_own_folder on storage.objects;
create policy meteor_media_delete_own_folder
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meteor-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists meteor_video_insert_own_folder on storage.objects;
create policy meteor_video_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meteor-video'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists meteor_video_delete_own_folder on storage.objects;
create policy meteor_video_delete_own_folder
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meteor-video'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. 共鳴 rows remain repeatable, but resonance notifications are once per actor/post/recipient.
with ranked_resonance_notifications as (
  select
    id,
    row_number() over (
      partition by recipient_id, actor_id, post_id
      order by created_at asc, id::text asc
    ) as duplicate_rank
  from public.notifications
  where type = 'resonance'
    and actor_id is not null
    and post_id is not null
)
delete from public.notifications n
using ranked_resonance_notifications r
where n.id = r.id
  and r.duplicate_rank > 1;

drop index if exists public.notifications_resonance_once_per_actor_post_idx;
create unique index notifications_resonance_once_per_actor_post_idx
on public.notifications(recipient_id, actor_id, post_id)
where type = 'resonance';

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

  if target_author_id is null then
    return new;
  end if;

  if target_author_id = new.profile_id then
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

revoke all on function app_private.create_resonance_notification() from public, anon, authenticated;

-- 5. Remove unsafe browser-role write grants that are not needed by the app.
revoke insert, update, delete, truncate on all tables in schema public from public, anon, authenticated;
grant insert, update on table public.profiles to authenticated;
grant insert, update on table public.posts to authenticated;
grant insert, delete on table public.post_media to authenticated;
grant insert on table public.meteor_tags to authenticated;
grant insert, delete on table public.post_meteor_tags to authenticated;
grant insert on table public.resonances to authenticated;
grant update (is_read) on table public.notifications to authenticated;
grant insert on table public.feedbacks to authenticated;
grant insert, update, delete on table public.star_letters to authenticated;
grant insert, delete on table public.archives to authenticated;

alter default privileges in schema public
revoke insert, update, delete, truncate on tables from public, anon, authenticated;

-- 6. Mirror frontend text limits at the database layer.
alter table public.posts
  drop constraint if exists posts_body_500_chars;
alter table public.posts
  add constraint posts_body_500_chars check (char_length(trim(body)) <= 500);

alter table public.star_letters
  drop constraint if exists star_letters_body_500_chars;
alter table public.star_letters
  add constraint star_letters_body_500_chars check (
    char_length(trim(body)) > 0
    and char_length(trim(body)) <= 500
  );

alter table public.profile_tags
  drop constraint if exists profile_tags_label_30_chars;
alter table public.profile_tags
  add constraint profile_tags_label_30_chars check (
    char_length(trim(label)) > 0
    and char_length(trim(label)) <= 30
  );

alter table public.post_tags
  drop constraint if exists post_tags_label_30_chars;
alter table public.post_tags
  add constraint post_tags_label_30_chars check (
    char_length(trim(label)) > 0
    and char_length(trim(label)) <= 30
  );

commit;

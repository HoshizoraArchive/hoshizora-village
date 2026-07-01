-- 星空Village Supabase schema for MVP review
-- Project: Re:AiSNS / 星空Village
-- This file is intended as the first SQL Editor draft before app-side Supabase connection.
-- Do not commit Supabase URL, anon keys, publishable keys, secret keys, or service_role keys.
-- If an older draft has already been executed, review this as a migration/reset plan before running it again.

create extension if not exists "pgcrypto";

-- Storage bucket for profile avatar images.
-- Public read is allowed so avatar_url can be rendered in public profile pages and timelines.
-- Authenticated users may upload only into their own auth.uid() folder via storage.objects policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_public_read'
  ) then
    create policy avatars_public_read
    on storage.objects
    for select
    to public
    using (bucket_id = 'avatars');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_insert_own_folder'
  ) then
    create policy avatars_insert_own_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;

-- Storage bucket for meteor letter image attachments.
-- The bucket is private; clients render authorized media through short-lived signed URLs.
-- Authenticated users may upload/delete only inside their own auth.uid() folder.
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
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  drop policy if exists meteor_media_public_read on storage.objects;
  drop policy if exists meteor_media_read_visible_post on storage.objects;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_media_insert_own_folder'
  ) then
    create policy meteor_media_insert_own_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'meteor-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_media_delete_own_folder'
  ) then
    create policy meteor_media_delete_own_folder
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'meteor-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;

-- Storage bucket for meteor letter short video attachments.
-- The bucket is private; clients render authorized videos through short-lived signed URLs.
-- Authenticated users may upload/delete only inside their own auth.uid() folder.
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
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  drop policy if exists meteor_video_public_read on storage.objects;
  drop policy if exists meteor_video_read_visible_post on storage.objects;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_video_insert_own_folder'
  ) then
    create policy meteor_video_insert_own_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'meteor-video'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'meteor_video_delete_own_folder'
  ) then
    create policy meteor_video_delete_own_folder
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'meteor-video'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;

-- Private schema for trigger/helper functions that should not be exposed through the Data API.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles: user profile linked to Supabase Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) > 0),
  username text unique check (username is null or username ~ '^[A-Za-z0-9_]{3,32}$'),
  bio text,
  avatar_url text,
  constellation_note text,
  notify_authors_when_i_archive boolean not null default true,
  notify_authors_when_i_resonate boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'ユーザープロフィール。表示名、自己紹介、アイコン、わたしの星座を保存する。';
comment on column public.profiles.constellation_note is 'わたしの星座を説明する自由記述。';
comment on column public.profiles.notify_authors_when_i_archive is '自分が誰かの流星便をArchiveした時、相手にR.Connect通知を送るかどうか。デフォルトON。';
comment on column public.profiles.notify_authors_when_i_resonate is '自分が誰かの流星便に共鳴した時、相手にR.Connect通知を送るかどうか。デフォルトON。';

-- posts: 流星便.
-- MVP supports text/image/audio/video/youtube.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'text' check (type in ('text', 'image', 'audio', 'video', 'youtube')),
  body text not null default '',
  media_url text,
  youtube_url text,
  youtube_video_id text,
  duration_seconds integer,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_body_500_chars check (char_length(trim(body)) <= 500),
  constraint posts_body_or_media_present check (
    char_length(trim(body)) > 0
    or type in ('image', 'video')
    or media_url is not null
    or youtube_url is not null
  ),
  constraint posts_media_requirements check (
    type in ('text', 'image', 'video')
    or (type = 'audio' and media_url is not null)
    or (type = 'youtube' and youtube_url is not null and youtube_video_id is not null)
  ),
  constraint posts_duration_non_negative check (duration_seconds is null or duration_seconds >= 0),
  constraint posts_audio_video_duration_limit check (
    (type <> 'audio' or (duration_seconds is not null and duration_seconds <= 30))
    and (type <> 'video' or duration_seconds is null or duration_seconds <= 35)
  )
);

comment on table public.posts is '流星便。本文、投稿タイプ、メディアURL、YouTube情報、公開範囲、作成日時を保存する。';
comment on column public.posts.type is 'MVPでは text, image, audio, video, youtube のみ許可する。';
comment on column public.posts.visibility is 'MVPでは public/private のみ。followers は将来の観測者機能で検討する。';
comment on column public.posts.duration_seconds is 'audioの長さ。post_media動画ではnull許容とし、動画秒数はpost_media.duration_secondsへ保存する。';
comment on column public.posts.media_url is 'audioなどのファイルURL。画像/動画投稿MVPではpost_mediaを正として扱う。';
comment on column public.posts.deleted_at is '流星便のソフト削除時刻。null のものだけ通常一覧に表示する。';

-- post_media: 流星便に添える画像/動画.
-- Storage pathを保存し、公開URLはクライアント側で生成する。
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  storage_path text not null check (char_length(trim(storage_path)) > 0),
  thumbnail_storage_path text,
  duration_seconds numeric,
  sort_order integer not null check (
    (media_type = 'image' and sort_order between 0 and 3)
    or (media_type = 'video' and sort_order = 0)
  ),
  mime_type text check (
    (media_type = 'image' and (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')))
    or (media_type = 'video' and mime_type is not null and mime_type in ('video/mp4', 'video/quicktime', 'video/webm'))
  ),
  size_bytes bigint check (
    (media_type = 'image' and (size_bytes is null or (size_bytes > 0 and size_bytes <= 8388608)))
    or (media_type = 'video' and size_bytes is not null and size_bytes > 0 and size_bytes <= 104857600)
  ),
  created_at timestamptz not null default now(),
  constraint post_media_video_duration_check check (
    media_type <> 'video'
    or (duration_seconds is not null and duration_seconds > 0 and duration_seconds <= 35)
  ),
  unique (post_id, sort_order),
  unique (storage_path)
);

comment on table public.post_media is '流星便に添えるメディア。画像は最大4枚、動画は1投稿1本まで保存する。';
comment on column public.post_media.storage_path is '画像はmeteor-media、動画はmeteor-video bucket 内のStorage path。表示URLはクライアント側で署名付きURLとして生成する。';
comment on column public.post_media.thumbnail_storage_path is '動画カード用サムネイルのmeteor-media bucket内Storage path。未設定時はクライアントでプレースホルダー表示する。';
comment on column public.post_media.duration_seconds is '動画の再生時間。動画は35秒以内。画像ではnull。';
comment on column public.post_media.sort_order is '画像は0から3までの表示順。動画は0固定。';

create or replace function app_private.prevent_mixed_post_media()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.post_media existing
    where existing.post_id = new.post_id
      and existing.media_type <> new.media_type
      and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'A post cannot mix image and video media.';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prevent_mixed_post_media() from public, anon, authenticated;

drop trigger if exists post_media_prevent_mixed_media on public.post_media;
create trigger post_media_prevent_mixed_media
before insert or update on public.post_media
for each row
execute function app_private.prevent_mixed_post_media();

-- profile_tags: わたしの星座.
create table if not exists public.profile_tags (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(trim(label)) > 0),
  constraint profile_tags_label_30_chars check (char_length(trim(label)) <= 30),
  kind text not null default 'interest',
  created_at timestamptz not null default now(),
  unique (profile_id, label, kind)
);

comment on table public.profile_tags is 'わたしの星座。好きなもの、趣味、特技、創作傾向などを保存する。';

-- post_tags: 流星便タグ.
create table if not exists public.post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  label text not null check (char_length(trim(label)) > 0),
  constraint post_tags_label_30_chars check (char_length(trim(label)) <= 30),
  created_at timestamptz not null default now(),
  unique (post_id, label)
);

comment on table public.post_tags is '流星便タグ。投稿ごとのテーマ、感情、創作ジャンルなどを保存する。';

-- meteor_tags: 本文中の#流星タグ辞書.
create table if not exists public.meteor_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0 and char_length(trim(name)) <= 30),
  normalized_name text not null unique check (char_length(trim(normalized_name)) > 0 and char_length(trim(normalized_name)) <= 30),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.meteor_tags is '流星タグ辞書。流星便本文中の#タグを検索・一覧化するために保存する。';
comment on column public.meteor_tags.name is '表示用の流星タグ名。最初に作成された自然な表記を維持する。';
comment on column public.meteor_tags.normalized_name is '検索・重複防止用の正規化名。クライアントでNFKC化し英字大小を畳む。';
comment on column public.meteor_tags.created_by is 'この流星タグを最初に作成したプロフィール。';

-- post_meteor_tags: 流星便と流星タグの関連.
create table if not exists public.post_meteor_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.meteor_tags(id) on delete cascade,
  sort_order integer not null check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id),
  unique (post_id, sort_order)
);

comment on table public.post_meteor_tags is '流星便と流星タグの関連。1投稿最大3件まで保存する。';
comment on column public.post_meteor_tags.sort_order is '本文中で最初に現れた順序。0から2まで。';

-- resonances: 共鳴.
-- Multiple resonances from the same profile to the same post are allowed in MVP.
create table if not exists public.resonances (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  resonance_type text not null default 'silent' check (resonance_type in ('silent', 'sparkle', 'afterglow', 'life', 'world', 'deep')),
  created_at timestamptz not null default now()
);

comment on table public.resonances is '共鳴。いいねではなく、心が反応した印。MVPでは同じユーザーが同じ流星便に何度でも共鳴できる。';
comment on column public.resonances.resonance_type is '共鳴の種類。将来、1投稿1ユーザー1共鳴にする場合は unique(post_id, profile_id) を追加する。';

-- notifications: R.Connect notification records.
-- Frontend users can read only their own notifications and update only is_read.
-- Notification rows are created by trusted database triggers, not by direct client inserts.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  type text not null check (type in ('resonance', 'archive', 'star_letter')),
  message text not null check (char_length(trim(message)) > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'R.Connect通知。共鳴、Archive、星文などの通知を保存する。';
comment on column public.notifications.recipient_id is '通知を受け取るユーザー。本人だけが閲覧できる。';
comment on column public.notifications.actor_id is '通知のきっかけを作ったユーザー。削除された場合はnullになる。';
comment on column public.notifications.type is '通知タイプ。MVPでは resonance、archive、star_letter を許可する。';
comment on column public.notifications.is_read is '既読状態。本人だけが更新できる。';

-- feedbacks: 星の目安箱.
-- Logged-in beta testers can send and read only their own feedback.
create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('不具合', '分かりにくい', '改善案', 'ほしい機能', '感想', 'その他')),
  body text not null check (
    char_length(trim(body)) > 0
    and char_length(trim(body)) <= 1000
  ),
  status text not null default 'new' check (status in ('new')),
  created_at timestamptz not null default now()
);

comment on table public.feedbacks is '星の目安箱。先行住民テスターから届いた不具合、感想、改善案を保存する。';
comment on column public.feedbacks.user_id is 'フィードバックを送ったログインユーザー。ユーザー削除時はnullになる。';
comment on column public.feedbacks.type is 'フィードバック種別。不具合、分かりにくい、改善案、ほしい機能、感想、その他。';
comment on column public.feedbacks.body is 'フィードバック本文。MVPでは1000文字以内。';
comment on column public.feedbacks.status is '運営確認用ステータス。MVPではnewのみ。';

-- star_letters: 星文.
create table if not exists public.star_letters (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  constraint star_letters_body_500_chars check (char_length(trim(body)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.star_letters is '星文。コメントではなく、流星便に残す言葉を保存する。';

-- archives: Archive.
-- Private by default through RLS.
create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  note text,
  archive_tags jsonb not null default '[]'::jsonb check (jsonb_typeof(archive_tags) = 'array'),
  work_constellation text,
  observed_mood text,
  created_at timestamptz not null default now(),
  unique (profile_id, post_id)
);

comment on table public.archives is 'Archive。保存ではなく、消したくない光を記録する機能。本人だけが閲覧できる前提。';
comment on column public.archives.archive_tags is 'Archive分類タグ。例: 夜明け前、祈り、未完成の光。';
comment on column public.archives.work_constellation is '作品につける星座名。';

-- observations: 観測ログ.
-- Future AI resident observation output is stored here.
create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  observer_id uuid references public.profiles(id) on delete set null,
  observer_type text not null default 'human' check (observer_type in ('human', 'ai_resident')),
  ai_resident_key text,
  observation_type text not null default 'view' check (observation_type in ('view', 'ai_observation', 'archive_classification', 'recommendation_check', 'deep_observation')),
  note text,
  analysis_summary text,
  observed_points jsonb not null default '[]'::jsonb check (jsonb_typeof(observed_points) = 'array'),
  resonance_score integer check (resonance_score is null or (resonance_score between 0 and 100)),
  should_comment boolean not null default false,
  should_recommend boolean not null default false,
  comment text,
  recommendation_message text,
  x_post_draft text,
  archive_tags jsonb not null default '[]'::jsonb check (jsonb_typeof(archive_tags) = 'array'),
  work_constellation text,
  created_at timestamptz not null default now(),
  constraint observations_observer_identity check (
    (observer_type = 'human' and observer_id is not null)
    or (observer_type = 'ai_resident' and ai_resident_key is not null)
  )
);

comment on table public.observations is '観測ログ。人間またはAI住人が流星便を観測した記録を保存する。AI観測APIのJSON出力を保存しやすい形にする。';
comment on column public.observations.ai_resident_key is 'AI住人の識別キー。例: hoshizora_chia。';
comment on column public.observations.analysis_summary is 'AI住人の観測要約。';
comment on column public.observations.observed_points is 'AI住人が観測したポイントの配列。';
comment on column public.observations.archive_tags is 'AI住人が提案したArchiveタグの配列。';
comment on column public.observations.x_post_draft is '将来のX投稿下書き。自動投稿はしない。';

-- updated_at triggers.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

drop trigger if exists star_letters_set_updated_at on public.star_letters;
create trigger star_letters_set_updated_at
before update on public.star_letters
for each row execute function public.set_updated_at();

-- Create a resonance notification for the 流星便 author.
-- The function lives in a private schema because it needs SECURITY DEFINER
-- to insert trusted notification rows without granting client insert access.
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

drop trigger if exists resonances_create_notification on public.resonances;
create trigger resonances_create_notification
after insert on public.resonances
for each row execute function app_private.create_resonance_notification();

-- Create an Archive notification for the 流星便 author.
-- The actor can opt out from notifying authors through profiles.notify_authors_when_i_archive.
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

  if target_author_id is null then
    return new;
  end if;

  if target_author_id = new.profile_id then
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

revoke all on function app_private.create_archive_notification() from public, anon, authenticated;

drop trigger if exists archives_create_notification on public.archives;
create trigger archives_create_notification
after insert on public.archives
for each row execute function app_private.create_archive_notification();

-- Create a 星文 notification for the 流星便 author.
create or replace function app_private.create_star_letter_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author_id uuid;
begin
  select p.author_id
    into target_author_id
  from public.posts p
  where p.id = new.post_id;

  if target_author_id is null then
    return new;
  end if;

  if target_author_id = new.author_id then
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
    new.author_id,
    new.post_id,
    'star_letter',
    'あなたの流星便に星文が届きました。'
  );

  return new;
end;
$$;

revoke all on function app_private.create_star_letter_notification() from public, anon, authenticated;

drop trigger if exists star_letters_create_notification on public.star_letters;
create trigger star_letters_create_notification
after insert on public.star_letters
for each row execute function app_private.create_star_letter_notification();

-- Indexes for MVP queries.
create index if not exists profiles_username_idx on public.profiles(username);
create index if not exists posts_author_id_idx on public.posts(author_id);
create index if not exists posts_type_idx on public.posts(type);
create index if not exists posts_visibility_created_at_idx on public.posts(visibility, created_at desc);
create index if not exists posts_deleted_at_idx on public.posts(deleted_at);
create index if not exists posts_visibility_deleted_created_at_idx on public.posts(visibility, deleted_at, created_at desc);
create index if not exists post_media_post_id_idx on public.post_media(post_id);
create index if not exists post_media_post_sort_order_idx on public.post_media(post_id, sort_order);
create index if not exists post_media_uploader_id_idx on public.post_media(uploader_id);
create index if not exists post_media_storage_path_idx on public.post_media(storage_path);
create index if not exists post_media_media_type_idx on public.post_media(media_type);
create index if not exists post_media_thumbnail_storage_path_idx on public.post_media(thumbnail_storage_path);
create unique index if not exists post_media_one_video_per_post_idx
on public.post_media(post_id)
where media_type = 'video';
create index if not exists profile_tags_profile_id_idx on public.profile_tags(profile_id);
create index if not exists post_tags_post_id_idx on public.post_tags(post_id);
create index if not exists post_tags_label_idx on public.post_tags(label);
create index if not exists meteor_tags_normalized_name_idx on public.meteor_tags(normalized_name);
create index if not exists meteor_tags_created_by_idx on public.meteor_tags(created_by);
create index if not exists post_meteor_tags_tag_id_idx on public.post_meteor_tags(tag_id);
create index if not exists post_meteor_tags_post_sort_order_idx on public.post_meteor_tags(post_id, sort_order);
create index if not exists resonances_post_id_idx on public.resonances(post_id);
create index if not exists resonances_profile_id_idx on public.resonances(profile_id);
create index if not exists resonances_type_idx on public.resonances(resonance_type);
create index if not exists notifications_recipient_created_at_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_recipient_is_read_idx on public.notifications(recipient_id, is_read);
create index if not exists notifications_actor_id_idx on public.notifications(actor_id);
create index if not exists notifications_post_id_idx on public.notifications(post_id);
create unique index if not exists notifications_resonance_once_per_actor_post_idx
on public.notifications(recipient_id, actor_id, post_id)
where type = 'resonance';
create index if not exists feedbacks_user_created_at_idx on public.feedbacks(user_id, created_at desc);
create index if not exists feedbacks_status_created_at_idx on public.feedbacks(status, created_at desc);
create index if not exists star_letters_post_id_idx on public.star_letters(post_id);
create index if not exists star_letters_author_id_idx on public.star_letters(author_id);
create index if not exists archives_profile_id_idx on public.archives(profile_id);
create index if not exists archives_post_id_idx on public.archives(post_id);
create index if not exists archives_archive_tags_gin_idx on public.archives using gin (archive_tags);
create index if not exists observations_post_id_idx on public.observations(post_id);
create index if not exists observations_observer_id_idx on public.observations(observer_id);
create index if not exists observations_ai_resident_key_idx on public.observations(ai_resident_key);
create index if not exists observations_type_idx on public.observations(observation_type);
create index if not exists observations_created_at_idx on public.observations(created_at desc);
create index if not exists observations_observed_points_gin_idx on public.observations using gin (observed_points);
create index if not exists observations_archive_tags_gin_idx on public.observations using gin (archive_tags);

-- Row Level Security.
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.profile_tags enable row level security;
alter table public.post_tags enable row level security;
alter table public.meteor_tags enable row level security;
alter table public.post_meteor_tags enable row level security;
alter table public.resonances enable row level security;
alter table public.notifications enable row level security;
alter table public.feedbacks enable row level security;
alter table public.star_letters enable row level security;
alter table public.archives enable row level security;
alter table public.observations enable row level security;

revoke insert, update, delete, truncate on all tables in schema public from public, anon, authenticated;
grant insert, update on table public.profiles to authenticated;
grant insert, update on table public.posts to authenticated;
grant insert on table public.resonances to authenticated;
grant insert, update, delete on table public.star_letters to authenticated;
grant insert, delete on table public.archives to authenticated;

alter default privileges in schema public
revoke insert, update, delete, truncate on tables from public, anon, authenticated;

-- profiles:
-- Readable by anyone, writable by owner.
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
for select using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
for delete using (auth.uid() = id);

-- posts:
-- Public posts are readable by anyone; private posts only by author.
drop policy if exists posts_select_visible on public.posts;
create policy posts_select_visible on public.posts
for select using (
  (visibility = 'public' and deleted_at is null)
  or author_id = auth.uid()
);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
for insert with check (auth.uid() = author_id);

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
for delete using (auth.uid() = author_id);

-- post_media:
-- Public, non-deleted post media is readable; insert is restricted to the post author.
revoke all on table public.post_media from anon, authenticated;
grant select on table public.post_media to anon, authenticated;
grant insert, delete on table public.post_media to authenticated;

drop policy if exists post_media_select_visible on public.post_media;
create policy post_media_select_visible on public.post_media
for select using (
  exists (
    select 1 from public.posts p
    where p.id = public.post_media.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists post_media_insert_own_post on public.post_media;
create policy post_media_insert_own_post on public.post_media
for insert to authenticated
with check (
  uploader_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = public.post_media.post_id
      and p.author_id = auth.uid()
  )
);

drop policy if exists post_media_delete_own_upload on public.post_media;
create policy post_media_delete_own_upload on public.post_media
for delete to authenticated
using (uploader_id = auth.uid());

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

-- profile_tags: visible as part of public profile; editable only by owner.
drop policy if exists profile_tags_select_public on public.profile_tags;
create policy profile_tags_select_public on public.profile_tags
for select using (true);

drop policy if exists profile_tags_insert_own on public.profile_tags;
create policy profile_tags_insert_own on public.profile_tags
for insert with check (auth.uid() = profile_id);

drop policy if exists profile_tags_update_own on public.profile_tags;
create policy profile_tags_update_own on public.profile_tags
for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists profile_tags_delete_own on public.profile_tags;
create policy profile_tags_delete_own on public.profile_tags
for delete using (auth.uid() = profile_id);

-- post_tags: readable when the linked post is visible; editable only by post author.
drop policy if exists post_tags_select_visible on public.post_tags;
create policy post_tags_select_visible on public.post_tags
for select using (
  exists (
    select 1 from public.posts p
    where p.id = public.post_tags.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists post_tags_insert_by_post_author on public.post_tags;
create policy post_tags_insert_by_post_author on public.post_tags
for insert with check (
  exists (
    select 1 from public.posts p
    where p.id = public.post_tags.post_id
      and p.author_id = auth.uid()
  )
);

drop policy if exists post_tags_update_by_post_author on public.post_tags;
create policy post_tags_update_by_post_author on public.post_tags
for update using (
  exists (
    select 1 from public.posts p
    where p.id = public.post_tags.post_id
      and p.author_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.posts p
    where p.id = public.post_tags.post_id
      and p.author_id = auth.uid()
  )
);

drop policy if exists post_tags_delete_by_post_author on public.post_tags;
create policy post_tags_delete_by_post_author on public.post_tags
for delete using (
  exists (
    select 1 from public.posts p
    where p.id = public.post_tags.post_id
      and p.author_id = auth.uid()
  )
);

-- meteor_tags: searchable tag dictionary; relations are editable only by post author.
revoke all on table public.meteor_tags from anon, authenticated;
grant select on table public.meteor_tags to anon, authenticated;
grant insert on table public.meteor_tags to authenticated;

revoke all on table public.post_meteor_tags from anon, authenticated;
grant select on table public.post_meteor_tags to anon, authenticated;
grant insert, delete on table public.post_meteor_tags to authenticated;

drop policy if exists meteor_tags_select_public on public.meteor_tags;
create policy meteor_tags_select_public on public.meteor_tags
for select using (true);

drop policy if exists meteor_tags_insert_authenticated on public.meteor_tags;
create policy meteor_tags_insert_authenticated on public.meteor_tags
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and char_length(trim(name)) > 0
  and char_length(trim(normalized_name)) > 0
);

drop policy if exists post_meteor_tags_select_visible on public.post_meteor_tags;
create policy post_meteor_tags_select_visible on public.post_meteor_tags
for select using (
  exists (
    select 1
    from public.posts p
    where p.id = public.post_meteor_tags.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = (select auth.uid())
      )
  )
);

drop policy if exists post_meteor_tags_insert_by_post_author on public.post_meteor_tags;
create policy post_meteor_tags_insert_by_post_author on public.post_meteor_tags
for insert to authenticated
with check (
  sort_order between 0 and 2
  and exists (
    select 1
    from public.posts p
    where p.id = public.post_meteor_tags.post_id
      and p.author_id = (select auth.uid())
      and p.deleted_at is null
  )
);

drop policy if exists post_meteor_tags_delete_by_post_author on public.post_meteor_tags;
create policy post_meteor_tags_delete_by_post_author on public.post_meteor_tags
for delete to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = public.post_meteor_tags.post_id
      and p.author_id = (select auth.uid())
  )
);

-- resonances:
-- Logged-in users can create their own 共鳴.
-- Repeated 共鳴 is allowed in MVP.
drop policy if exists resonances_select_visible on public.resonances;
create policy resonances_select_visible on public.resonances
for select using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.posts p
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
    select 1 from public.posts p
    where p.id = public.resonances.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists resonances_delete_own on public.resonances;
create policy resonances_delete_own on public.resonances
for delete using (profile_id = auth.uid());

-- notifications:
-- Client inserts are intentionally not allowed; trusted triggers create rows.
-- UPDATE is limited to is_read through column privileges plus RLS owner checks.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (recipient_id = auth.uid());

drop policy if exists notifications_update_read_own on public.notifications;
create policy notifications_update_read_own on public.notifications
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

-- feedbacks:
-- Logged-in users can send feedback and read only their own rows.
revoke all on table public.feedbacks from anon, authenticated;
grant select, insert on table public.feedbacks to authenticated;

drop policy if exists feedbacks_select_own on public.feedbacks;
create policy feedbacks_select_own on public.feedbacks
for select to authenticated
using (user_id = auth.uid());

drop policy if exists feedbacks_insert_own on public.feedbacks;
create policy feedbacks_insert_own on public.feedbacks
for insert to authenticated
with check (user_id = auth.uid());

-- star_letters:
-- Logged-in users can leave 星文 on visible posts.
drop policy if exists star_letters_select_visible on public.star_letters;
create policy star_letters_select_visible on public.star_letters
for select using (
  author_id = auth.uid()
  or exists (
    select 1 from public.posts p
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
    select 1 from public.posts p
    where p.id = public.star_letters.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists star_letters_update_own on public.star_letters;
create policy star_letters_update_own on public.star_letters
for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists star_letters_delete_own on public.star_letters;
create policy star_letters_delete_own on public.star_letters
for delete using (author_id = auth.uid());

-- archives:
-- Private Archive. Only owner can read or mutate.
drop policy if exists archives_select_own on public.archives;
create policy archives_select_own on public.archives
for select using (profile_id = auth.uid());

drop policy if exists archives_insert_own on public.archives;
create policy archives_insert_own on public.archives
for insert with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = public.archives.post_id
      and (
        (p.visibility = 'public' and p.deleted_at is null)
        or p.author_id = auth.uid()
      )
  )
);

drop policy if exists archives_update_own on public.archives;
create policy archives_update_own on public.archives
for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists archives_delete_own on public.archives;
create policy archives_delete_own on public.archives
for delete using (profile_id = auth.uid());

-- observations:
-- Internal AI observation rows are not directly exposed to browser roles.
-- AI resident reads/writes should happen from trusted server-side code using service_role; never expose service_role to the frontend.
revoke all on table public.observations from anon, authenticated;

drop policy if exists observations_select_visible on public.observations;

drop policy if exists observations_insert_human_own on public.observations;
create policy observations_insert_human_own on public.observations
for insert with check (
  observer_type = 'human'
  and observer_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = public.observations.post_id
      and (p.visibility = 'public' or p.author_id = auth.uid())
  )
);

drop policy if exists observations_update_human_own on public.observations;
create policy observations_update_human_own on public.observations
for update using (observer_type = 'human' and observer_id = auth.uid())
with check (observer_type = 'human' and observer_id = auth.uid());

drop policy if exists observations_delete_human_own on public.observations;
create policy observations_delete_human_own on public.observations
for delete using (observer_type = 'human' and observer_id = auth.uid());

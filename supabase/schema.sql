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

-- profile_frames: profile icon frame catalog.
create table if not exists public.profile_frames (
  id uuid primary key default gen_random_uuid(),
  frame_key text not null unique check (frame_key ~ '^[a-z0-9_]{3,64}$'),
  name text not null check (char_length(trim(name)) > 0),
  description text,
  asset_path text not null check (asset_path ~ '^/profile-frames/[A-Za-z0-9._/-]+\.png$'),
  acquisition_type text not null default 'admin_grant' check (
    acquisition_type in ('admin_grant', 'beta_reward', 'event', 'purchase', 'gacha', 'system')
  ),
  rarity text,
  frame_scale numeric(5,2) not null default 1.22 check (frame_scale between 0.50 and 2.00),
  frame_offset_x numeric(6,2) not null default 0,
  frame_offset_y numeric(6,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profile_frames is 'プロフィールアイコンフレームのカタログ。運営付与、ベータ特典、課金、ガチャなど将来拡張用。';
comment on column public.profile_frames.frame_key is 'アプリ内で参照する一意キー。例: chia_guide。';
comment on column public.profile_frames.asset_path is 'public配下の透過PNGパス。例: /profile-frames/chia-guide.png。';
comment on column public.profile_frames.acquisition_type is '入手種別。MVPではadmin_grantのみ使用。';
comment on column public.profile_frames.frame_scale is 'プロフィール画像に対するフレーム表示倍率。';
comment on column public.profile_frames.frame_offset_x is 'フレーム表示位置のX方向調整パーセント。';
comment on column public.profile_frames.frame_offset_y is 'フレーム表示位置のY方向調整パーセント。';

-- profiles: user profile linked to Supabase Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) > 0),
  username text unique check (username is null or username ~ '^[A-Za-z0-9_]{3,32}$'),
  bio text,
  avatar_url text,
  constellation_note text,
  active_frame_id uuid references public.profile_frames(id) on delete set null,
  notify_authors_when_i_archive boolean not null default true,
  notify_authors_when_i_resonate boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'ユーザープロフィール。表示名、自己紹介、アイコン、わたしの星座を保存する。';
comment on column public.profiles.constellation_note is 'わたしの星座を説明する自由記述。';
comment on column public.profiles.active_frame_id is '現在装着中のプロフィールアイコンフレーム。nullならフレームなし。';
comment on column public.profiles.notify_authors_when_i_archive is '自分が誰かの流星便をArchiveした時、相手にR.Connect通知を送るかどうか。デフォルトON。';
comment on column public.profiles.notify_authors_when_i_resonate is '自分が誰かの流星便に共鳴した時、相手にR.Connect通知を送るかどうか。デフォルトON。';

-- legal_consents: Terms and Privacy Policy acceptance records.
create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  age_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint legal_consents_versions_check check (
    terms_version = btrim(terms_version)
    and privacy_version = btrim(privacy_version)
    and terms_version <> ''
    and privacy_version <> ''
    and char_length(terms_version) <= 32
    and char_length(privacy_version) <= 32
  ),
  constraint legal_consents_user_versions_key unique (user_id, terms_version, privacy_version)
);

comment on table public.legal_consents is
'利用規約とプライバシーポリシーへの同意記録。2026-07-10版から記録する。';
comment on column public.legal_consents.user_id is
'同意したSupabase Authユーザー。ブラウザからは本人分のみselect可能。記録はauth.users triggerまたはrecord_legal_consent RPCで行う。';
comment on column public.legal_consents.terms_version is
'同意した利用規約の版。MVPでは2026-07-10。';
comment on column public.legal_consents.privacy_version is
'同意したプライバシーポリシーの版。MVPでは2026-07-10。';
comment on column public.legal_consents.accepted_at is
'同意を記録した時刻。';
comment on column public.legal_consents.age_confirmed_at is
'18歳以上であることを確認した時刻。';

-- profile_frame_ownerships: owned profile icon frames.
create table if not exists public.profile_frame_ownerships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  frame_id uuid not null references public.profile_frames(id) on delete cascade,
  acquisition_source text not null default 'operator_grant',
  granted_at timestamptz not null default now(),
  unique (profile_id, frame_id)
);

comment on table public.profile_frame_ownerships is 'どのプロフィールがどのプロフィールアイコンフレームを所持しているか。ブラウザからの自己付与は許可しない。';
comment on column public.profile_frame_ownerships.acquisition_source is '付与元。MVPではoperator_grantを使用。';

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

alter table public.post_media
drop constraint if exists post_media_storage_path_owner_check;

alter table public.post_media
add constraint post_media_storage_path_owner_check
check (
  storage_path is not null
  and storage_path = btrim(storage_path)
  and storage_path <> ''
  and position('/' in storage_path) > 0
  and split_part(storage_path, '/', 1) = uploader_id::text
  and storage_path !~ '^/'
  and storage_path !~ '/$'
  and storage_path !~ '//'
  and storage_path !~ '(^|/)\.{1,2}(/|$)'
  and position(chr(92) in storage_path) = 0
  and position('%' in storage_path) = 0
);

alter table public.post_media
drop constraint if exists post_media_thumbnail_storage_path_owner_check;

alter table public.post_media
add constraint post_media_thumbnail_storage_path_owner_check
check (
  thumbnail_storage_path is null
  or (
    thumbnail_storage_path = btrim(thumbnail_storage_path)
    and thumbnail_storage_path <> ''
    and position('/' in thumbnail_storage_path) > 0
    and split_part(thumbnail_storage_path, '/', 1) = uploader_id::text
    and thumbnail_storage_path !~ '^/'
    and thumbnail_storage_path !~ '/$'
    and thumbnail_storage_path !~ '//'
    and thumbnail_storage_path !~ '(^|/)\.{1,2}(/|$)'
    and position(chr(92) in thumbnail_storage_path) = 0
    and position('%' in thumbnail_storage_path) = 0
  )
);

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

-- push_subscriptions: R.Connect mobile Push subscription registrations.
-- Registered by authenticated Netlify Functions with service_role only.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check check (
    endpoint = btrim(endpoint)
    and endpoint <> ''
    and char_length(endpoint) <= 2048
    and endpoint like 'https://%'
  ),
  constraint push_subscriptions_p256dh_check check (
    p256dh = btrim(p256dh)
    and p256dh <> ''
    and char_length(p256dh) <= 512
  ),
  constraint push_subscriptions_auth_check check (
    auth = btrim(auth)
    and auth <> ''
    and char_length(auth) <= 256
  ),
  constraint push_subscriptions_user_agent_check check (
    user_agent is null or char_length(user_agent) <= 512
  )
);

comment on table public.push_subscriptions is
'R.ConnectスマホPush通知用の端末購読情報。Netlify Functionのservice_role経由でのみ登録する。';
comment on column public.push_subscriptions.profile_id is
'購読端末を登録したプロフィール。ブラウザから直接insert/updateさせず、認証済みNetlify Functionが検証済みaccess tokenから設定する。';
comment on column public.push_subscriptions.endpoint is
'Web Push endpoint。端末購読の一意キー。';
comment on column public.push_subscriptions.disabled_at is
'送信失敗時に購読を無効化するための時刻。';

-- push_notification_jobs: queued mobile Push deliveries for R.Connect.
-- Created from public.notifications inserts and claimed by service_role only.
create table if not exists public.push_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint push_notification_jobs_notification_id_key unique (notification_id),
  constraint push_notification_jobs_status_check check (
    status in ('queued', 'processing', 'succeeded', 'failed', 'skipped')
  ),
  constraint push_notification_jobs_attempts_check check (
    attempt_count >= 0
    and max_attempts between 1 and 10
    and attempt_count <= max_attempts
  ),
  constraint push_notification_jobs_completion_check check (
    (status in ('succeeded', 'failed', 'skipped') and completed_at is not null)
    or (status in ('queued', 'processing') and completed_at is null)
  ),
  constraint push_notification_jobs_error_code_check check (
    last_error_code is null
    or (
      last_error_code = upper(last_error_code)
      and last_error_code ~ '^[A-Z0-9_]{2,64}$'
    )
  )
);

comment on table public.push_notification_jobs is
'R.Connect通知を登録済み端末へWeb Push配信するためのserver-side queue。browser roleからは直接操作させない。';
comment on column public.push_notification_jobs.notification_id is
'Push配信対象のpublic.notifications行。1通知につき最大1job。';
comment on column public.push_notification_jobs.recipient_id is
'通知受信者。送信Functionはこのprofile_idに紐づく有効なpush_subscriptionsだけへ送信する。';
comment on column public.push_notification_jobs.status is
'queued / processing / succeeded / failed / skipped。';
comment on column public.push_notification_jobs.attempt_count is
'scheduled Functionがclaimした送信試行回数。Gemini/AI観測とは無関係。';

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

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ai_observation_job_status'
  ) then
    create type public.ai_observation_job_status as enum (
      'queued',
      'processing',
      'succeeded',
      'failed',
      'cancelled'
    );
  end if;
end;
$$;

-- ai_observation_jobs: AI住人観測ジョブ.
-- Gemini実呼び出しや星文投稿は行わず、信頼済みサーバー処理からの予約・状態管理だけを扱う。
create table if not exists public.ai_observation_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  ai_resident_key text not null,
  provider text not null,
  model text not null,
  status public.ai_observation_job_status not null default 'queued',
  idempotency_key text not null,
  request_fingerprint text not null,
  observation_context text not null default 'manual',
  not_before_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 1,
  input_kind text not null,
  input_size_bytes bigint not null default 0,
  input_duration_seconds numeric,
  reserved_cost_micro_usd bigint not null default 0,
  actual_cost_micro_usd bigint,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  observation_id uuid references public.observations(id) on delete set null,
  star_letter_id uuid references public.star_letters(id) on delete set null,
  public_error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ai_observation_jobs_ai_resident_key_check check (ai_resident_key in ('hoshizora_chia')),
  constraint ai_observation_jobs_provider_check check (provider in ('gemini')),
  constraint ai_observation_jobs_input_kind_check check (input_kind in ('text', 'image', 'audio', 'video', 'youtube')),
  constraint ai_observation_jobs_observation_context_check check (observation_context in ('manual', 'auto_text_post')),
  constraint ai_observation_jobs_idempotency_key_check check (idempotency_key ~ '^[A-Za-z0-9._:-]{32,128}$'),
  constraint ai_observation_jobs_request_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint ai_observation_jobs_attempts_check check (attempt_count >= 0 and max_attempts between 1 and 10 and attempt_count <= max_attempts),
  constraint ai_observation_jobs_input_size_check check (input_size_bytes >= 0),
  constraint ai_observation_jobs_input_duration_check check (input_duration_seconds is null or input_duration_seconds >= 0),
  constraint ai_observation_jobs_reserved_cost_check check (reserved_cost_micro_usd >= 0),
  constraint ai_observation_jobs_actual_cost_check check (actual_cost_micro_usd is null or actual_cost_micro_usd >= 0),
  constraint ai_observation_jobs_tokens_check check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (total_tokens is null or total_tokens >= 0)
  ),
  constraint ai_observation_jobs_error_code_check check (
    public_error_code is null or public_error_code ~ '^[A-Z0-9_:-]{1,80}$'
  )
);

comment on table public.ai_observation_jobs is 'AI住人観測ジョブの内部キュー。ブラウザからは直接操作させず、信頼済みサーバー処理が予約・状態遷移する。';
comment on column public.ai_observation_jobs.reserved_cost_micro_usd is '利用上限判定に使う予約料金。micro USD単位の整数で保存する。';
comment on column public.ai_observation_jobs.actual_cost_micro_usd is 'AI実行後にprovider usageから推定した料金。Gemini 3.5 Flash Standardのpricing snapshotに基づくmicro USD整数で、請求書上の確定額ではない。';
comment on column public.ai_observation_jobs.request_fingerprint is '同じ入力を安全に識別するハッシュ。投稿本文やStorage pathそのものは保存しない。';
comment on column public.ai_observation_jobs.observation_context is 'AI観測jobの実行文脈。manualまたは投稿後自動観測(auto_text_post)のみ。';
comment on column public.ai_observation_jobs.not_before_at is 'この時刻まではworkerがclaimしない。投稿後自動観測を即時固定にしないための遅延実行時刻。';
comment on column public.ai_observation_jobs.public_error_code is '外部へ出してよい短いエラーコード。内部エラー本文は保存しない。';
comment on column public.ai_observation_jobs.attempt_count is 'provider APIを実際に呼び出した回数。自動リトライは同じジョブ行の中でこの値を増やす。';
comment on column public.ai_observation_jobs.max_attempts is '1つの観測処理で許可するprovider API呼び出し総数。';

create or replace function app_private.ai_observation_billable_cost_micro_usd(
  p_status public.ai_observation_job_status,
  p_attempt_count integer,
  p_reserved_cost_micro_usd bigint,
  p_actual_cost_micro_usd bigint
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status in ('queued', 'processing') then greatest(coalesce(p_reserved_cost_micro_usd, 0), 0)
    when p_status = 'succeeded' then greatest(coalesce(p_actual_cost_micro_usd, p_reserved_cost_micro_usd, 0), 0)
    when p_status = 'failed' and coalesce(p_attempt_count, 0) > 0 then greatest(coalesce(p_actual_cost_micro_usd, p_reserved_cost_micro_usd, 0), 0)
    else 0
  end;
$$;

revoke all on function app_private.ai_observation_billable_cost_micro_usd(
  public.ai_observation_job_status,
  integer,
  bigint,
  bigint
) from public, anon, authenticated;

create or replace function app_private.ai_observation_json_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then 'null'
    else to_json(p_value)::text
  end;
$$;

create or replace function app_private.ai_observation_json_timestamptz(p_value timestamp with time zone)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then 'null'
    else to_json(p_value)::text
  end;
$$;

create or replace function app_private.ai_observation_json_number(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then 'null'
    when p_value = 0 then '0'
    else regexp_replace(
      regexp_replace(
        to_char(p_value, 'FM999999999999999999999999999990.999999999999999999'),
        '0+$',
        ''
      ),
      '\.$',
      ''
    )
  end;
$$;

create or replace function app_private.ai_observation_current_request_fingerprint(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_media public.post_media%rowtype;
  v_media_rows text := '';
  v_media_separator text := '';
  v_input_kind text;
  v_input_size_bytes numeric := 0;
  v_input_duration_seconds numeric := null;
  v_payload text;
begin
  select *
    into v_post
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found
    or v_post.visibility <> 'public'
    or v_post.deleted_at is not null
  then
    return null;
  end if;

  for v_media in
    select *
    from public.post_media pm
    where pm.post_id = p_post_id
    order by pm.sort_order, pm.id
    for share
  loop
    v_media_rows := v_media_rows || v_media_separator || concat(
      '{',
      '"durationSeconds":', app_private.ai_observation_json_number(v_media.duration_seconds), ',',
      '"id":', app_private.ai_observation_json_text(v_media.id::text), ',',
      '"mediaType":', app_private.ai_observation_json_text(v_media.media_type), ',',
      '"mimeType":', app_private.ai_observation_json_text(v_media.mime_type), ',',
      '"sizeBytes":', app_private.ai_observation_json_number(v_media.size_bytes::numeric), ',',
      '"sortOrder":', app_private.ai_observation_json_number(v_media.sort_order::numeric), ',',
      '"storagePath":', app_private.ai_observation_json_text(v_media.storage_path), ',',
      '"thumbnailStoragePath":', app_private.ai_observation_json_text(v_media.thumbnail_storage_path), ',',
      '"uploaderId":', app_private.ai_observation_json_text(v_media.uploader_id::text),
      '}'
    );
    v_media_separator := ',';

    if v_post.type = 'image' then
      v_input_size_bytes := v_input_size_bytes + coalesce(v_media.size_bytes, 0)::numeric;
    elsif v_post.type = 'video' and v_media.sort_order = 0 and v_input_duration_seconds is null then
      v_input_size_bytes := coalesce(v_media.size_bytes, 0)::numeric;
      v_input_duration_seconds := v_media.duration_seconds;
    end if;
  end loop;

  if v_post.type = 'image' then
    v_input_kind := 'image';
  elsif v_post.type = 'video' then
    v_input_kind := 'video';
  elsif v_post.type = 'youtube' then
    v_input_kind := 'youtube';
    v_input_size_bytes := 0;
    v_input_duration_seconds := null;
  else
    v_input_kind := 'text';
    v_input_size_bytes := 0;
    v_input_duration_seconds := null;
  end if;

  v_payload := concat(
    '{',
    '"aiResidentKey":', app_private.ai_observation_json_text('hoshizora_chia'), ',',
    '"body":', app_private.ai_observation_json_text(coalesce(v_post.body, '')), ',',
    '"media":{',
      '"inputDurationSeconds":', app_private.ai_observation_json_number(v_input_duration_seconds), ',',
      '"inputKind":', app_private.ai_observation_json_text(v_input_kind), ',',
      '"inputSizeBytes":', app_private.ai_observation_json_number(v_input_size_bytes),
    '},',
    '"mediaRows":[', v_media_rows, '],',
    '"postId":', app_private.ai_observation_json_text(v_post.id::text), ',',
    '"postType":', app_private.ai_observation_json_text(v_post.type), ',',
    '"updatedAt":', app_private.ai_observation_json_timestamptz(v_post.updated_at), ',',
    '"youtubeUrl":', app_private.ai_observation_json_text(v_post.youtube_url), ',',
    '"youtubeVideoId":', app_private.ai_observation_json_text(v_post.youtube_video_id),
    '}'
  );

  return encode(extensions.digest(v_payload, 'sha256'), 'hex');
end;
$$;

comment on function app_private.ai_observation_current_request_fingerprint(uuid)
is 'Recomputes the AI observation request fingerprint from locked current posts/post_media rows. Canonical field order mirrors netlify/functions/_shared/aiJobReservation.mjs.';

revoke all on function app_private.ai_observation_json_text(text) from public, anon, authenticated;
revoke all on function app_private.ai_observation_json_timestamptz(timestamp with time zone) from public, anon, authenticated;
revoke all on function app_private.ai_observation_json_number(numeric) from public, anon, authenticated;
revoke all on function app_private.ai_observation_current_request_fingerprint(uuid) from public, anon, authenticated;

create index if not exists ai_observation_jobs_post_id_idx on public.ai_observation_jobs(post_id);
create index if not exists ai_observation_jobs_requested_by_created_at_idx
on public.ai_observation_jobs(requested_by, created_at desc);
create index if not exists ai_observation_jobs_status_created_at_idx
on public.ai_observation_jobs(status, created_at desc);
create index if not exists ai_observation_jobs_created_at_idx
on public.ai_observation_jobs(created_at desc);
create index if not exists ai_observation_jobs_due_queue_idx
on public.ai_observation_jobs(status, not_before_at, created_at)
where status = 'queued';

create unique index if not exists ai_observation_jobs_idempotency_key_idx
on public.ai_observation_jobs(idempotency_key);

create unique index if not exists ai_observation_jobs_one_active_per_post_resident_idx
on public.ai_observation_jobs(post_id, ai_resident_key)
where status in ('queued', 'processing');

create unique index if not exists ai_observation_jobs_one_success_per_post_resident_idx
on public.ai_observation_jobs(post_id, ai_resident_key)
where status = 'succeeded';

drop trigger if exists ai_observation_jobs_set_updated_at on public.ai_observation_jobs;
create trigger ai_observation_jobs_set_updated_at
before update on public.ai_observation_jobs
for each row execute function public.set_updated_at();

create or replace function public.reserve_ai_observation_job(
  p_post_id uuid,
  p_requested_by uuid,
  p_ai_resident_key text,
  p_provider text,
  p_model text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_observation_context text,
  p_not_before_at timestamptz,
  p_input_kind text,
  p_input_size_bytes bigint,
  p_input_duration_seconds numeric,
  p_reserved_cost_micro_usd bigint,
  p_max_attempts integer,
  p_daily_request_limit integer,
  p_monthly_request_limit integer,
  p_daily_cost_limit_micro_usd bigint,
  p_monthly_cost_limit_micro_usd bigint,
  p_min_seconds_between_requests integer
)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  observation_context text,
  not_before_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_daily_requests bigint;
  v_monthly_requests bigint;
  v_daily_cost bigint;
  v_monthly_cost bigint;
begin
  if p_ai_resident_key <> 'hoshizora_chia'
    or p_provider <> 'gemini'
    or p_model <> 'gemini-3.5-flash'
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]{32,128}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_observation_context not in ('manual', 'auto_text_post')
    or p_not_before_at is null
    or p_not_before_at < now() - interval '5 minutes'
    or p_not_before_at > now() + interval '1 day'
    or p_input_kind not in ('text', 'image', 'audio', 'video', 'youtube')
    or p_input_size_bytes < 0
    or p_reserved_cost_micro_usd < 1
    or p_max_attempts < 1
    or p_max_attempts > 10
    or p_daily_request_limit < 1
    or p_monthly_request_limit < 1
    or p_daily_cost_limit_micro_usd < 1
    or p_monthly_cost_limit_micro_usd < 1
    or p_min_seconds_between_requests < 0
  then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('ai_observation_jobs:global')::bigint);
  perform pg_advisory_xact_lock(hashtext('ai_observation_jobs:' || p_post_id::text || ':' || p_ai_resident_key)::bigint);

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and p.visibility = 'public'
      and p.deleted_at is null
      and p.type in ('text', 'image', 'video', 'youtube')
  ) then
    outcome := 'post_not_found';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.idempotency_key = p_idempotency_key
  ) then
    outcome := 'duplicate_idempotency';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status in ('queued', 'processing')
  ) then
    outcome := 'already_queued';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status = 'succeeded'
  ) then
    outcome := 'already_succeeded';
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.ai_observation_jobs j
    where j.post_id = p_post_id
      and j.ai_resident_key = p_ai_resident_key
      and j.status = 'failed'
  ) then
    outcome := 'already_failed';
    return next;
    return;
  end if;

  if p_min_seconds_between_requests > 0 and exists (
    select 1
    from public.ai_observation_jobs j
    where j.requested_by = p_requested_by
      and j.created_at > now() - make_interval(secs => p_min_seconds_between_requests)
      and j.status in ('queued', 'processing', 'succeeded', 'failed')
  ) then
    outcome := 'retry_too_soon';
    return next;
    return;
  end if;

  select count(*),
    coalesce(sum(app_private.ai_observation_billable_cost_micro_usd(
      j.status,
      j.attempt_count,
      j.reserved_cost_micro_usd,
      j.actual_cost_micro_usd
    )), 0)
    into v_daily_requests, v_daily_cost
  from public.ai_observation_jobs j
  where j.created_at >= v_day_start
    and j.status in ('queued', 'processing', 'succeeded', 'failed');

  select count(*),
    coalesce(sum(app_private.ai_observation_billable_cost_micro_usd(
      j.status,
      j.attempt_count,
      j.reserved_cost_micro_usd,
      j.actual_cost_micro_usd
    )), 0)
    into v_monthly_requests, v_monthly_cost
  from public.ai_observation_jobs j
  where j.created_at >= v_month_start
    and j.status in ('queued', 'processing', 'succeeded', 'failed');

  if v_daily_requests >= p_daily_request_limit
    or v_monthly_requests >= p_monthly_request_limit
    or v_daily_cost + p_reserved_cost_micro_usd > p_daily_cost_limit_micro_usd
    or v_monthly_cost + p_reserved_cost_micro_usd > p_monthly_cost_limit_micro_usd
  then
    outcome := 'rate_limited';
    return next;
    return;
  end if;

  insert into public.ai_observation_jobs (
    post_id,
    requested_by,
    ai_resident_key,
    provider,
    model,
    status,
    idempotency_key,
    request_fingerprint,
    observation_context,
    not_before_at,
    max_attempts,
    input_kind,
    input_size_bytes,
    input_duration_seconds,
    reserved_cost_micro_usd
  )
  values (
    p_post_id,
    p_requested_by,
    p_ai_resident_key,
    p_provider,
    p_model,
    'queued',
    p_idempotency_key,
    p_request_fingerprint,
    p_observation_context,
    p_not_before_at,
    p_max_attempts,
    p_input_kind,
    p_input_size_bytes,
    p_input_duration_seconds,
    p_reserved_cost_micro_usd
  )
  returning * into v_job;

  outcome := 'reserved';
  job_id := v_job.id;
  job_status := v_job.status::text;
  observation_context := v_job.observation_context;
  not_before_at := v_job.not_before_at;
  return next;

exception
  when unique_violation then
    outcome := 'already_queued';
    job_id := null;
    job_status := null;
    observation_context := null;
    not_before_at := null;
    return next;
end;
$$;

create or replace function public.reserve_ai_observation_job(
  p_post_id uuid,
  p_requested_by uuid,
  p_ai_resident_key text,
  p_provider text,
  p_model text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_input_kind text,
  p_input_size_bytes bigint,
  p_input_duration_seconds numeric,
  p_reserved_cost_micro_usd bigint,
  p_max_attempts integer,
  p_daily_request_limit integer,
  p_monthly_request_limit integer,
  p_daily_cost_limit_micro_usd bigint,
  p_monthly_cost_limit_micro_usd bigint,
  p_min_seconds_between_requests integer
)
returns table (
  outcome text,
  job_id uuid,
  job_status text
)
language sql
security definer
set search_path = ''
as $$
  select r.outcome, r.job_id, r.job_status
  from public.reserve_ai_observation_job(
    p_post_id,
    p_requested_by,
    p_ai_resident_key,
    p_provider,
    p_model,
    p_idempotency_key,
    p_request_fingerprint,
    'manual',
    now(),
    p_input_kind,
    p_input_size_bytes,
    p_input_duration_seconds,
    p_reserved_cost_micro_usd,
    p_max_attempts,
    p_daily_request_limit,
    p_monthly_request_limit,
    p_daily_cost_limit_micro_usd,
    p_monthly_cost_limit_micro_usd,
    p_min_seconds_between_requests
  ) as r;
$$;

-- updated_at triggers.
drop trigger if exists profile_frames_set_updated_at on public.profile_frames;
create trigger profile_frames_set_updated_at
before update on public.profile_frames
for each row execute function public.set_updated_at();

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

-- Ensure a user can only equip profile icon frames they own.
create or replace function app_private.ensure_profile_active_frame_owned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active_frame_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.profile_frame_ownerships ownership
    join public.profile_frames frame on frame.id = ownership.frame_id
    where ownership.profile_id = new.id
      and ownership.frame_id = new.active_frame_id
      and frame.is_active is true
  ) then
    raise exception 'active profile frame must be owned by this profile'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.ensure_profile_active_frame_owned() from public, anon, authenticated;

drop trigger if exists profiles_active_frame_owned on public.profiles;
create trigger profiles_active_frame_owned
before insert or update of active_frame_id on public.profiles
for each row execute function app_private.ensure_profile_active_frame_owned();

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

-- Queue Web Push delivery for every R.Connect notification row.
create or replace function app_private.enqueue_push_notification_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_id is null then
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

revoke all on function app_private.enqueue_push_notification_job() from public, anon, authenticated;

drop trigger if exists notifications_enqueue_push_notification_job on public.notifications;
create trigger notifications_enqueue_push_notification_job
after insert on public.notifications
for each row execute function app_private.enqueue_push_notification_job();

create or replace function public.claim_push_notification_jobs(p_limit integer default 20)
returns table (
  id uuid,
  notification_id uuid,
  recipient_id uuid,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid push notification claim limit' using errcode = '22023';
  end if;

  return query
  with selected_jobs as (
    select j.id
    from public.push_notification_jobs j
    where (
        (
          j.status = 'queued'
          and j.next_attempt_at <= now()
        )
        or (
          j.status = 'processing'
          and j.updated_at < now() - interval '15 minutes'
        )
      )
      and j.attempt_count < j.max_attempts
    order by j.next_attempt_at asc, j.created_at asc, j.id asc
    for update skip locked
    limit p_limit
  )
  update public.push_notification_jobs j
  set
    status = 'processing',
    attempt_count = j.attempt_count + 1,
    last_error_code = null,
    updated_at = now()
  from selected_jobs s
  where j.id = s.id
  returning
    j.id,
    j.notification_id,
    j.recipient_id,
    j.attempt_count,
    j.max_attempts;
end;
$$;

revoke all on function public.claim_push_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notification_jobs(integer) to service_role;

-- Indexes for MVP queries.
create index if not exists profile_frames_frame_key_idx on public.profile_frames(frame_key);
create index if not exists profile_frames_is_active_idx on public.profile_frames(is_active);
create index if not exists profiles_active_frame_id_idx on public.profiles(active_frame_id);
create index if not exists legal_consents_user_id_idx on public.legal_consents(user_id);
create index if not exists profile_frame_ownerships_profile_id_idx on public.profile_frame_ownerships(profile_id);
create index if not exists profile_frame_ownerships_frame_id_idx on public.profile_frame_ownerships(frame_id);
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
create index if not exists push_subscriptions_profile_id_idx
on public.push_subscriptions(profile_id);
create index if not exists push_subscriptions_disabled_at_idx
on public.push_subscriptions(disabled_at);
create index if not exists push_notification_jobs_recipient_created_at_idx
on public.push_notification_jobs(recipient_id, created_at desc);
create index if not exists push_notification_jobs_status_next_attempt_idx
on public.push_notification_jobs(status, next_attempt_at, created_at);
create index if not exists push_notification_jobs_notification_id_idx
on public.push_notification_jobs(notification_id);
drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();
drop trigger if exists push_notification_jobs_set_updated_at on public.push_notification_jobs;
create trigger push_notification_jobs_set_updated_at
before update on public.push_notification_jobs
for each row execute function public.set_updated_at();
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
alter table public.profile_frames enable row level security;
alter table public.profile_frame_ownerships enable row level security;
alter table public.profiles enable row level security;
alter table public.legal_consents enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.profile_tags enable row level security;
alter table public.post_tags enable row level security;
alter table public.meteor_tags enable row level security;
alter table public.post_meteor_tags enable row level security;
alter table public.resonances enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_notification_jobs enable row level security;
alter table public.feedbacks enable row level security;
alter table public.star_letters enable row level security;
alter table public.archives enable row level security;
alter table public.observations enable row level security;
alter table public.ai_observation_jobs enable row level security;

revoke insert, update, delete, truncate on all tables in schema public from public, anon, authenticated;
grant select on table public.profile_frames to anon, authenticated;
grant select on table public.profile_frame_ownerships to authenticated;
grant insert, update on table public.profiles to authenticated;
revoke all on table public.legal_consents from public, anon, authenticated;
grant select on table public.legal_consents to authenticated;
grant select, insert on table public.legal_consents to service_role;
grant insert, update on table public.posts to authenticated;
grant insert on table public.resonances to authenticated;
grant insert, update, delete on table public.star_letters to authenticated;
grant insert, delete on table public.archives to authenticated;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update on table public.push_subscriptions to service_role;
revoke all on table public.push_notification_jobs from public, anon, authenticated;
grant select, insert, update on table public.push_notification_jobs to service_role;

alter default privileges in schema public
revoke insert, update, delete, truncate on tables from public, anon, authenticated;

-- profile_frames:
-- Active catalog is readable; browser roles cannot grant, purchase, or mutate frames.
drop policy if exists profile_frames_select_active on public.profile_frames;
create policy profile_frames_select_active on public.profile_frames
for select
to public
using (is_active is true);

-- profile_frame_ownerships:
-- Users can read only their own owned frames. Ownership grants are operator/server-side only.
drop policy if exists profile_frame_ownerships_select_own on public.profile_frame_ownerships;
create policy profile_frame_ownerships_select_own on public.profile_frame_ownerships
for select
to authenticated
using (profile_id = (select auth.uid()));

insert into public.profile_frames (
  frame_key,
  name,
  description,
  asset_path,
  acquisition_type,
  rarity,
  frame_scale,
  frame_offset_x,
  frame_offset_y,
  is_active
)
values (
  'chia_guide',
  '星空ちあ｜街の案内人',
  '星空ちあ専用のプロフィールアイコンフレーム',
  '/profile-frames/chia-guide.png',
  'admin_grant',
  'special',
  1.22,
  0,
  0,
  true
)
on conflict (frame_key) do update
set
  name = excluded.name,
  description = excluded.description,
  asset_path = excluded.asset_path,
  acquisition_type = excluded.acquisition_type,
  rarity = excluded.rarity,
  frame_scale = excluded.frame_scale,
  frame_offset_x = excluded.frame_offset_x,
  frame_offset_y = excluded.frame_offset_y,
  is_active = excluded.is_active,
  updated_at = now();

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

-- legal_consents:
-- Users can read and insert only their own legal consent records.
drop policy if exists legal_consents_select_own on public.legal_consents;
create policy legal_consents_select_own on public.legal_consents
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.record_legal_consent(
  p_terms_version text,
  p_privacy_version text,
  p_age_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_user_id is null then
    return jsonb_build_object('outcome', 'not_authenticated');
  end if;

  if p_terms_version is distinct from '2026-07-10'
    or p_privacy_version is distinct from '2026-07-10'
    or p_age_confirmed is distinct from true
  then
    return jsonb_build_object('outcome', 'invalid_consent');
  end if;

  insert into public.legal_consents (
    user_id,
    terms_version,
    privacy_version,
    accepted_at,
    age_confirmed_at
  )
  values (
    v_user_id,
    '2026-07-10',
    '2026-07-10',
    v_now,
    v_now
  )
  on conflict (user_id, terms_version, privacy_version) do nothing;

  return jsonb_build_object('outcome', 'recorded');
end;
$$;

revoke all on function public.record_legal_consent(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_legal_consent(text, text, boolean) to authenticated;

create or replace function app_private.record_legal_consent_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terms_version text := new.raw_user_meta_data ->> 'legal_terms_version';
  v_privacy_version text := new.raw_user_meta_data ->> 'legal_privacy_version';
  v_age_confirmed boolean := lower(coalesce(new.raw_user_meta_data ->> 'legal_age_confirmed', 'false')) = 'true';
  v_now timestamptz := now();
begin
  if v_terms_version is distinct from '2026-07-10'
    or v_privacy_version is distinct from '2026-07-10'
    or v_age_confirmed is distinct from true
  then
    raise exception 'LEGAL_CONSENT_REQUIRED'
      using errcode = '23514';
  end if;

  insert into public.legal_consents (
    user_id,
    terms_version,
    privacy_version,
    accepted_at,
    age_confirmed_at
  )
  values (
    new.id,
    '2026-07-10',
    '2026-07-10',
    v_now,
    v_now
  )
  on conflict (user_id, terms_version, privacy_version) do nothing;

  return new;
end;
$$;

revoke all on function app_private.record_legal_consent_from_auth_user() from public, anon, authenticated;

drop trigger if exists auth_users_record_legal_consent on auth.users;
create trigger auth_users_record_legal_consent
after insert on auth.users
for each row execute function app_private.record_legal_consent_from_auth_user();

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

-- ai_observation_jobs:
-- Internal AI observation job queue. Browser roles cannot directly read or mutate it.
revoke all on table public.ai_observation_jobs from public, anon, authenticated;
grant select, insert, update on table public.ai_observation_jobs to service_role;

revoke all on function public.reserve_ai_observation_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  numeric,
  bigint,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  integer
) from public, anon, authenticated;

revoke all on function public.reserve_ai_observation_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  bigint,
  numeric,
  bigint,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  integer
) from public, anon, authenticated;

grant execute on function public.reserve_ai_observation_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  numeric,
  bigint,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  integer
) to service_role;

grant execute on function public.reserve_ai_observation_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  bigint,
  numeric,
  bigint,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  integer
) to service_role;

create or replace function public.claim_ai_observation_job(p_job_id uuid)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  post_id uuid,
  request_fingerprint text,
  attempt_count integer,
  max_attempts integer,
  input_kind text,
  model text,
  observation_context text,
  not_before_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status = 'queued' and v_job.not_before_at > now() then
    outcome := 'not_ready';
  elsif v_job.status = 'queued' then
    update public.ai_observation_jobs j
      set status = 'processing',
          started_at = coalesce(j.started_at, now()),
          public_error_code = null
    where j.id = p_job_id
    returning * into v_job;
    outcome := 'claimed';
  else
    outcome := 'already_' || v_job.status::text;
  end if;

  job_id := v_job.id;
  job_status := v_job.status::text;
  post_id := v_job.post_id;
  request_fingerprint := v_job.request_fingerprint;
  attempt_count := v_job.attempt_count;
  max_attempts := v_job.max_attempts;
  input_kind := v_job.input_kind;
  model := v_job.model;
  observation_context := v_job.observation_context;
  not_before_at := v_job.not_before_at;
  return next;
end;
$$;

create or replace function public.start_ai_observation_attempt(p_job_id uuid)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status <> 'processing' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    attempt_count := v_job.attempt_count;
    max_attempts := v_job.max_attempts;
    return next;
    return;
  end if;

  if v_job.attempt_count >= v_job.max_attempts then
    outcome := 'max_attempts_exceeded';
    job_id := v_job.id;
    job_status := v_job.status::text;
    attempt_count := v_job.attempt_count;
    max_attempts := v_job.max_attempts;
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set attempt_count = j.attempt_count + 1
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'attempt_started';
  job_id := v_job.id;
  job_status := v_job.status::text;
  attempt_count := v_job.attempt_count;
  max_attempts := v_job.max_attempts;
  return next;
end;
$$;

drop function if exists public.complete_ai_observation_job(
  uuid, uuid, jsonb, text, boolean, text, integer, integer, integer, bigint
);

create or replace function public.complete_ai_observation_job(
  p_job_id uuid,
  p_chia_profile_id uuid,
  p_expected_request_fingerprint text,
  p_observed_points jsonb,
  p_analysis_summary text,
  p_should_post boolean,
  p_star_letter_body text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_actual_cost_micro_usd bigint,
  p_auto_star_letter_daily_limit integer,
  p_auto_star_letter_author_cooldown_seconds integer
)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  observation_id uuid,
  star_letter_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
  v_current_request_fingerprint text;
  v_observation_id uuid;
  v_star_letter_id uuid;
  v_post_author_id uuid;
  v_should_post boolean;
  v_star_letter_body text;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_daily_star_letters bigint;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status = 'succeeded' then
    outcome := 'already_succeeded';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  if v_job.status <> 'processing' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_chia_profile_id
      and p.username = 'chia_hoshizora'
  ) then
    outcome := 'chia_profile_mismatch';
    return next;
    return;
  end if;

  if p_observed_points is null
    or jsonb_typeof(p_observed_points) <> 'array'
    or p_expected_request_fingerprint is null
    or p_expected_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_input_tokens is null
    or p_output_tokens is null
    or p_total_tokens is null
    or p_actual_cost_micro_usd is null
    or p_should_post is null
    or p_auto_star_letter_daily_limit is null
    or p_auto_star_letter_daily_limit < 0
    or p_auto_star_letter_author_cooldown_seconds is null
    or p_auto_star_letter_author_cooldown_seconds < 0
    or p_input_tokens < 0
    or p_output_tokens < 0
    or p_total_tokens < p_input_tokens + p_output_tokens
    or p_actual_cost_micro_usd < 0
    or (p_should_post and (
      p_star_letter_body is null
      or p_star_letter_body <> btrim(p_star_letter_body)
      or char_length(p_star_letter_body) < 20
      or char_length(p_star_letter_body) > 80
      or p_star_letter_body ~ '[\r\n#]'
      or p_star_letter_body ~ 'https?://'
    ))
    or ((not p_should_post) and p_star_letter_body is not null)
  then
    outcome := 'invalid_payload';
    return next;
    return;
  end if;

  v_current_request_fingerprint := app_private.ai_observation_current_request_fingerprint(v_job.post_id);

  if v_current_request_fingerprint is null
    or v_current_request_fingerprint <> v_job.request_fingerprint
    or v_current_request_fingerprint <> p_expected_request_fingerprint
  then
    outcome := 'post_changed';
    job_id := v_job.id;
    job_status := v_job.status::text;
    observation_id := v_job.observation_id;
    star_letter_id := v_job.star_letter_id;
    return next;
    return;
  end if;

  select p.author_id
    into v_post_author_id
  from public.posts p
  where p.id = v_job.post_id;

  v_should_post := p_should_post;
  v_star_letter_body := p_star_letter_body;

  if v_job.observation_context = 'auto_text_post' and v_should_post then
    perform pg_advisory_xact_lock(hashtext('ai_observation_star_letters:hoshizora_chia')::bigint);

    select count(*)
      into v_daily_star_letters
    from public.star_letters sl
    where sl.author_id = p_chia_profile_id
      and sl.created_at >= v_day_start;

    if v_daily_star_letters >= p_auto_star_letter_daily_limit
      or (
        p_auto_star_letter_author_cooldown_seconds > 0
        and exists (
          select 1
          from public.star_letters sl
          join public.posts p on p.id = sl.post_id
          where sl.author_id = p_chia_profile_id
            and p.author_id = v_post_author_id
            and sl.created_at > now() - make_interval(secs => p_auto_star_letter_author_cooldown_seconds)
        )
      )
    then
      v_should_post := false;
      v_star_letter_body := null;
    end if;
  end if;

  insert into public.observations (
    post_id,
    observer_id,
    observer_type,
    ai_resident_key,
    observation_type,
    analysis_summary,
    observed_points,
    should_comment,
    comment,
    should_recommend,
    recommendation_message,
    x_post_draft
  )
  values (
    v_job.post_id,
    p_chia_profile_id,
    'ai_resident',
    'hoshizora_chia',
    'ai_observation',
    nullif(left(coalesce(p_analysis_summary, ''), 1200), ''),
    p_observed_points,
    v_should_post,
    v_star_letter_body,
    false,
    null,
    null
  )
  returning id into v_observation_id;

  if v_job.observation_context = 'auto_text_post' then
    insert into public.resonances (
      post_id,
      profile_id,
      resonance_type
    )
    values (
      v_job.post_id,
      p_chia_profile_id,
      'silent'
    );
  end if;

  if v_should_post then
    insert into public.star_letters (
      post_id,
      author_id,
      body
    )
    values (
      v_job.post_id,
      p_chia_profile_id,
      v_star_letter_body
    )
    returning id into v_star_letter_id;
  end if;

  update public.ai_observation_jobs j
    set status = 'succeeded',
        observation_id = v_observation_id,
        star_letter_id = v_star_letter_id,
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        total_tokens = p_total_tokens,
        actual_cost_micro_usd = p_actual_cost_micro_usd,
        public_error_code = null,
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'completed';
  job_id := v_job.id;
  job_status := v_job.status::text;
  observation_id := v_observation_id;
  star_letter_id := v_star_letter_id;
  return next;
end;
$$;

create or replace function public.complete_ai_observation_job(
  p_job_id uuid,
  p_chia_profile_id uuid,
  p_expected_request_fingerprint text,
  p_observed_points jsonb,
  p_analysis_summary text,
  p_should_post boolean,
  p_star_letter_body text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_actual_cost_micro_usd bigint
)
returns table (
  outcome text,
  job_id uuid,
  job_status text,
  observation_id uuid,
  star_letter_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.complete_ai_observation_job(
    p_job_id,
    p_chia_profile_id,
    p_expected_request_fingerprint,
    p_observed_points,
    p_analysis_summary,
    p_should_post,
    p_star_letter_body,
    p_input_tokens,
    p_output_tokens,
    p_total_tokens,
    p_actual_cost_micro_usd,
    20,
    86400
  );
$$;

create or replace function public.fail_ai_observation_job(
  p_job_id uuid,
  p_public_error_code text,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_total_tokens integer default null,
  p_actual_cost_micro_usd bigint default null
)
returns table (
  outcome text,
  job_id uuid,
  job_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status in ('succeeded', 'failed', 'cancelled') then
    outcome := 'already_' || v_job.status::text;
    job_id := v_job.id;
    job_status := v_job.status::text;
    return next;
    return;
  end if;

  if p_public_error_code is null
    or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$'
    or (p_input_tokens is not null and p_input_tokens < 0)
    or (p_output_tokens is not null and p_output_tokens < 0)
    or (p_total_tokens is not null and p_total_tokens < 0)
    or (p_actual_cost_micro_usd is not null and p_actual_cost_micro_usd < 0)
  then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set status = 'failed',
        public_error_code = p_public_error_code,
        input_tokens = coalesce(p_input_tokens, j.input_tokens),
        output_tokens = coalesce(p_output_tokens, j.output_tokens),
        total_tokens = coalesce(p_total_tokens, j.total_tokens),
        actual_cost_micro_usd = coalesce(p_actual_cost_micro_usd, j.actual_cost_micro_usd),
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'failed';
  job_id := v_job.id;
  job_status := v_job.status::text;
  return next;
end;
$$;

create or replace function public.cancel_ai_observation_job(
  p_job_id uuid,
  p_public_error_code text default 'WORKER_DISPATCH_FAILED'
)
returns table (
  outcome text,
  job_id uuid,
  job_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_observation_jobs%rowtype;
begin
  select *
    into v_job
  from public.ai_observation_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_job.status <> 'queued' then
    outcome := 'invalid_status';
    job_id := v_job.id;
    job_status := v_job.status::text;
    return next;
    return;
  end if;

  if p_public_error_code is null or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$' then
    outcome := 'invalid_request';
    return next;
    return;
  end if;

  update public.ai_observation_jobs j
    set status = 'cancelled',
        public_error_code = p_public_error_code,
        completed_at = now()
  where j.id = p_job_id
  returning * into v_job;

  outcome := 'cancelled';
  job_id := v_job.id;
  job_status := v_job.status::text;
  return next;
end;
$$;

create or replace function public.recover_stale_ai_observation_jobs(
  p_stale_before timestamptz,
  p_public_error_code text default 'WORKER_STALE',
  p_limit integer default 20
)
returns table (
  recovered_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered_count integer := 0;
begin
  if p_stale_before is null
    or p_stale_before > now()
    or p_public_error_code is null
    or p_public_error_code !~ '^[A-Z0-9_:-]{1,80}$'
    or p_limit is null
    or p_limit < 1
    or p_limit > 100
  then
    recovered_count := 0;
    return next;
    return;
  end if;

  with stale_jobs as (
    select j.id
    from public.ai_observation_jobs j
    where j.status = 'processing'
      and j.completed_at is null
      and coalesce(j.started_at, j.updated_at, j.created_at) < p_stale_before
    order by coalesce(j.started_at, j.updated_at, j.created_at), j.id
    limit p_limit
    for update skip locked
  ),
  updated_jobs as (
    update public.ai_observation_jobs j
      set status = 'cancelled',
          public_error_code = p_public_error_code,
          completed_at = now()
    from stale_jobs s
    where j.id = s.id
    returning j.id
  )
  select count(*)::integer
    into v_recovered_count
  from updated_jobs;

  recovered_count := v_recovered_count;
  return next;
end;
$$;

comment on function public.recover_stale_ai_observation_jobs(timestamptz, text, integer)
is 'Service-role-only recovery for AI observation jobs left in processing after worker timeout. Marks stale processing rows as cancelled with a safe public error code; does not retry provider calls.';

revoke all on function public.claim_ai_observation_job(uuid) from public, anon, authenticated;
revoke all on function public.start_ai_observation_attempt(uuid) from public, anon, authenticated;
revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) from public, anon, authenticated;
revoke all on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer
) from public, anon, authenticated;
revoke all on function public.fail_ai_observation_job(
  uuid, text, integer, integer, integer, bigint
) from public, anon, authenticated;
revoke all on function public.cancel_ai_observation_job(uuid, text) from public, anon, authenticated;
revoke all on function public.recover_stale_ai_observation_jobs(timestamptz, text, integer) from public, anon, authenticated;

grant execute on function public.claim_ai_observation_job(uuid) to service_role;
grant execute on function public.start_ai_observation_attempt(uuid) to service_role;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint
) to service_role;
grant execute on function public.complete_ai_observation_job(
  uuid, uuid, text, jsonb, text, boolean, text, integer, integer, integer, bigint, integer, integer
) to service_role;
grant execute on function public.fail_ai_observation_job(
  uuid, text, integer, integer, integer, bigint
) to service_role;
grant execute on function public.cancel_ai_observation_job(uuid, text) to service_role;
grant execute on function public.recover_stale_ai_observation_jobs(timestamptz, text, integer) to service_role;

-- Editable "はじめての入村案内"
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is
'星空Villageの管理操作を許可されたAuthユーザー。ブラウザから一覧は公開しない。';

create table if not exists public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  title text not null,
  parent_id uuid references public.guide_sections(id) on delete cascade,
  display_variant text not null default 'standard',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guide_sections_key_check check (section_key ~ '^[a-z0-9][a-z0-9_]{2,63}$'),
  constraint guide_sections_title_check check (
    title = btrim(title)
    and title <> ''
    and char_length(title) <= 120
  ),
  constraint guide_sections_parent_check check (parent_id is null or parent_id <> id),
  constraint guide_sections_variant_check check (display_variant in ('standard', 'subsection', 'notice')),
  constraint guide_sections_sort_order_check check (sort_order between 0 and 1000000)
);

comment on table public.guide_sections is
'はじめての入村案内のセクションと子カテゴリー。section_keyは外部運用でも使う安定キー。';
comment on column public.guide_sections.section_key is
'人間と外部運用が1行を特定する安定キー。作成後は変更しない。';
comment on column public.guide_sections.parent_id is
'nullなら最上位セクション。値があれば子カテゴリー。';
comment on column public.guide_sections.display_variant is
'standardは通常カード、subsectionは子カテゴリー、noticeは注意書き表示。';

create table if not exists public.guide_entries (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.guide_sections(id) on delete cascade,
  entry_key text not null unique,
  entry_type text not null,
  body text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint guide_entries_key_check check (entry_key ~ '^[a-z0-9][a-z0-9_]{2,95}$'),
  constraint guide_entries_type_check check (entry_type in ('paragraph', 'list_item')),
  constraint guide_entries_body_check check (
    body = btrim(body)
    and body <> ''
    and char_length(body) <= 2000
  ),
  constraint guide_entries_sort_order_check check (sort_order between 0 and 1000000)
);

comment on table public.guide_entries is
'はじめての入村案内を1項目ずつ管理する文章行。entry_keyで単発更新できる。';
comment on column public.guide_entries.entry_key is
'人間と外部運用が1行を特定する安定キー。作成後は変更しない。';
comment on column public.guide_entries.updated_by is
'更新したAuthユーザーを記録する非公開監査列。service_role更新ではnullになり得る。';

create index if not exists guide_sections_parent_sort_idx
on public.guide_sections(parent_id, sort_order, section_key);

create index if not exists guide_sections_visible_sort_idx
on public.guide_sections(is_visible, sort_order, section_key);

create index if not exists guide_entries_section_sort_idx
on public.guide_entries(section_id, sort_order, entry_key);

create index if not exists guide_entries_visible_sort_idx
on public.guide_entries(is_visible, section_id, sort_order);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.app_admins admin_user
      where admin_user.user_id = (select auth.uid())
    );
$$;

comment on function public.is_app_admin() is
'現在の認証ユーザーがapp_adminsに登録されているかだけを返す。管理者一覧は公開しない。';

revoke all on function public.is_app_admin() from public, anon, authenticated;
grant execute on function public.is_app_admin() to authenticated, service_role;

create or replace function app_private.guide_section_is_public(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive section_ancestry as (
    select
      section_row.id,
      section_row.parent_id,
      section_row.is_visible,
      array[section_row.id]::uuid[] as visited_ids,
      false as has_cycle,
      1 as depth
    from public.guide_sections section_row
    where section_row.id = p_section_id

    union all

    select
      parent_section.id,
      parent_section.parent_id,
      parent_section.is_visible,
      section_ancestry.visited_ids || parent_section.id,
      parent_section.id = any(section_ancestry.visited_ids),
      section_ancestry.depth + 1
    from section_ancestry
    join public.guide_sections parent_section
      on parent_section.id = section_ancestry.parent_id
    where section_ancestry.has_cycle is false
      and section_ancestry.depth < 64
  )
  select coalesce(
    bool_and(section_ancestry.is_visible)
      and not bool_or(section_ancestry.has_cycle)
      and bool_or(section_ancestry.parent_id is null),
    false
  )
  from section_ancestry;
$$;

comment on function app_private.guide_section_is_public(uuid) is
'RLS専用。対象セクションからルートまで全祖先が表示中で、循環せずルートへ到達した場合だけtrueを返す。';

revoke all on function app_private.guide_section_is_public(uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.guide_section_is_public(uuid) to anon, authenticated;

create or replace function app_private.set_guide_section_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.section_key is distinct from old.section_key then
    raise exception 'guide section key cannot be changed'
      using errcode = '23514';
  end if;

  new.title := btrim(new.title);
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

create or replace function app_private.set_guide_entry_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.entry_key is distinct from old.entry_key then
    raise exception 'guide entry key cannot be changed'
      using errcode = '23514';
  end if;

  new.body := btrim(new.body);
  new.updated_at := now();
  new.updated_by := (select auth.uid());

  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

revoke all on function app_private.set_guide_section_audit_fields() from public, anon, authenticated;
revoke all on function app_private.set_guide_entry_audit_fields() from public, anon, authenticated;

drop trigger if exists guide_sections_set_audit_fields on public.guide_sections;
create trigger guide_sections_set_audit_fields
before insert or update on public.guide_sections
for each row execute function app_private.set_guide_section_audit_fields();

drop trigger if exists guide_entries_set_audit_fields on public.guide_entries;
create trigger guide_entries_set_audit_fields
before insert or update on public.guide_entries
for each row execute function app_private.set_guide_entry_audit_fields();

alter table public.app_admins enable row level security;
alter table public.guide_sections enable row level security;
alter table public.guide_entries enable row level security;

revoke all on table public.app_admins from public, anon, authenticated;
revoke all on table public.guide_sections from public, anon, authenticated;
revoke all on table public.guide_entries from public, anon, authenticated;

grant select, insert, delete on table public.app_admins to service_role;
grant select on table public.guide_sections to anon, authenticated;
grant select (
  id,
  section_id,
  entry_key,
  entry_type,
  body,
  sort_order,
  is_visible,
  created_at,
  updated_at
) on table public.guide_entries to anon, authenticated;
grant insert, update, delete on table public.guide_sections to authenticated;
grant insert, update, delete on table public.guide_entries to authenticated;
grant select, insert, update, delete on table public.guide_sections to service_role;
grant select, insert, update, delete on table public.guide_entries to service_role;

drop policy if exists guide_sections_select_visible on public.guide_sections;
create policy guide_sections_select_visible on public.guide_sections
for select
to anon, authenticated
using (app_private.guide_section_is_public(id));

drop policy if exists guide_sections_admin_select_all on public.guide_sections;
create policy guide_sections_admin_select_all on public.guide_sections
for select
to authenticated
using ((select public.is_app_admin()));

drop policy if exists guide_sections_admin_insert on public.guide_sections;
create policy guide_sections_admin_insert on public.guide_sections
for insert
to authenticated
with check ((select public.is_app_admin()));

drop policy if exists guide_sections_admin_update on public.guide_sections;
create policy guide_sections_admin_update on public.guide_sections
for update
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists guide_sections_admin_delete on public.guide_sections;
create policy guide_sections_admin_delete on public.guide_sections
for delete
to authenticated
using ((select public.is_app_admin()));

drop policy if exists guide_entries_select_visible on public.guide_entries;
create policy guide_entries_select_visible on public.guide_entries
for select
to anon, authenticated
using (
  is_visible is true
  and app_private.guide_section_is_public(section_id)
);

drop policy if exists guide_entries_admin_select_all on public.guide_entries;
create policy guide_entries_admin_select_all on public.guide_entries
for select
to authenticated
using ((select public.is_app_admin()));

drop policy if exists guide_entries_admin_insert on public.guide_entries;
create policy guide_entries_admin_insert on public.guide_entries
for insert
to authenticated
with check ((select public.is_app_admin()));

drop policy if exists guide_entries_admin_update on public.guide_entries;
create policy guide_entries_admin_update on public.guide_entries
for update
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists guide_entries_admin_delete on public.guide_entries;
create policy guide_entries_admin_delete on public.guide_entries
for delete
to authenticated
using ((select public.is_app_admin()));

insert into public.guide_sections (
  section_key,
  title,
  parent_id,
  display_variant,
  sort_order,
  is_visible
)
values
  ('about_village', '星空Villageとは', null, 'standard', 10, true),
  ('first_steps', 'まずやってみること', null, 'standard', 20, true),
  ('available_now', '今できること', null, 'standard', 30, true),
  ('planned_features', 'これから増える予定', null, 'standard', 40, true),
  ('beta_testing', 'ベータテストで試してほしいこと', null, 'standard', 50, true),
  ('feedback_help', '不具合・要望の送り方', null, 'standard', 60, true),
  ('beta_notice', '先行テスト版について', null, 'notice', 70, true)
on conflict (section_key) do nothing;

insert into public.guide_sections (
  section_key,
  title,
  parent_id,
  display_variant,
  sort_order,
  is_visible
)
select
  seed.section_key,
  seed.title,
  parent.id,
  'subsection',
  seed.sort_order,
  true
from (
  values
    ('available_account_profile', 'アカウントとプロフィール', 10),
    ('available_meteor_posting', '流星便を届ける', 20),
    ('available_observation_connection', '観測してつながる', 30),
    ('available_chia_ai_resident', '星空ちあAI住人', 40),
    ('available_mobile_support', 'スマホ利用とサポート', 50)
) as seed(section_key, title, sort_order)
join public.guide_sections parent on parent.section_key = 'available_now'
on conflict (section_key) do nothing;

insert into public.guide_entries (
  entry_key,
  section_id,
  entry_type,
  body,
  sort_order,
  is_visible
)
select
  seed.entry_key,
  section_row.id,
  seed.entry_type,
  seed.body,
  seed.sort_order,
  true
from (
  values
    ('about_village_intro', 'about_village', 'paragraph', '星空Villageは、AI時代にもう一度SNSをやさしく作り直す、AIと人間が一緒に暮らす小さな星空の街です。', 10),
    ('about_village_terms', 'about_village', 'paragraph', 'ここでは、投稿は「流星便」、いいねは「共鳴」、コメントは「星文」、保存は「Archive」と呼びます。', 20),
    ('about_village_resonance', 'about_village', 'paragraph', 'バズより共鳴。誰にも見つからないまま流れていく想いや作品を、村人やAI住人が観測し、残し、言葉を届けます。', 30),
    ('about_village_chia', 'about_village', 'paragraph', '案内人の星空ちあは、公開されたテキスト流星便を少し時間を空けて観測し、共鳴や、ときどき星文を届けます。', 40),
    ('first_steps_profile', 'first_steps', 'list_item', 'My Const.で、名前・自己紹介・プロフィール画像を設定する', 10),
    ('first_steps_post', 'first_steps', 'list_item', '中央の＋から、最初の流星便を放流する', 20),
    ('first_steps_observe', 'first_steps', 'list_item', '観測で誰かの流星便を見つけ、共鳴・星文・Archiveを使う', 30),
    ('first_steps_rconnect', 'first_steps', 'list_item', 'R.Connectで届いた反応を確認し、必要ならPush通知を登録する', 40),
    ('account_auth', 'available_account_profile', 'list_item', '会員登録 / ログイン / ログアウト', 10),
    ('account_legal', 'available_account_profile', 'list_item', '利用規約・プライバシーポリシーの確認と同意', 20),
    ('account_profile_edit', 'available_account_profile', 'list_item', 'プロフィール作成 / 編集', 30),
    ('account_avatar', 'available_account_profile', 'list_item', 'プロフィール画像のアップロード / 切り抜き', 40),
    ('account_frame', 'available_account_profile', 'list_item', 'プロフィールの星枠選択', 50),
    ('account_public_profile', 'available_account_profile', 'list_item', '公開プロフィール表示 / URL共有', 60),
    ('account_author_link', 'available_account_profile', 'list_item', '流星便から投稿者プロフィールへ移動', 70),
    ('meteor_text', 'available_meteor_posting', 'list_item', 'テキスト流星便の投稿', 10),
    ('meteor_images', 'available_meteor_posting', 'list_item', '星影（画像・最大4枚）の投稿 / 拡大表示', 20),
    ('meteor_video', 'available_meteor_posting', 'list_item', '星映（動画・35秒以内）の切り抜き / 表紙設定 / 再生', 30),
    ('meteor_youtube', 'available_meteor_posting', 'list_item', 'YouTube URLの埋め込み再生', 40),
    ('meteor_suno', 'available_meteor_posting', 'list_item', 'Suno楽曲リンクカード表示', 50),
    ('meteor_tags', 'available_meteor_posting', 'list_item', '流星タグ（最大3個）の追加 / タグ別一覧', 60),
    ('meteor_edit_delete', 'available_meteor_posting', 'list_item', '流星便の編集 / 削除', 70),
    ('meteor_detail_share', 'available_meteor_posting', 'list_item', '流星便の詳細ページ表示 / URL共有', 80),
    ('connect_resonance', 'available_observation_connection', 'list_item', '共鳴', 10),
    ('connect_star_letter', 'available_observation_connection', 'list_item', '星文の投稿 / 編集 / 削除', 20),
    ('connect_archive', 'available_observation_connection', 'list_item', 'Archive保存 / 解除 / 一覧表示', 30),
    ('connect_notifications', 'available_observation_connection', 'list_item', 'R.Connect通知（共鳴・Archive・星文・観測）', 40),
    ('connect_read_state', 'available_observation_connection', 'list_item', 'R.Connectの未読 / 既読管理', 50),
    ('connect_notification_links', 'available_observation_connection', 'list_item', '通知から流星便やプロフィールへ移動', 60),
    ('connect_notification_settings', 'available_observation_connection', 'list_item', '共鳴 / Archive通知のON・OFF設定', 70),
    ('connect_push', 'available_observation_connection', 'list_item', 'iPhone / AndroidへのPush通知', 80),
    ('connect_push_device', 'available_observation_connection', 'list_item', '通知端末の登録 / 再登録 / テスト通知', 90),
    ('chia_auto_observation', 'available_chia_ai_resident', 'list_item', '公開テキスト流星便を、少し時間を空けて自動観測', 10),
    ('chia_resonance', 'available_chia_ai_resident', 'list_item', '観測した流星便への、ちあからの共鳴', 20),
    ('chia_star_letter', 'available_chia_ai_resident', 'list_item', 'ちあから、ときどき届く星文', 30),
    ('chia_notifications', 'available_chia_ai_resident', 'list_item', 'R.Connect / Pushで観測結果を通知', 40),
    ('mobile_pwa', 'available_mobile_support', 'list_item', 'ホーム画面へ追加してPWAとして利用', 10),
    ('mobile_updates', 'available_mobile_support', 'list_item', '新しい本番更新の検知 / 再読み込み案内', 20),
    ('mobile_feedback', 'available_mobile_support', 'list_item', '星の目安箱からフィードバック送信', 30),
    ('mobile_legal', 'available_mobile_support', 'list_item', '利用規約 / プライバシーポリシーの閲覧', 40),
    ('mobile_contact', 'available_mobile_support', 'list_item', '公式X / メールへのお問い合わせ', 50),
    ('planned_ai_residents', 'planned_features', 'list_item', '星空ちあ以外の、新しいAI住人たちの登場', 10),
    ('planned_audio', 'planned_features', 'list_item', '音声の流星便投稿', 20),
    ('planned_repost', 'planned_features', 'list_item', 'リポスト / 再放流', 30),
    ('planned_game', 'planned_features', 'list_item', '星空広場 / ゲーム広場', 40),
    ('planned_fortune', 'planned_features', 'list_item', '占い舘', 50),
    ('planned_native_apps', 'planned_features', 'list_item', 'App Store / Google Playで配布するネイティブアプリ', 60),
    ('beta_auth_profile', 'beta_testing', 'list_item', '登録・ログイン・プロフィール設定で迷わないか', 10),
    ('beta_posting', 'beta_testing', 'list_item', 'テキスト・星影・星映・YouTubeの流星便を投稿しやすいか', 20),
    ('beta_navigation', 'beta_testing', 'list_item', '流星タグや共有URLから目的の流星便へ移動できるか', 30),
    ('beta_actions', 'beta_testing', 'list_item', '共鳴 / Archive / 星文の違いが伝わるか', 40),
    ('beta_notifications', 'beta_testing', 'list_item', 'R.ConnectとPush通知が分かりやすいか', 50),
    ('beta_chia', 'beta_testing', 'list_item', '星空ちあの観測や星文が自然に届くか', 60),
    ('beta_mobile', 'beta_testing', 'list_item', 'スマホで重い・押しにくい・読みにくい場所がないか', 70),
    ('beta_requests', 'beta_testing', 'list_item', 'ほしい機能や不安な点がないか', 80),
    ('feedback_send', 'feedback_help', 'paragraph', '気づいたこと、不具合、ほしい機能、分かりにくかった場所があれば、設定画面の「星の目安箱」から送ってください。', 10),
    ('feedback_value', 'feedback_help', 'paragraph', 'あなたの声は、星空Villageを育てるための大切な星文です。', 20),
    ('beta_notice_unstable', 'beta_notice', 'paragraph', '現在の星空Villageは開発中の先行テスト版です。予告なく仕様が変わったり、一部機能が不安定な場合があります。', 10),
    ('beta_notice_backup', 'beta_notice', 'paragraph', '大切な文章や作品は、念のため自分の手元にも保存しておいてください。', 20)
) as seed(entry_key, section_key, entry_type, body, sort_order)
join public.guide_sections section_row on section_row.section_key = seed.section_key
on conflict (entry_key) do nothing;

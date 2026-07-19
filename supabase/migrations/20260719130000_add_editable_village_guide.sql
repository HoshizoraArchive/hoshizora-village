-- Make the "はじめての入村案内" content editable without a frontend deploy.
-- Production Supabase must apply this migration only after review.

begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

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

commit;

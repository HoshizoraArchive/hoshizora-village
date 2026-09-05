-- Bound the public profile text surface at the database boundary. Username is
-- already limited to 3-32 ASCII word characters by profiles_username_check.
-- These limits leave substantial room above current beta data while preventing
-- unbounded public text/URL payloads through direct API writes.

begin;

alter table public.profiles
  add constraint profiles_display_name_length_check
    check (char_length(display_name) <= 50),
  add constraint profiles_bio_length_check
    check (bio is null or char_length(bio) <= 500),
  add constraint profiles_constellation_note_length_check
    check (constellation_note is null or char_length(constellation_note) <= 500),
  add constraint profiles_avatar_url_length_check
    check (avatar_url is null or char_length(avatar_url) <= 2048);

comment on constraint profiles_display_name_length_check on public.profiles is
  '公開表示名を50文字以下に制限する。';
comment on constraint profiles_bio_length_check on public.profiles is
  '公開自己紹介を500文字以下に制限する。';
comment on constraint profiles_constellation_note_length_check on public.profiles is
  '公開「わたしの星座」説明を500文字以下に制限する。';
comment on constraint profiles_avatar_url_length_check on public.profiles is
  '公開プロフィール画像URLを2048文字以下に制限する。';

commit;

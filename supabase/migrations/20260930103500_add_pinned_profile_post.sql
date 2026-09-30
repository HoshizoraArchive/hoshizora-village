alter table public.profiles
add column if not exists pinned_post_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_pinned_post_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_pinned_post_id_fkey
      foreign key (pinned_post_id)
      references public.posts(id)
      on delete set null;
  end if;
end;
$$;

comment on column public.profiles.pinned_post_id is
'My Universeの先頭へ固定表示する公開流星便。本人が所有する未削除の公開流星便だけを指定できる。';

create or replace function app_private.validate_profile_pinned_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pinned_post_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.posts post
    where post.id = new.pinned_post_id
      and post.author_id = new.id
      and post.deleted_at is null
      and post.visibility = 'public'
  ) then
    raise exception 'pinned post must be an owned visible public post'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_validate_pinned_post on public.profiles;
create trigger profiles_validate_pinned_post
before insert or update of pinned_post_id on public.profiles
for each row
execute function app_private.validate_profile_pinned_post();

create or replace function app_private.clear_invalid_profile_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null
    or new.visibility <> 'public'
    or new.author_id is distinct from old.author_id
  then
    update public.profiles profile
    set pinned_post_id = null
    where profile.pinned_post_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_clear_invalid_profile_pin on public.posts;
create trigger posts_clear_invalid_profile_pin
after update of deleted_at, visibility, author_id on public.posts
for each row
execute function app_private.clear_invalid_profile_pin();

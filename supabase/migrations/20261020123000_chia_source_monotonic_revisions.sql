-- Keep Chia reply source revision monotonic even when edits happen inside
-- the same PostgreSQL transaction (public.set_updated_at uses now(), which is
-- transaction-stable). This is a narrow safety supplement to the existing
-- row/source/post revision guards; do not change all other app tables.
begin;

create or replace function app_private.bump_chia_reply_source_revision()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  new.updated_at = greatest(
    coalesce(new.updated_at, '-infinity'::timestamptz),
    clock_timestamp(),
    coalesce(old.updated_at, '-infinity'::timestamptz) + interval '1 microsecond'
  );
  return new;
end;
$function$;

-- PostgreSQL runs BEFORE triggers in alphabetical order. These zzz_ triggers
-- run after posts_set_updated_at/star_letters_set_updated_at, preventing
-- transaction-stable now() from erasing the monotonic increment.
drop trigger if exists zzz_chia_post_content_revision on public.posts;
create trigger zzz_chia_post_content_revision
before update of body, visibility, deleted_at, author_id
on public.posts for each row
execute function app_private.bump_chia_reply_source_revision();

drop trigger if exists zzz_chia_letter_content_revision on public.star_letters;
create trigger zzz_chia_letter_content_revision
before update of body, deleted_at, author_id, post_id, parent_star_letter_id
on public.star_letters for each row
execute function app_private.bump_chia_reply_source_revision();

revoke all on function app_private.bump_chia_reply_source_revision() from public, anon, authenticated;
commit;

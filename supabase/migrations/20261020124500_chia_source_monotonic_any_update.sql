-- Close the transaction-stable timestamp ABA gap: public.set_updated_at()
-- rewrites NEW.updated_at to now() on *every* UPDATE. Therefore our
-- monotonic revision hook must also run on EVERY update, not UPDATE OF body.
-- No existing rows or authored content are modified by this migration.
begin;
drop trigger if exists zzz_chia_post_content_revision on public.posts;
create trigger zzz_chia_post_content_revision
before update on public.posts
for each row execute function app_private.bump_chia_reply_source_revision();

drop trigger if exists zzz_chia_letter_content_revision on public.star_letters;
create trigger zzz_chia_letter_content_revision
before update on public.star_letters
for each row execute function app_private.bump_chia_reply_source_revision();
commit;

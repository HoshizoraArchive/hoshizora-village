-- PREVIEW-V2 ONLY / DO NOT APPLY TO PRODUCTION.
-- Normalize the direct schema snapshot to the reviewed 20260702 security
-- hardening migration and the current Production catalog. No rows are changed.

begin;

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

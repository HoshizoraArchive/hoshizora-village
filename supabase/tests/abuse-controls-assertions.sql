-- LOCAL ONLY. Verifies the shared limiter contract and rolls synthetic state back.

begin;

do $$
declare
  v_policy text;
begin
  if pg_catalog.has_table_privilege('authenticated', 'public.posts', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.posts', 'UPDATE')
  then
    raise exception 'authenticated posts direct write grant remains';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.star_letters', 'INSERT')
    or pg_catalog.has_column_privilege('authenticated', 'public.star_letters', 'post_id', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.post_media', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.post_meteor_tags', 'INSERT')
  then
    raise exception 'an RPC-only direct INSERT bypass remains';
  end if;

  if not pg_catalog.has_table_privilege('authenticated', 'public.feedbacks', 'INSERT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.meteor_tags', 'INSERT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.app_open_events', 'INSERT')
  then
    raise exception 'an intentionally retained DB-gated insert grant is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'app_private.consume_abuse_quota(text,uuid,numeric,integer,numeric)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'app_private.consume_abuse_quota(text,uuid,numeric,integer,numeric)',
    'EXECUTE'
  ) then
    raise exception 'private quota primitive is directly executable';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'app_private.is_storage_upload_reserved(text,text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.reserve_storage_upload_v1(text,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.reserve_storage_upload_v1(text,text)',
    'EXECUTE'
  ) or pg_catalog.has_schema_privilege(
    'authenticated',
    'app_private',
    'USAGE'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'app_private.storage_upload_reservations',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'Storage reservation RPC/helper boundary is incorrect';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.reserve_push_subscription_test_v1(uuid)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.reserve_push_subscription_test_v1(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Push test reservation RPC grants are incorrect';
  end if;

  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'avatars_insert_own_folder',
        'meteor_media_insert_own_folder',
        'meteor_video_insert_own_folder'
      )
      and with_check like '%is_storage_upload_reserved%'
  loop
    null;
  end loop;

  if (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'avatars_insert_own_folder',
        'meteor_media_insert_own_folder',
        'meteor_video_insert_own_folder'
      )
      and with_check like '%is_storage_upload_reserved%'
  ) <> 3 then
    raise exception 'Storage upload policies are not quota-gated';
  end if;

  if (
    select count(*)
    from storage.buckets bucket
    where (bucket.id = 'avatars'
        and bucket.file_size_limit = 5242880
        and bucket.allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'])
       or (bucket.id = 'meteor-media'
        and bucket.file_size_limit = 8388608
        and bucket.allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'])
       or (bucket.id = 'meteor-video'
        and bucket.file_size_limit = 104857600
        and bucket.allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm'])
  ) <> 3 then
    raise exception 'Storage bucket size/MIME limits differ from the audited contract';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger trigger_row
    where not trigger_row.tgisinternal
      and trigger_row.tgname in (
        'posts_enforce_create_rate',
        'star_letters_enforce_create_rate',
        'star_letter_resonances_enforce_create_rate',
        'feedbacks_enforce_create_rate',
        'meteor_tags_enforce_create_rate',
        'app_open_events_enforce_create_rate',
        'content_reports_enforce_create_rate',
        'push_subscriptions_enforce_limit',
        'push_subscriptions_release_limit',
        'storage_objects_complete_upload_reservation'
      )
  ) <> 10 then
    raise exception 'one or more abuse-control triggers are missing';
  end if;
end;
$$;

-- Every limited path shares this exact atomic primitive. Prove below-limit,
-- rejection at capacity, and full refill after the configured window.
do $$
declare
  v_actor_id uuid := '50000000-0000-4000-8000-000000000001';
begin
  if not app_private.consume_abuse_quota('assertion_window', v_actor_id, 2, 3600)
    or not app_private.consume_abuse_quota('assertion_window', v_actor_id, 2, 3600)
  then
    raise exception 'below-limit quota consumption failed';
  end if;

  if app_private.consume_abuse_quota('assertion_window', v_actor_id, 2, 3600) then
    raise exception 'quota did not reject at capacity';
  end if;

  update app_private.abuse_rate_limits
  set refilled_at = refilled_at - interval '1 hour'
  where scope = 'assertion_window' and actor_id = v_actor_id;

  if not app_private.consume_abuse_quota('assertion_window', v_actor_id, 2, 3600) then
    raise exception 'quota did not refill after its full window';
  end if;
end;
$$;

rollback;

begin;

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
  select * into v_post
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found or v_post.visibility <> 'public' or v_post.deleted_at is not null then
    return null;
  end if;

  for v_media in
    select * from public.post_media pm
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

commit;
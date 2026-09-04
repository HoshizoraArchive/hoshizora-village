#!/usr/bin/env bash

set -euo pipefail

db_container="${1:?database container name is required}"
result_dir="$(mktemp -d)"
user_id=""

status_env="$(supabase status -o env)"
api_url="$(printf '%s\n' "$status_env" | sed -n 's/^API_URL="\([^"]*\)"$/\1/p')"
anon_key="$(printf '%s\n' "$status_env" | sed -n 's/^ANON_KEY="\([^"]*\)"$/\1/p')"
service_role_key="$(printf '%s\n' "$status_env" | sed -n 's/^SERVICE_ROLE_KEY="\([^"]*\)"$/\1/p')"

if [[ -z "$api_url" || -z "$anon_key" || -z "$service_role_key" ]]; then
  printf 'local Supabase API credentials were not available\n' >&2
  exit 1
fi

cleanup() {
  if [[ -n "$user_id" ]]; then
    for bucket in avatars meteor-media meteor-video; do
      prefixes="$(docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
        select name from storage.objects
        where bucket_id = '$bucket' and name like '$user_id/%';
      " | jq -Rsc '{prefixes: (split("\n") | map(select(length > 0)))}')"
      curl -sS -o /dev/null -X DELETE \
        -H "apikey: $service_role_key" \
        -H "Authorization: Bearer $service_role_key" \
        -H 'Content-Type: application/json' \
        --data "$prefixes" \
        "$api_url/storage/v1/object/$bucket" || true
    done

    curl -sS -o /dev/null -X DELETE \
      -H "apikey: $service_role_key" \
      -H "Authorization: Bearer $service_role_key" \
      "$api_url/auth/v1/admin/users/$user_id" || true

    docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      delete from app_private.abuse_rate_limits where actor_id = '$user_id';
    " >/dev/null || true
  fi

  rm -rf "$result_dir"
}

trap cleanup EXIT

create_response="$result_dir/create-user.json"
create_http="$(curl -sS -o "$create_response" -w '%{http_code}' -X POST \
  -H "apikey: $service_role_key" \
  -H "Authorization: Bearer $service_role_key" \
  -H 'Content-Type: application/json' \
  --data '{"email":"sec008-storage@example.invalid","password":"S3c008-local-only!","email_confirm":true,"user_metadata":{"legal_terms_version":"2026-07-10","legal_privacy_version":"2026-07-10","legal_age_confirmed":true}}' \
  "$api_url/auth/v1/admin/users")"

if [[ "$create_http" != '200' ]]; then
  printf 'local Storage test user creation failed: http=%s\n' "$create_http" >&2
  exit 1
fi

user_id="$(jq -r '.id // empty' "$create_response")"
if [[ -z "$user_id" ]]; then
  printf 'local Storage test user id was missing\n' >&2
  exit 1
fi

token_response="$result_dir/token.json"
token_http="$(curl -sS -o "$token_response" -w '%{http_code}' -X POST \
  -H "apikey: $anon_key" \
  -H 'Content-Type: application/json' \
  --data '{"email":"sec008-storage@example.invalid","password":"S3c008-local-only!"}' \
  "$api_url/auth/v1/token?grant_type=password")"

if [[ "$token_http" != '200' ]]; then
  printf 'local Storage test sign-in failed: http=%s\n' "$token_http" >&2
  exit 1
fi

access_token="$(jq -r '.access_token // empty' "$token_response")"
if [[ -z "$access_token" ]]; then
  printf 'local Storage access token was missing\n' >&2
  exit 1
fi

wrong_folder_http="$(curl -sS -o "$result_dir/wrong-folder.json" -w '%{http_code}' -X POST \
  -H "apikey: $anon_key" \
  -H "Authorization: Bearer $access_token" \
  -H 'Content-Type: image/png' \
  --data-binary 'not-a-real-production-object' \
  "$api_url/storage/v1/object/avatars/not-the-owner/sec008.png")"

if [[ "$wrong_folder_http" == '200' || "$wrong_folder_http" == '201' ]]; then
  printf 'wrong-folder Storage upload unexpectedly succeeded\n' >&2
  exit 1
fi

unreserved_http="$(curl -sS -o "$result_dir/unreserved.json" -w '%{http_code}' -X POST \
  -H "apikey: $anon_key" \
  -H "Authorization: Bearer $access_token" \
  -H 'Content-Type: image/png' \
  --data-binary 'not-reserved' \
  "$api_url/storage/v1/object/avatars/$user_id/unreserved.png")"

if [[ "$unreserved_http" == '200' || "$unreserved_http" == '201' ]]; then
  printf 'unreserved own-folder Storage upload unexpectedly succeeded\n' >&2
  exit 1
fi

invalid_mime_http="$(curl -sS -o "$result_dir/invalid-mime.json" -w '%{http_code}' -X POST \
  -H "apikey: $service_role_key" \
  -H "Authorization: Bearer $service_role_key" \
  -H 'Content-Type: text/plain' \
  --data-binary 'invalid mime' \
  "$api_url/storage/v1/object/avatars/sec008-mime-probe/invalid.txt")"

if [[ "$invalid_mime_http" == '200' || "$invalid_mime_http" == '201' ]]; then
  printf 'invalid-MIME Storage upload unexpectedly succeeded\n' >&2
  exit 1
fi

run_storage_burst() {
  local bucket="$1"
  local expected_reserved="$2"
  local content_type="$3"
  local extension="$4"
  local pids=()

  for request_number in $(seq 1 40); do
    (
      local request_log="$result_dir/$bucket-reserve-$request_number.log"
      local request_status="$result_dir/$bucket-reserve-$request_number.status"
      local http_code

      http_code="$(curl -sS -o "$request_log" -w '%{http_code}' -X POST \
        -H "apikey: $anon_key" \
        -H "Authorization: Bearer $access_token" \
        -H 'Content-Type: application/json' \
        --data "{\"p_bucket_id\":\"$bucket\",\"p_extension\":\"$extension\"}" \
        "$api_url/rest/v1/rpc/reserve_storage_upload_v1")"

      # A just-issued local JWT can briefly reach one PostgREST worker before
      # that worker's clock has caught up. PGRST303 is rejected before the RPC
      # executes, so retry that exact pre-execution failure once.
      if [[ "$http_code" != '200' ]] \
        && grep -Fq '"code":"PGRST303"' "$request_log" \
        && grep -Fq 'JWT issued at future' "$request_log"; then
        sleep 1
        http_code="$(curl -sS -o "$request_log" -w '%{http_code}' -X POST \
          -H "apikey: $anon_key" \
          -H "Authorization: Bearer $access_token" \
          -H 'Content-Type: application/json' \
          --data "{\"p_bucket_id\":\"$bucket\",\"p_extension\":\"$extension\"}" \
          "$api_url/rest/v1/rpc/reserve_storage_upload_v1")"
      fi

      if [[ "$http_code" == '200' ]]; then
        jq -er 'select(type == "string" and length > 0)' "$request_log" \
          >"$result_dir/$bucket-reservation-$request_number.path"
        printf '%s\n' reserved >"$request_status"
      elif grep -Eqi 'storage upload rate limit exceeded' "$request_log"; then
        printf '%s\n' limited >"$request_status"
      else
        printf '%s\n' unexpected >"$request_status"
      fi
    ) &
    pids+=("$!")
  done

  for pid in "${pids[@]}"; do
    wait "$pid"
  done

  local reserved_count=0
  local limited_count=0
  local unexpected_count=0
  local status_file

  for status_file in "$result_dir/$bucket-reserve-"*.status; do
    case "$(<"$status_file")" in
      reserved) reserved_count=$((reserved_count + 1)) ;;
      limited) limited_count=$((limited_count + 1)) ;;
      *) unexpected_count=$((unexpected_count + 1)) ;;
    esac
  done

  if [[ "$reserved_count" -ne "$expected_reserved" \
    || "$limited_count" -ne $((40 - expected_reserved)) \
    || "$unexpected_count" -ne 0 ]]; then
    printf '%s reserved=%s limited=%s unexpected=%s\n' \
      "$bucket" "$reserved_count" "$limited_count" "$unexpected_count" >&2
    grep -H . "$result_dir/$bucket-reserve-"*.log >&2 || true
    exit 1
  fi

  pids=()
  for reservation_file in "$result_dir/$bucket-reservation-"*.path; do
    (
      local request_number
      local request_log
      local request_status
      local object_path
      local http_code
      request_number="$(basename "$reservation_file" | sed -n 's/.*-\([0-9][0-9]*\)\.path$/\1/p')"
      request_log="$result_dir/$bucket-upload-$request_number.log"
      request_status="$result_dir/$bucket-upload-$request_number.status"
      object_path="$(<"$reservation_file")"

      if [[ "$object_path" != "$user_id/"* ]]; then
        printf '%s\n' unexpected >"$request_status"
        exit 0
      fi

      http_code="$(curl -sS -o "$request_log" -w '%{http_code}' -X POST \
        -H "apikey: $anon_key" \
        -H "Authorization: Bearer $access_token" \
        -H "Content-Type: $content_type" \
        -H 'x-upsert: false' \
        --data-binary "sec008-$bucket-$request_number" \
        "$api_url/storage/v1/object/$bucket/$object_path")"

      if [[ "$http_code" == '200' || "$http_code" == '201' ]]; then
        printf '%s\n' created >"$request_status"
      else
        printf '%s\n' unexpected >"$request_status"
      fi
    ) &
    pids+=("$!")
  done

  for pid in "${pids[@]}"; do
    wait "$pid"
  done

  local created_count=0
  unexpected_count=0
  for status_file in "$result_dir/$bucket-upload-"*.status; do
    case "$(<"$status_file")" in
      created) created_count=$((created_count + 1)) ;;
      *) unexpected_count=$((unexpected_count + 1)) ;;
    esac
  done

  if [[ "$created_count" -ne "$expected_reserved" || "$unexpected_count" -ne 0 ]]; then
    printf '%s upload_created=%s unexpected=%s\n' \
      "$bucket" "$created_count" "$unexpected_count" >&2
    grep -H . "$result_dir/$bucket-upload-"*.log >&2 || true
    exit 1
  fi

  reservation_state="$(docker exec "$db_container" psql -qAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    select
      count(*) filter (where used_at is not null),
      count(*) filter (where used_at is null)
    from app_private.storage_upload_reservations
    where actor_id = '$user_id' and bucket_id = '$bucket';
  ")"

  if [[ "$reservation_state" != "$expected_reserved|0" ]]; then
    printf '%s unexpected reservation state: %s\n' "$bucket" "$reservation_state" >&2
    exit 1
  fi

  docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    update app_private.abuse_rate_limits
    set refilled_at = refilled_at - case
      when scope like '%_day' then interval '1 day'
      else interval '1 hour'
    end
    where actor_id = '$user_id'
      and scope in ('storage_${bucket//-/_}_hour', 'storage_${bucket//-/_}_day');
  " >/dev/null

  refill_http="$(curl -sS -o "$result_dir/$bucket-refill.json" -w '%{http_code}' -X POST \
    -H "apikey: $anon_key" \
    -H "Authorization: Bearer $access_token" \
    -H 'Content-Type: application/json' \
    --data "{\"p_bucket_id\":\"$bucket\",\"p_extension\":\"$extension\"}" \
    "$api_url/rest/v1/rpc/reserve_storage_upload_v1")"

  if [[ "$refill_http" != '200' ]]; then
    printf '%s quota did not recover after the full windows\n' "$bucket" >&2
    exit 1
  fi

  printf '%s reserved=%s limited=%s uploaded=%s used=%s refill=success\n' \
    "$bucket" "$reserved_count" "$limited_count" "$created_count" "$expected_reserved"
}

run_storage_burst avatars 10 image/png png
run_storage_burst meteor-media 30 image/png png
run_storage_burst meteor-video 5 video/mp4 mp4

storage_state="$(docker exec "$db_container" psql -qAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  select
    count(*) filter (where bucket_id = 'avatars'),
    count(*) filter (where bucket_id = 'meteor-media'),
    count(*) filter (where bucket_id = 'meteor-video')
  from storage.objects
  where owner_id::text = '$user_id'
    and name like '$user_id/%';
")"

if [[ "$storage_state" != '10|30|5' ]]; then
  printf 'unexpected Storage object counts: %s\n' "$storage_state" >&2
  exit 1
fi

printf 'storage_abuse_control_state=%s\n' "$storage_state"

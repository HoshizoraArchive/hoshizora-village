#!/usr/bin/env bash

set -euo pipefail

db_container="${1:?database container name is required}"
test_user_id="30000000-0000-4000-8000-000000000001"
test_author_id="30000000-0000-4000-8000-000000000002"
test_post_id="40000000-0000-4000-8000-000000000001"
result_dir="$(mktemp -d)"

cleanup() {
  docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    begin;
    set local session_replication_role = replica;
    delete from public.notifications where post_id = '$test_post_id';
    delete from public.resonances where post_id = '$test_post_id';
    delete from app_private.post_domain_revisions where post_id = '$test_post_id';
    delete from public.posts where id = '$test_post_id';
    delete from public.profiles where id in ('$test_user_id', '$test_author_id');
    set local session_replication_role = origin;
    commit;
  " >/dev/null
  rm -rf "$result_dir"
}

trap cleanup EXIT

docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  begin;
  set local session_replication_role = replica;
  insert into public.profiles (id, display_name, username)
  values
    ('$test_user_id', 'Concurrent Rate User', 'concurrent_rate_user'),
    ('$test_author_id', 'Concurrent Rate Author', 'concurrent_rate_author');
  insert into public.posts (id, author_id, type, body, visibility)
  values ('$test_post_id', '$test_author_id', 'text', 'concurrent rate post', 'public');
  set local session_replication_role = origin;
  commit;
" >/dev/null

pids=()

for request_number in $(seq 1 40); do
  (
    request_log="$result_dir/request-$request_number.log"
    request_status="$result_dir/request-$request_number.status"

    if docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      begin;
      set local role authenticated;
      select pg_catalog.set_config('request.jwt.claim.sub', '$test_user_id', true);
      select pg_catalog.set_config(
        'request.jwt.claims',
        '{\"sub\":\"$test_user_id\",\"role\":\"authenticated\"}',
        true
      );
      select public.add_post_resonance_v1('$test_post_id', 'sparkle');
      commit;
    " >"$request_log" 2>&1; then
      printf '%s\n' created >"$request_status"
    elif grep -q 'resonance rate limit exceeded' "$request_log"; then
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

created_count=0
limited_count=0
unexpected_count=0

for status_file in "$result_dir"/*.status; do
  case "$(<"$status_file")" in
    created) created_count=$((created_count + 1)) ;;
    limited) limited_count=$((limited_count + 1)) ;;
    *) unexpected_count=$((unexpected_count + 1)) ;;
  esac
done

if [[ "$created_count" -ne 20 || "$limited_count" -ne 20 || "$unexpected_count" -ne 0 ]]; then
  printf 'created=%s limited=%s unexpected=%s\n' "$created_count" "$limited_count" "$unexpected_count" >&2
  grep -H . "$result_dir"/*.log >&2 || true
  exit 1
fi

database_state="$(docker exec "$db_container" psql -qAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  select
    (select count(*) from public.resonances where post_id = '$test_post_id'),
    (select revision from app_private.post_domain_revisions where post_id = '$test_post_id' and domain = 'resonance'),
    (select count(*) from public.notifications where post_id = '$test_post_id' and type = 'resonance');
")"

if [[ "$database_state" != '20|20|1' ]]; then
  printf 'unexpected rows|revision|notification state: %s\n' "$database_state" >&2
  exit 1
fi

printf 'concurrent_created=%s concurrent_limited=%s state=%s\n' \
  "$created_count" "$limited_count" "$database_state"

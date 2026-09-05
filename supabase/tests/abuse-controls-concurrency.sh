#!/usr/bin/env bash

set -euo pipefail

db_container="${1:?database container name is required}"
result_dir="$(mktemp -d)"

post_actor="51000000-0000-4000-8000-000000000001"
letter_actor="52000000-0000-4000-8000-000000000001"
feedback_actor="53000000-0000-4000-8000-000000000001"
tag_actor="54000000-0000-4000-8000-000000000001"
open_actor="55000000-0000-4000-8000-000000000001"
report_actor="56000000-0000-4000-8000-000000000001"
letter_resonance_actor="57000000-0000-4000-8000-000000000001"
push_actor="58000000-0000-4000-8000-000000000001"
push_transfer_actor="58000000-0000-4000-8000-000000000002"
post_author="59000000-0000-4000-8000-000000000001"
letter_author="59000000-0000-4000-8000-000000000002"
admin_actor="59000000-0000-4000-8000-000000000003"
letter_post="61000000-0000-4000-8000-000000000001"
letter_target="61000000-0000-4000-8000-000000000002"

cleanup() {
  docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    begin;
    set local session_replication_role = replica;
    delete from public.push_notification_jobs
    where recipient_id in ('$post_author', '$letter_author', '$admin_actor');
    delete from public.notifications
    where actor_id in ('$letter_actor', '$letter_resonance_actor')
       or recipient_id in ('$post_author', '$letter_author', '$admin_actor');
    delete from public.content_reports where reporter_original_id = '$report_actor';
    delete from public.star_letter_resonances where profile_id = '$letter_resonance_actor';
    delete from public.star_letters
    where author_id in ('$letter_actor', '$letter_author');
    delete from public.feedbacks where user_id = '$feedback_actor';
    delete from public.meteor_tags where created_by = '$tag_actor';
    delete from public.app_open_events where user_id = '$open_actor';
    delete from public.push_subscriptions where profile_id in ('$push_actor', '$push_transfer_actor');
    delete from app_private.push_subscription_usage where profile_id in ('$push_actor', '$push_transfer_actor');
    delete from public.app_admins where user_id = '$admin_actor';
    delete from public.posts where author_id in ('$post_actor', '$post_author');
    delete from app_private.abuse_rate_limits
    where actor_id in (
      '$post_actor', '$letter_actor', '$feedback_actor', '$tag_actor',
      '$open_actor', '$report_actor', '$letter_resonance_actor'
    );
    delete from public.profiles
    where id in (
      '$post_actor', '$letter_actor', '$feedback_actor', '$tag_actor',
      '$open_actor', '$report_actor', '$letter_resonance_actor', '$push_actor', '$push_transfer_actor',
      '$post_author', '$letter_author', '$admin_actor'
    ) or id::text like '70000000-0000-4000-8000-%';
    delete from auth.users
    where id in ('$feedback_actor', '$open_actor', '$admin_actor');
    set local session_replication_role = origin;
    commit;
  " >/dev/null
  rm -rf "$result_dir"
}

trap cleanup EXIT

docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  begin;
  set local session_replication_role = replica;
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    ('00000000-0000-0000-0000-000000000000', '$feedback_actor', 'authenticated', 'authenticated', 'feedback-rate@example.invalid', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '$open_actor', 'authenticated', 'authenticated', 'open-rate@example.invalid', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '$admin_actor', 'authenticated', 'authenticated', 'admin-rate@example.invalid', '', now(), '{}', '{}', now(), now());
  insert into public.profiles (id, display_name, username)
  values
    ('$post_actor', 'Post Rate Actor', 'post_rate_actor'),
    ('$letter_actor', 'Letter Rate Actor', 'letter_rate_actor'),
    ('$feedback_actor', 'Feedback Rate Actor', 'feedback_rate_actor'),
    ('$tag_actor', 'Tag Rate Actor', 'tag_rate_actor'),
    ('$open_actor', 'Open Rate Actor', 'open_rate_actor'),
    ('$report_actor', 'Report Rate Actor', 'report_rate_actor'),
    ('$letter_resonance_actor', 'Letter Resonance Actor', 'letter_resonance_actor'),
    ('$push_actor', 'Push Rate Actor', 'push_rate_actor'),
    ('$push_transfer_actor', 'Push Transfer Actor', 'push_transfer_actor'),
    ('$post_author', 'Post Author', 'post_rate_author'),
    ('$letter_author', 'Letter Author', 'letter_rate_author'),
    ('$admin_actor', 'Report Admin', 'report_rate_admin');
  insert into public.profiles (id, display_name, username)
  select
    ('70000000-0000-4000-8000-' || lpad(series_number::text, 12, '0'))::uuid,
    'Report Target ' || series_number,
    'report_target_' || series_number
  from generate_series(1, 40) series_number;
  insert into public.app_admins (user_id) values ('$admin_actor');
  insert into public.posts (id, author_id, type, body, visibility)
  values ('$letter_post', '$post_author', 'text', 'letter rate target', 'public');
  insert into public.star_letters (id, post_id, author_id, body)
  values ('$letter_target', '$letter_post', '$letter_author', 'resonance target');
  set local session_replication_role = origin;
  commit;
" >/dev/null

run_burst() {
  local label="$1"
  local role_name="$2"
  local actor_id="$3"
  local expected_created="$4"
  local sql_template="$5"
  local error_pattern="$6"
  local pids=()

  for request_number in $(seq 1 40); do
    (
      local request_suffix
      local statement
      local request_log="$result_dir/$label-$request_number.log"
      local request_status="$result_dir/$label-$request_number.status"

      request_suffix="$(printf '%012d' "$request_number")"
      statement="${sql_template//__N__/$request_number}"
      statement="${statement//__SUFFIX__/$request_suffix}"

      if docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
        begin;
        set local role $role_name;
        select pg_catalog.set_config('request.jwt.claim.sub', '$actor_id', true);
        select pg_catalog.set_config(
          'request.jwt.claims',
          '{\"sub\":\"$actor_id\",\"role\":\"$role_name\"}',
          true
        );
        $statement
        commit;
      " >"$request_log" 2>&1; then
        printf '%s\n' created >"$request_status"
      elif grep -Eq "$error_pattern" "$request_log"; then
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

  local created_count=0
  local limited_count=0
  local unexpected_count=0
  local status_file

  for status_file in "$result_dir/$label-"*.status; do
    case "$(<"$status_file")" in
      created) created_count=$((created_count + 1)) ;;
      limited) limited_count=$((limited_count + 1)) ;;
      *) unexpected_count=$((unexpected_count + 1)) ;;
    esac
  done

  if [[ "$created_count" -ne "$expected_created" \
    || "$limited_count" -ne $((40 - expected_created)) \
    || "$unexpected_count" -ne 0 ]]; then
    printf '%s created=%s limited=%s unexpected=%s\n' \
      "$label" "$created_count" "$limited_count" "$unexpected_count" >&2
    grep -H . "$result_dir/$label-"*.log >&2 || true
    exit 1
  fi

  printf '%s created=%s limited=%s\n' "$label" "$created_count" "$limited_count"
}

run_burst \
  post authenticated "$post_actor" 10 \
  "select public.create_post_v1('post burst __N__', 'text', 'public');" \
  'post rate limit exceeded'

run_burst \
  star_letter authenticated "$letter_actor" 30 \
  "select public.create_star_letter_v2('$letter_post', 'letter burst __N__');" \
  'star letter rate limit exceeded'

run_burst \
  star_letter_resonance authenticated "$letter_resonance_actor" 30 \
  "select public.add_star_letter_resonance_v2('$letter_target', '81000000-0000-4000-8000-__SUFFIX__', 'sparkle');" \
  'star letter resonance rate limit exceeded'

run_burst \
  feedback authenticated "$feedback_actor" 5 \
  "insert into public.feedbacks (user_id, type, body) values ('$feedback_actor', '感想', 'feedback burst __N__');" \
  'feedback rate limit exceeded'

run_burst \
  meteor_tag authenticated "$tag_actor" 30 \
  "insert into public.meteor_tags (name, normalized_name, created_by) values ('tag__N__', 'tag__N__', '$tag_actor');" \
  'meteor tag rate limit exceeded'

run_burst \
  app_open authenticated "$open_actor" 30 \
  "insert into public.app_open_events (user_id, source, app_mode, platform, client_opened_at) values ('$open_actor', 'foreground', 'browser', 'desktop', now());" \
  'app open rate limit exceeded'

run_burst \
  content_report authenticated "$report_actor" 10 \
  "select * from public.create_content_report('profile', '70000000-0000-4000-8000-__SUFFIX__', 'spam_or_fraud', null);" \
  'content report rate limit exceeded'

run_burst \
  push service_role "$push_actor" 20 \
  "insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values ('$push_actor', 'https://push.example.invalid/__N__', 'p256dh__N__', 'auth__N__');" \
  'push subscription limit exceeded'

run_burst \
  push_disabled service_role "$push_actor" 30 \
  "insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, disabled_at) values ('$push_actor', 'https://push.example.invalid/disabled/__N__', 'disabled_p256dh__N__', 'disabled_auth__N__', now());" \
  'push subscription limit exceeded'

run_burst \
  push_test service_role "$push_actor" 5 \
  "select public.reserve_push_subscription_test_v1('$push_actor');" \
  'push test rate limit exceeded'

database_state="$(docker exec "$db_container" psql -qAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  select
    (select count(*) from public.posts where author_id = '$post_actor'),
    (select count(*) from public.star_letters where author_id = '$letter_actor'),
    (select count(*) from public.notifications where actor_id = '$letter_actor' and type = 'star_letter'),
    (select count(*) from public.push_notification_jobs job join public.notifications notification on notification.id = job.notification_id where notification.actor_id = '$letter_actor' and notification.type = 'star_letter'),
    (select count(*) from public.star_letter_resonances where profile_id = '$letter_resonance_actor'),
    (select count(*) from public.notifications where actor_id = '$letter_resonance_actor' and type = 'star_letter_resonance'),
    (select count(*) from public.push_notification_jobs job join public.notifications notification on notification.id = job.notification_id where notification.actor_id = '$letter_resonance_actor' and notification.type = 'star_letter_resonance'),
    (select count(*) from public.feedbacks where user_id = '$feedback_actor'),
    (select count(*) from public.meteor_tags where created_by = '$tag_actor'),
    (select count(*) from public.app_open_events where user_id = '$open_actor'),
    (select count(*) from public.content_reports where reporter_original_id = '$report_actor'),
    (select count(*) from public.notifications where content_report_id in (select id from public.content_reports where reporter_original_id = '$report_actor')),
    (select count(*) from public.push_notification_jobs job join public.notifications notification on notification.id = job.notification_id where notification.content_report_id in (select id from public.content_reports where reporter_original_id = '$report_actor')),
    (select count(*) from public.push_subscriptions where profile_id = '$push_actor'),
    (select count(*) from public.push_subscriptions where profile_id = '$push_actor' and disabled_at is null),
    (select active_count from app_private.push_subscription_usage where profile_id = '$push_actor'),
    (select total_count from app_private.push_subscription_usage where profile_id = '$push_actor');
")"

if [[ "$database_state" != '10|30|30|30|30|1|1|5|30|30|10|10|10|50|20|20|50' ]]; then
  printf 'unexpected rows and side effects: %s\n' "$database_state" >&2
  exit 1
fi

printf 'abuse_control_state=%s\n' "$database_state"

# Account transfer is an existing supported path. The concurrent burst does
# not deterministically preserve endpoint /1, so move one active row that
# actually survived the burst and verify both counters move atomically.
docker exec "$db_container" psql -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  begin;
  set local role service_role;
  update public.push_subscriptions
  set profile_id = '$push_transfer_actor'
  where id = (
    select id
    from public.push_subscriptions
    where profile_id = '$push_actor'
      and disabled_at is null
    order by endpoint
    limit 1
  );
  commit;
" >/dev/null

transfer_state="$(docker exec "$db_container" psql -qAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  select
    (select active_count from app_private.push_subscription_usage where profile_id = '$push_actor'),
    (select total_count from app_private.push_subscription_usage where profile_id = '$push_actor'),
    (select active_count from app_private.push_subscription_usage where profile_id = '$push_transfer_actor'),
    (select total_count from app_private.push_subscription_usage where profile_id = '$push_transfer_actor');
")"

if [[ "$transfer_state" != '19|49|1|1' ]]; then
  printf 'unexpected Push account-transfer usage: %s\n' "$transfer_state" >&2
  exit 1
fi

printf 'push_transfer_state=%s\n' "$transfer_state"

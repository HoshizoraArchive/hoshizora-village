begin;

create table if not exists public.user_onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_step text not null default 'welcome_video',
  welcome_video_status text not null default 'not_started',
  welcome_video_completed_at timestamptz,
  profile_completed_at timestamptz,
  target_post_id uuid references public.posts(id) on delete set null,
  archive_completed_at timestamptz,
  archive_confirmed_at timestamptz,
  notification_permission_status text not null default 'default',
  notification_permission_updated_at timestamptz,
  push_registered_at timestamptz,
  push_registration_status text not null default 'not_attempted',
  push_test_status text not null default 'not_attempted',
  push_test_updated_at timestamptz,
  first_post_id uuid references public.posts(id) on delete set null,
  first_post_completed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_onboarding_progress_current_step_check check (
    current_step in (
      'welcome_video',
      'mini_chia_intro',
      'profile_setup',
      'profile_success',
      'observe_intro',
      'archive_prompt',
      'archive_check',
      'archive_success',
      'rconnect_intro',
      'notification_permission',
      'device_registration',
      'push_test',
      'push_test_success',
      'push_test_explained',
      'post_intro_1',
      'post_intro_2',
      'post_intro_3',
      'post_intro_4',
      'first_post',
      'completion_1',
      'completion_2',
      'completed'
    )
  ),
  constraint user_onboarding_progress_notification_permission_check check (
    notification_permission_status in ('default', 'granted', 'denied', 'unsupported', 'error')
  ),
  constraint user_onboarding_progress_welcome_video_status_check check (
    welcome_video_status in ('not_started', 'completed', 'skipped')
  ),
  constraint user_onboarding_progress_push_test_status_check check (
    push_test_status in ('not_attempted', 'succeeded', 'failed', 'skipped')
  ),
  constraint user_onboarding_progress_push_registration_status_check check (
    push_registration_status in ('not_attempted', 'succeeded', 'failed')
  ),
  constraint user_onboarding_progress_completed_state_check check (
    (current_step = 'completed' and completed_at is not null)
    or (current_step <> 'completed' and completed_at is null)
  )
);

comment on table public.user_onboarding_progress is
'Issue #97の初回オンボーディング進捗。migration適用後に新規作成されたAuthユーザーだけを対象とし、既存ユーザーはbackfillしない。';
comment on column public.user_onboarding_progress.current_step is
'Welcome映像から初投稿完了までの現在地点。各操作の成功はadvance_initial_onboarding RPCがDB上の実データを再確認する。';
comment on column public.user_onboarding_progress.welcome_video_status is
'Welcome映像を最後まで再生したか、利用者がスキップしたかを区別して記録する。';
comment on column public.user_onboarding_progress.target_post_id is
'Archive体験で使用する公開・未削除の流星便。表示順に依存せずユーザーごとに固定する。';
comment on column public.user_onboarding_progress.notification_permission_status is
'ブラウザが返した通知許可状態。Push端末登録やテスト通知の成功とは区別して記録する。';
comment on column public.user_onboarding_progress.push_test_status is
'実際のサーバーWeb Push送信結果。succeededはservice_role専用RPCからのみ記録する。';
comment on column public.user_onboarding_progress.push_registration_status is
'現在ユーザーへのPush端末登録結果。succeededへの遷移時は有効なpush_subscriptions行をDBで再確認する。';

create index if not exists user_onboarding_progress_current_step_idx
on public.user_onboarding_progress(current_step)
where completed_at is null;

create index if not exists user_onboarding_progress_target_post_id_idx
on public.user_onboarding_progress(target_post_id)
where target_post_id is not null;

drop trigger if exists user_onboarding_progress_set_updated_at on public.user_onboarding_progress;
create trigger user_onboarding_progress_set_updated_at
before update on public.user_onboarding_progress
for each row execute function public.set_updated_at();

alter table public.user_onboarding_progress enable row level security;

revoke all on table public.user_onboarding_progress from public, anon, authenticated;
grant select on table public.user_onboarding_progress to authenticated;
grant select, insert, update, delete on table public.user_onboarding_progress to service_role;

drop policy if exists user_onboarding_progress_select_own on public.user_onboarding_progress;
create policy user_onboarding_progress_select_own
on public.user_onboarding_progress
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function app_private.create_initial_onboarding_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_post_id uuid;
begin
  select p.id
  into v_target_post_id
  from public.posts p
  where p.visibility = 'public'
    and p.deleted_at is null
    and p.author_id <> new.id
  order by p.created_at desc, p.id desc
  limit 1;

  insert into public.user_onboarding_progress (
    user_id,
    target_post_id
  )
  values (
    new.id,
    v_target_post_id
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.create_initial_onboarding_progress()
from public, anon, authenticated;

drop trigger if exists auth_users_create_initial_onboarding_progress on auth.users;
create trigger auth_users_create_initial_onboarding_progress
after insert on auth.users
for each row execute function app_private.create_initial_onboarding_progress();

create or replace function public.advance_initial_onboarding(
  p_action text,
  p_status text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := now();
  v_progress public.user_onboarding_progress%rowtype;
  v_verified_post_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('outcome', 'not_authenticated');
  end if;

  select *
  into v_progress
  from public.user_onboarding_progress p
  where p.user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_eligible');
  end if;

  if v_progress.completed_at is not null then
    return jsonb_build_object(
      'outcome', 'already_completed',
      'progress', to_jsonb(v_progress)
    );
  end if;

  if p_action = 'ensure_target' then
    if v_progress.target_post_id is null
      or not exists (
        select 1
        from public.posts p
        where p.id = v_progress.target_post_id
          and p.visibility = 'public'
          and p.deleted_at is null
          and p.author_id <> v_user_id
      )
    then
      select p.id
      into v_progress.target_post_id
      from public.posts p
      where p.visibility = 'public'
        and p.deleted_at is null
        and p.author_id <> v_user_id
      order by p.created_at desc, p.id desc
      limit 1;

      if v_progress.target_post_id is null then
        return jsonb_build_object('outcome', 'target_unavailable');
      end if;

      update public.user_onboarding_progress
      set target_post_id = v_progress.target_post_id
      where user_id = v_user_id;
    end if;
  elsif p_action = 'welcome_completed' and v_progress.current_step = 'welcome_video' then
    if p_status not in ('completed', 'skipped') then
      return jsonb_build_object('outcome', 'invalid_status');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'mini_chia_intro',
      welcome_video_status = p_status,
      welcome_video_completed_at = coalesce(welcome_video_completed_at, v_now)
    where user_id = v_user_id;
  elsif p_action = 'mini_chia_ack' and v_progress.current_step = 'mini_chia_intro' then
    update public.user_onboarding_progress
    set current_step = 'profile_setup'
    where user_id = v_user_id;
  elsif p_action = 'profile_saved' and v_progress.current_step = 'profile_setup' then
    if not exists (
      select 1
      from public.profiles p
      where p.id = v_user_id
        and nullif(btrim(p.display_name), '') is not null
        and nullif(btrim(coalesce(p.avatar_url, '')), '') is not null
    ) then
      return jsonb_build_object('outcome', 'profile_incomplete');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'profile_success',
      profile_completed_at = coalesce(profile_completed_at, v_now)
    where user_id = v_user_id;
  elsif p_action = 'profile_success_ack' and v_progress.current_step = 'profile_success' then
    update public.user_onboarding_progress
    set current_step = 'observe_intro'
    where user_id = v_user_id;
  elsif p_action = 'observe_intro_ack' and v_progress.current_step = 'observe_intro' then
    update public.user_onboarding_progress
    set current_step = 'archive_prompt'
    where user_id = v_user_id;
  elsif p_action = 'archive_saved' and v_progress.current_step in ('archive_prompt', 'archive_check') then
    if v_progress.target_post_id is null
      or p_target_id is distinct from v_progress.target_post_id
      or not exists (
        select 1
        from public.archives a
        where a.profile_id = v_user_id
          and a.post_id = v_progress.target_post_id
      )
    then
      return jsonb_build_object('outcome', 'archive_not_found');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'archive_check',
      archive_completed_at = coalesce(archive_completed_at, v_now)
    where user_id = v_user_id;
  elsif p_action = 'archive_confirmed' and v_progress.current_step = 'archive_check' then
    if v_progress.target_post_id is null
      or p_target_id is distinct from v_progress.target_post_id
      or not exists (
        select 1
        from public.archives a
        join public.posts p on p.id = a.post_id
        where a.profile_id = v_user_id
          and a.post_id = v_progress.target_post_id
          and p.visibility = 'public'
          and p.deleted_at is null
      )
    then
      return jsonb_build_object('outcome', 'archive_not_found');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'archive_success',
      archive_confirmed_at = coalesce(archive_confirmed_at, v_now)
    where user_id = v_user_id;
  elsif p_action = 'archive_success_ack' and v_progress.current_step = 'archive_success' then
    update public.user_onboarding_progress
    set current_step = 'rconnect_intro'
    where user_id = v_user_id;
  elsif p_action = 'rconnect_intro_ack' and v_progress.current_step = 'rconnect_intro' then
    update public.user_onboarding_progress
    set current_step = 'notification_permission'
    where user_id = v_user_id;
  elsif p_action = 'notification_permission' and v_progress.current_step = 'notification_permission' then
    if p_status not in ('default', 'granted', 'denied', 'unsupported', 'error') then
      return jsonb_build_object('outcome', 'invalid_status');
    end if;

    update public.user_onboarding_progress
    set
      current_step = case when p_status = 'granted' then 'device_registration' else current_step end,
      notification_permission_status = p_status,
      notification_permission_updated_at = v_now
    where user_id = v_user_id;
  elsif p_action = 'push_registered' and v_progress.current_step in ('device_registration', 'push_test') then
    if not exists (
      select 1
      from public.push_subscriptions s
      where s.profile_id = v_user_id
        and s.disabled_at is null
    ) then
      return jsonb_build_object('outcome', 'push_not_registered');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'push_test',
      push_registration_status = 'succeeded',
      push_registered_at = coalesce(push_registered_at, v_now)
    where user_id = v_user_id;
  elsif p_action = 'push_registration_failed' and v_progress.current_step = 'device_registration' then
    update public.user_onboarding_progress
    set push_registration_status = 'failed'
    where user_id = v_user_id;
  elsif p_action = 'push_test_success_ack' and v_progress.current_step = 'push_test_success' then
    update public.user_onboarding_progress
    set current_step = 'push_test_explained'
    where user_id = v_user_id;
  elsif p_action = 'push_test_explained_ack' and v_progress.current_step = 'push_test_explained' then
    update public.user_onboarding_progress
    set current_step = 'post_intro_1'
    where user_id = v_user_id;
  elsif p_action = 'skip_notifications'
    and v_progress.current_step in ('notification_permission', 'device_registration', 'push_test')
  then
    if p_status not in ('denied', 'unsupported', 'failed', 'error') then
      return jsonb_build_object('outcome', 'invalid_status');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'post_intro_1',
      push_test_status = case when push_test_status = 'succeeded' then push_test_status else 'skipped' end,
      push_test_updated_at = coalesce(push_test_updated_at, v_now)
    where user_id = v_user_id;
  elsif p_action = 'post_intro_1_ack' and v_progress.current_step = 'post_intro_1' then
    update public.user_onboarding_progress
    set current_step = 'post_intro_2'
    where user_id = v_user_id;
  elsif p_action = 'post_intro_2_ack' and v_progress.current_step = 'post_intro_2' then
    update public.user_onboarding_progress
    set current_step = 'post_intro_3'
    where user_id = v_user_id;
  elsif p_action = 'post_intro_3_ack' and v_progress.current_step = 'post_intro_3' then
    update public.user_onboarding_progress
    set current_step = 'post_intro_4'
    where user_id = v_user_id;
  elsif p_action = 'post_intro_4_ack' and v_progress.current_step = 'post_intro_4' then
    update public.user_onboarding_progress
    set current_step = 'first_post'
    where user_id = v_user_id;
  elsif p_action = 'first_post_saved' and v_progress.current_step = 'first_post' then
    select p.id
    into v_verified_post_id
    from public.posts p
    where p.id = p_target_id
      and p.author_id = v_user_id
      and p.deleted_at is null
      and p.created_at >= v_progress.created_at
    for share;

    if v_verified_post_id is null then
      return jsonb_build_object('outcome', 'post_not_found');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'completion_1',
      first_post_id = v_verified_post_id,
      first_post_completed_at = coalesce(first_post_completed_at, v_now)
    where user_id = v_user_id;
  elsif p_action = 'completion_1_ack' and v_progress.current_step = 'completion_1' then
    update public.user_onboarding_progress
    set current_step = 'completion_2'
    where user_id = v_user_id;
  elsif p_action = 'complete' and v_progress.current_step = 'completion_2' then
    update public.user_onboarding_progress
    set
      current_step = 'completed',
      completed_at = v_now
    where user_id = v_user_id;
  elsif p_action = 'existing_post_detected'
    and v_progress.current_step in ('post_intro_1', 'post_intro_2', 'post_intro_3', 'post_intro_4', 'first_post')
  then
    select p.id
    into v_verified_post_id
    from public.posts p
    where p.author_id = v_user_id
      and p.deleted_at is null
    order by p.created_at asc, p.id asc
    limit 1
    for share;

    if v_verified_post_id is null then
      return jsonb_build_object('outcome', 'post_not_found');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'completed',
      first_post_id = coalesce(first_post_id, v_verified_post_id),
      first_post_completed_at = coalesce(first_post_completed_at, v_now),
      completed_at = v_now
    where user_id = v_user_id;
  else
    return jsonb_build_object(
      'outcome', 'invalid_step',
      'current_step', v_progress.current_step
    );
  end if;

  select *
  into v_progress
  from public.user_onboarding_progress p
  where p.user_id = v_user_id;

  return jsonb_build_object(
    'outcome', 'advanced',
    'progress', to_jsonb(v_progress)
  );
end;
$$;

revoke all on function public.advance_initial_onboarding(text, text, uuid)
from public, anon, authenticated;
grant execute on function public.advance_initial_onboarding(text, text, uuid)
to authenticated;

create or replace function public.record_initial_onboarding_push_test(
  p_user_id uuid,
  p_result text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_progress public.user_onboarding_progress%rowtype;
begin
  if p_user_id is null or p_result not in ('succeeded', 'failed') then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  select *
  into v_progress
  from public.user_onboarding_progress p
  where p.user_id = p_user_id
  for update;

  if not found or v_progress.completed_at is not null then
    return jsonb_build_object('outcome', 'not_eligible');
  end if;

  if p_result = 'succeeded' then
    if v_progress.current_step <> 'push_test'
      or not exists (
        select 1
        from public.push_subscriptions s
        where s.profile_id = p_user_id
          and s.disabled_at is null
      )
    then
      return jsonb_build_object('outcome', 'invalid_step');
    end if;

    update public.user_onboarding_progress
    set
      current_step = 'push_test_success',
      push_registered_at = coalesce(push_registered_at, v_now),
      push_test_status = 'succeeded',
      push_test_updated_at = v_now
    where user_id = p_user_id;
  else
    update public.user_onboarding_progress
    set
      push_test_status = 'failed',
      push_test_updated_at = v_now
    where user_id = p_user_id
      and current_step = 'push_test';
  end if;

  return jsonb_build_object('outcome', 'recorded');
end;
$$;

revoke all on function public.record_initial_onboarding_push_test(uuid, text)
from public, anon, authenticated;
grant execute on function public.record_initial_onboarding_push_test(uuid, text)
to service_role;

commit;

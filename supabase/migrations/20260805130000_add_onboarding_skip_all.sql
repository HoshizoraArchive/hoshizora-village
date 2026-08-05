begin;

alter table public.user_onboarding_progress
  add column if not exists skipped_at timestamptz,
  add column if not exists skipped_from_step text;

comment on column public.user_onboarding_progress.skipped_at is
'入村案内を最後まで完走せず、全体スキップで終了した日時。';

comment on column public.user_onboarding_progress.skipped_from_step is
'入村案内を全体スキップした時点の current_step。';

do $migration$
declare
  v_function_definition text;
  v_old_fragment text := $old$
  if p_action = 'ensure_target' then
$old$;
  v_new_fragment text := $new$
  if p_action = 'skip_all' then
    update public.user_onboarding_progress
    set
      current_step = 'completed',
      completed_at = v_now,
      skipped_at = coalesce(skipped_at, v_now),
      skipped_from_step = coalesce(skipped_from_step, v_progress.current_step)
    where user_id = v_user_id;
  elsif p_action = 'ensure_target' then
$new$;
begin
  select pg_get_functiondef('public.advance_initial_onboarding(text,text,uuid)'::regprocedure)
  into v_function_definition;

  if strpos(v_function_definition, $needle$p_action = 'skip_all'$needle$) > 0 then
    return;
  end if;

  if strpos(v_function_definition, v_old_fragment) = 0 then
    raise exception 'advance_initial_onboarding ensure_target branch did not match expected definition';
  end if;

  execute replace(v_function_definition, v_old_fragment, v_new_fragment);
end;
$migration$;

comment on function public.advance_initial_onboarding(text, text, uuid) is
'初回オンボーディングの状態遷移。skip_all で任意の未完了ステップから案内を終了でき、スキップ日時と離脱ステップを記録する。';

commit;

-- PREVIEW-V2 ONLY / DO NOT APPLY TO PRODUCTION.
-- Schema-only continuation copied from the reviewed Git migration.

begin;

do $migration$
declare
  v_function_definition text;
  v_old_fragment text := $old$
    where p.author_id = v_user_id
      and p.deleted_at is null
    order by p.created_at asc, p.id asc
$old$;
  v_new_fragment text := $new$
    where p.author_id = v_user_id
      and p.deleted_at is null
      and p.created_at >= v_progress.created_at
    order by p.created_at asc, p.id asc
$new$;
begin
  select pg_get_functiondef('public.advance_initial_onboarding(text,text,uuid)'::regprocedure)
  into v_function_definition;

  if strpos(v_function_definition, v_new_fragment) > 0 then
    return;
  end if;

  if strpos(v_function_definition, v_old_fragment) = 0 then
    raise exception 'advance_initial_onboarding existing_post_detected branch did not match expected definition';
  end if;

  execute replace(v_function_definition, v_old_fragment, v_new_fragment);
end;
$migration$;

comment on function public.advance_initial_onboarding(text, text, uuid) is
'初回オンボーディングの状態遷移。既存投稿の自動検知はオンボーディング開始後に作成された投稿だけを対象にする。';

commit;

begin;

update public.guide_entries
set body = replace(body, 'R.' || 'Connect', 'Re:Connect')
where strpos(body, 'R.' || 'Connect') > 0;

update public.notifications
set message = replace(message, 'R.' || 'Connect', 'Re:Connect')
where strpos(message, 'R.' || 'Connect') > 0;

comment on table public.notifications is
'Re:Connect通知。共鳴、Archive、星文などの通知を保存する。';
comment on column public.profiles.notify_authors_when_i_archive is
'自分が誰かの流星便をArchiveした時、相手にRe:Connect通知を送るかどうか。デフォルトON。';
comment on column public.profiles.notify_authors_when_i_resonate is
'自分が誰かの流星便に共鳴した時、相手にRe:Connect通知を送るかどうか。デフォルトON。';
comment on table public.push_subscriptions is
'Re:ConnectスマホPush通知用の端末購読情報。Netlify Functionのservice_role経由でのみ登録する。';
comment on table public.push_notification_jobs is
'Re:Connect通知を登録済み端末へWeb Push配信するためのserver-side queue。browser roleからは直接操作させない。';

commit;

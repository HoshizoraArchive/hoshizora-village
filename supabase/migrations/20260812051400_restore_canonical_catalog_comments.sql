comment on column public.push_notification_jobs.notification_id is
'Push配信対象のpublic.notifications行。1通知につき最大1job。';

comment on column public.push_notification_jobs.recipient_id is
'通知受信者。送信Functionはこのprofile_idに紐づく有効なpush_subscriptionsだけへ送信する。';

comment on column public.push_notification_jobs.status is
'queued / processing / succeeded / failed / skipped。';

comment on column public.push_notification_jobs.attempt_count is
'scheduled Functionがclaimした送信試行回数。Gemini/AI観測とは無関係。';

comment on column public.push_notification_jobs.last_error_code is
'外部へ出してよい短い失敗分類。endpointやsecretなどは保存しない。';

comment on column public.notifications.star_letter_id is
'星文通知の対象。Re:Connectから流星便と星文を特定するために保持する。';

comment on column public.notifications.content_report_id is
'観測局の管理通知が指すreport。対象ユーザーや送信者へは公開せず、管理者のRe:Connect遷移だけに使用する。';

comment on function app_private.create_chia_post_notifications() is
'星空ちあの新規流星便を、ちあ本人とAI住人を除く全村人のRe:Connectへ配る。';

comment on function app_private.enqueue_push_notification_job() is
'通知INSERTをPush配信jobへ積む。chia_postだけはrecipientのnotify_chia_posts=falseならPushを積まない。';

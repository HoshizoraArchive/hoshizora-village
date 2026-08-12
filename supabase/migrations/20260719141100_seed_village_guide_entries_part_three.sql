insert into public.guide_entries (
  entry_key, section_id, entry_type, body, sort_order, is_visible
)
select seed.entry_key, section_row.id, seed.entry_type, seed.body, seed.sort_order, true
from (
  values
    ('beta_auth_profile', 'beta_testing', 'list_item', '登録・ログイン・プロフィール設定で迷わないか', 10),
    ('beta_posting', 'beta_testing', 'list_item', 'テキスト・星影・星映・YouTubeの流星便を投稿しやすいか', 20),
    ('beta_navigation', 'beta_testing', 'list_item', '流星タグや共有URLから目的の流星便へ移動できるか', 30),
    ('beta_actions', 'beta_testing', 'list_item', '共鳴 / Archive / 星文の違いが伝わるか', 40),
    ('beta_notifications', 'beta_testing', 'list_item', 'R.ConnectとPush通知が分かりやすいか', 50),
    ('beta_chia', 'beta_testing', 'list_item', '星空ちあの観測や星文が自然に届くか', 60),
    ('beta_mobile', 'beta_testing', 'list_item', 'スマホで重い・押しにくい・読みにくい場所がないか', 70),
    ('beta_requests', 'beta_testing', 'list_item', 'ほしい機能や不安な点がないか', 80),
    ('feedback_send', 'feedback_help', 'paragraph', '気づいたこと、不具合、ほしい機能、分かりにくかった場所があれば、設定画面の「星の目安箱」から送ってください。', 10),
    ('feedback_value', 'feedback_help', 'paragraph', 'あなたの声は、星空Villageを育てるための大切な星文です。', 20),
    ('beta_notice_unstable', 'beta_notice', 'paragraph', '現在の星空Villageは開発中の先行テスト版です。予告なく仕様が変わったり、一部機能が不安定な場合があります。', 10),
    ('beta_notice_backup', 'beta_notice', 'paragraph', '大切な文章や作品は、念のため自分の手元にも保存しておいてください。', 20)
) as seed(entry_key, section_key, entry_type, body, sort_order)
join public.guide_sections section_row on section_row.section_key = seed.section_key
on conflict (entry_key) do nothing;
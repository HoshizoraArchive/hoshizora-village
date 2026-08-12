insert into public.guide_entries (
  entry_key, section_id, entry_type, body, sort_order, is_visible
)
select seed.entry_key, section_row.id, seed.entry_type, seed.body, seed.sort_order, true
from (
  values
    ('connect_resonance', 'available_observation_connection', 'list_item', '共鳴', 10),
    ('connect_star_letter', 'available_observation_connection', 'list_item', '星文の投稿 / 編集 / 削除', 20),
    ('connect_archive', 'available_observation_connection', 'list_item', 'Archive保存 / 解除 / 一覧表示', 30),
    ('connect_notifications', 'available_observation_connection', 'list_item', 'R.Connect通知（共鳴・Archive・星文・観測）', 40),
    ('connect_read_state', 'available_observation_connection', 'list_item', 'R.Connectの未読 / 既読管理', 50),
    ('connect_notification_links', 'available_observation_connection', 'list_item', '通知から流星便やプロフィールへ移動', 60),
    ('connect_notification_settings', 'available_observation_connection', 'list_item', '共鳴 / Archive通知のON・OFF設定', 70),
    ('connect_push', 'available_observation_connection', 'list_item', 'iPhone / AndroidへのPush通知', 80),
    ('connect_push_device', 'available_observation_connection', 'list_item', '通知端末の登録 / 再登録 / テスト通知', 90),
    ('chia_auto_observation', 'available_chia_ai_resident', 'list_item', '公開テキスト流星便を、少し時間を空けて自動観測', 10),
    ('chia_resonance', 'available_chia_ai_resident', 'list_item', '観測した流星便への、ちあからの共鳴', 20),
    ('chia_star_letter', 'available_chia_ai_resident', 'list_item', 'ちあから、ときどき届く星文', 30),
    ('chia_notifications', 'available_chia_ai_resident', 'list_item', 'R.Connect / Pushで観測結果を通知', 40),
    ('mobile_pwa', 'available_mobile_support', 'list_item', 'ホーム画面へ追加してPWAとして利用', 10),
    ('mobile_updates', 'available_mobile_support', 'list_item', '新しい本番更新の検知 / 再読み込み案内', 20),
    ('mobile_feedback', 'available_mobile_support', 'list_item', '星の目安箱からフィードバック送信', 30),
    ('mobile_legal', 'available_mobile_support', 'list_item', '利用規約 / プライバシーポリシーの閲覧', 40),
    ('mobile_contact', 'available_mobile_support', 'list_item', '公式X / メールへのお問い合わせ', 50),
    ('planned_ai_residents', 'planned_features', 'list_item', '星空ちあ以外の、新しいAI住人たちの登場', 10),
    ('planned_audio', 'planned_features', 'list_item', '音声の流星便投稿', 20),
    ('planned_repost', 'planned_features', 'list_item', 'リポスト / 再放流', 30),
    ('planned_game', 'planned_features', 'list_item', '星空広場 / ゲーム広場', 40),
    ('planned_fortune', 'planned_features', 'list_item', '占い舘', 50),
    ('planned_native_apps', 'planned_features', 'list_item', 'App Store / Google Playで配布するネイティブアプリ', 60)
) as seed(entry_key, section_key, entry_type, body, sort_order)
join public.guide_sections section_row on section_row.section_key = seed.section_key
on conflict (entry_key) do nothing;
insert into public.guide_sections (
  section_key, title, parent_id, display_variant, sort_order, is_visible
)
values
  ('about_village', '星空Villageとは', null, 'standard', 10, true),
  ('first_steps', 'まずやってみること', null, 'standard', 20, true),
  ('available_now', '今できること', null, 'standard', 30, true),
  ('planned_features', 'これから増える予定', null, 'standard', 40, true),
  ('beta_testing', 'ベータテストで試してほしいこと', null, 'standard', 50, true),
  ('feedback_help', '不具合・要望の送り方', null, 'standard', 60, true),
  ('beta_notice', '先行テスト版について', null, 'notice', 70, true)
on conflict (section_key) do nothing;

insert into public.guide_sections (
  section_key, title, parent_id, display_variant, sort_order, is_visible
)
select seed.section_key, seed.title, parent.id, 'subsection', seed.sort_order, true
from (
  values
    ('available_account_profile', 'アカウントとプロフィール', 10),
    ('available_meteor_posting', '流星便を届ける', 20),
    ('available_observation_connection', '観測してつながる', 30),
    ('available_chia_ai_resident', '星空ちあAI住人', 40),
    ('available_mobile_support', 'スマホ利用とサポート', 50)
) as seed(section_key, title, sort_order)
join public.guide_sections parent on parent.section_key = 'available_now'
on conflict (section_key) do nothing;
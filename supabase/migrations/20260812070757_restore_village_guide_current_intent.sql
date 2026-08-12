create or replace function app_private.guide_section_is_public(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive section_ancestry as (
    select
      section_row.id,
      section_row.parent_id,
      section_row.is_visible,
      array[section_row.id]::uuid[] as visited_ids,
      false as has_cycle,
      1 as depth
    from public.guide_sections section_row
    where section_row.id = p_section_id

    union all

    select
      parent_section.id,
      parent_section.parent_id,
      parent_section.is_visible,
      section_ancestry.visited_ids || parent_section.id,
      parent_section.id = any(section_ancestry.visited_ids),
      section_ancestry.depth + 1
    from section_ancestry
    join public.guide_sections parent_section
      on parent_section.id = section_ancestry.parent_id
    where section_ancestry.has_cycle is false
      and section_ancestry.depth < 64
  )
  select coalesce(
    bool_and(section_ancestry.is_visible)
      and not bool_or(section_ancestry.has_cycle)
      and bool_or(section_ancestry.parent_id is null),
    false
  )
  from section_ancestry;
$$;

comment on table public.app_admins is
'星空Villageの管理操作を許可されたAuthユーザー。ブラウザから一覧は公開しない。';

comment on table public.guide_sections is
'はじめての入村案内のセクションと子カテゴリー。section_keyは外部運用でも使う安定キー。';
comment on column public.guide_sections.section_key is
'人間と外部運用が1行を特定する安定キー。作成後は変更しない。';
comment on column public.guide_sections.parent_id is
'nullなら最上位セクション。値があれば子カテゴリー。';
comment on column public.guide_sections.display_variant is
'standardは通常カード、subsectionは子カテゴリー、noticeは注意書き表示。';

comment on table public.guide_entries is
'はじめての入村案内を1項目ずつ管理する文章行。entry_keyで単発更新できる。';
comment on column public.guide_entries.entry_key is
'人間と外部運用が1行を特定する安定キー。作成後は変更しない。';
comment on column public.guide_entries.updated_by is
'更新したAuthユーザーを記録する非公開監査列。service_role更新ではnullになり得る。';

comment on function public.is_app_admin() is
'現在の認証ユーザーがapp_adminsに登録されているかだけを返す。管理者一覧は公開しない。';

comment on function app_private.guide_section_is_public(uuid) is
'RLS専用。対象セクションからルートまで全祖先が表示中で、循環せずルートへ到達した場合だけtrueを返す。';

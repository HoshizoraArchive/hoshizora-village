-- Add legal consent records for Terms and Privacy Policy acceptance.
-- Production Supabase must apply this only after review.

begin;

create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint legal_consents_versions_check check (
    terms_version = btrim(terms_version)
    and privacy_version = btrim(privacy_version)
    and terms_version <> ''
    and privacy_version <> ''
    and char_length(terms_version) <= 32
    and char_length(privacy_version) <= 32
  ),
  constraint legal_consents_user_versions_key unique (user_id, terms_version, privacy_version)
);

comment on table public.legal_consents is
'利用規約とプライバシーポリシーへの同意記録。2026-07-10版から記録する。';
comment on column public.legal_consents.user_id is
'同意したSupabase Authユーザー。ブラウザからは本人分のみinsert/select可能。';
comment on column public.legal_consents.terms_version is
'同意した利用規約の版。MVPでは2026-07-10。';
comment on column public.legal_consents.privacy_version is
'同意したプライバシーポリシーの版。MVPでは2026-07-10。';
comment on column public.legal_consents.accepted_at is
'同意を記録した時刻。';

create index if not exists legal_consents_user_id_idx
on public.legal_consents(user_id);

alter table public.legal_consents enable row level security;

revoke all on table public.legal_consents from public, anon, authenticated;
grant select, insert on table public.legal_consents to authenticated;
grant select, insert on table public.legal_consents to service_role;

drop policy if exists legal_consents_select_own on public.legal_consents;
create policy legal_consents_select_own on public.legal_consents
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists legal_consents_insert_own on public.legal_consents;
create policy legal_consents_insert_own on public.legal_consents
for insert
to authenticated
with check (user_id = (select auth.uid()));

commit;

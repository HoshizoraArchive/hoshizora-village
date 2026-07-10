-- Add legal consent records for Terms and Privacy Policy acceptance.
-- Production Supabase must apply this only after review.

begin;

create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  age_confirmed_at timestamptz not null,
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
'同意したSupabase Authユーザー。ブラウザからは本人分のみselect可能。記録はauth.users triggerまたはrecord_legal_consent RPCで行う。';
comment on column public.legal_consents.terms_version is
'同意した利用規約の版。MVPでは2026-07-10。';
comment on column public.legal_consents.privacy_version is
'同意したプライバシーポリシーの版。MVPでは2026-07-10。';
comment on column public.legal_consents.accepted_at is
'同意を記録した時刻。';
comment on column public.legal_consents.age_confirmed_at is
'18歳以上であることを確認した時刻。';

create index if not exists legal_consents_user_id_idx
on public.legal_consents(user_id);

alter table public.legal_consents enable row level security;

revoke all on table public.legal_consents from public, anon, authenticated;
grant select on table public.legal_consents to authenticated;
grant select, insert on table public.legal_consents to service_role;

drop policy if exists legal_consents_select_own on public.legal_consents;
create policy legal_consents_select_own on public.legal_consents
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.record_legal_consent(
  p_terms_version text,
  p_privacy_version text,
  p_age_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_user_id is null then
    return jsonb_build_object('outcome', 'not_authenticated');
  end if;

  if p_terms_version is distinct from '2026-07-10'
    or p_privacy_version is distinct from '2026-07-10'
    or p_age_confirmed is distinct from true
  then
    return jsonb_build_object('outcome', 'invalid_consent');
  end if;

  insert into public.legal_consents (
    user_id,
    terms_version,
    privacy_version,
    accepted_at,
    age_confirmed_at
  )
  values (
    v_user_id,
    '2026-07-10',
    '2026-07-10',
    v_now,
    v_now
  )
  on conflict (user_id, terms_version, privacy_version) do nothing;

  return jsonb_build_object('outcome', 'recorded');
end;
$$;

revoke all on function public.record_legal_consent(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_legal_consent(text, text, boolean) to authenticated;

create or replace function app_private.record_legal_consent_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terms_version text := new.raw_user_meta_data ->> 'legal_terms_version';
  v_privacy_version text := new.raw_user_meta_data ->> 'legal_privacy_version';
  v_age_confirmed boolean := lower(coalesce(new.raw_user_meta_data ->> 'legal_age_confirmed', 'false')) = 'true';
  v_now timestamptz := now();
begin
  if v_terms_version is distinct from '2026-07-10'
    or v_privacy_version is distinct from '2026-07-10'
    or v_age_confirmed is distinct from true
  then
    raise exception 'LEGAL_CONSENT_REQUIRED'
      using errcode = '23514';
  end if;

  insert into public.legal_consents (
    user_id,
    terms_version,
    privacy_version,
    accepted_at,
    age_confirmed_at
  )
  values (
    new.id,
    '2026-07-10',
    '2026-07-10',
    v_now,
    v_now
  )
  on conflict (user_id, terms_version, privacy_version) do nothing;

  return new;
end;
$$;

revoke all on function app_private.record_legal_consent_from_auth_user() from public, anon, authenticated;

drop trigger if exists auth_users_record_legal_consent on auth.users;
create trigger auth_users_record_legal_consent
after insert on auth.users
for each row execute function app_private.record_legal_consent_from_auth_user();

commit;

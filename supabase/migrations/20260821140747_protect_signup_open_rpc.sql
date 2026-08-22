begin;

revoke execute on function public.record_signup_open(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_signup_open(uuid, text, text, timestamptz)
  to service_role;

commit;

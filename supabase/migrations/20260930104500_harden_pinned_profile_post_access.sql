begin;

revoke all on function app_private.validate_profile_pinned_post()
from public, anon, authenticated, service_role;

revoke all on function app_private.clear_invalid_profile_pin()
from public, anon, authenticated, service_role;

grant select (pinned_post_id) on table public.profiles to anon, authenticated;

commit;

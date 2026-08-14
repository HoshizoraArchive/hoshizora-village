-- H-3 FINAL-B / LOCAL ONLY / READ ONLY.
-- Emits per-policy hashes only when the aggregate catalog gate needs diagnosis.

begin;
set transaction read only;

select
  schemaname,
  tablename,
  policyname,
  md5(concat_ws('|', schemaname, tablename, policyname, permissive,
    array_to_string(roles, ','), cmd, qual, with_check)) as fingerprint
from pg_catalog.pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname collate "C";

rollback;

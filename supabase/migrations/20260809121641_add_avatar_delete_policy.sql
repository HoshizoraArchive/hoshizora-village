-- Authenticated residents may delete only their own unreferenced avatar objects.
-- The current profile reference check is evaluated by Storage RLS at delete time so a
-- concurrent profile save cannot make the object current between a client-side check
-- and the Storage API removal.
create policy avatars_delete_own_unreferenced
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and right(
        p.avatar_url,
        length('/storage/v1/object/public/avatars/' || storage.objects.name)
      ) = '/storage/v1/object/public/avatars/' || storage.objects.name
  )
);

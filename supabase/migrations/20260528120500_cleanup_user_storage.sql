-- Cleanup on user deletion. FK cascades wipe a deleted user's rows in profiles,
-- brand_extractions, ad_prompts, generated_ads, and brand_assets — but cascades
-- can't reach Storage, so the user's image files in the `ads` and `brand-assets`
-- buckets are left orphaned. This trigger removes them when the auth user is deleted.
-- (security definer so the function can delete from storage.objects, owned by
--  supabase_storage_admin; mirrors the existing on_auth_user_created trigger.)
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from storage.objects
  where bucket_id in ('ads', 'brand-assets')
    and (storage.foldername(name))[1] = old.id::text;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();

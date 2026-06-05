-- Public bucket for restaurant menu PDFs.
-- The previous food create form tried to upload PDFs to `property-photos`,
-- which is restricted to image MIME types and to paths prefixed with the
-- user's UUID or an existing property UUID. Both checks rejected PDF menu
-- uploads, leaving services.menu_url null on every PDF-flow listing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-menus',
  'restaurant-menus',
  true,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "restaurant_menus_public_select" on storage.objects;
create policy "restaurant_menus_public_select" on storage.objects
  for select
  to public
  using (bucket_id = 'restaurant-menus');

drop policy if exists "restaurant_menus_owner_insert" on storage.objects;
create policy "restaurant_menus_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'restaurant-menus'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "restaurant_menus_owner_update" on storage.objects;
create policy "restaurant_menus_owner_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'restaurant-menus' and owner = auth.uid())
  with check (bucket_id = 'restaurant-menus' and owner = auth.uid());

drop policy if exists "restaurant_menus_owner_delete" on storage.objects;
create policy "restaurant_menus_owner_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'restaurant-menus' and owner = auth.uid());

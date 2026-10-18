-- storage.objects: drop the two unused client UPDATE policies (2026-10-13, C5).
--
-- UPDATE policies are OR-ed across buckets, so restaurant_menus_owner_update
-- (owner only, any folder) let a signed-in user move their own objects from
-- another bucket into restaurant-menus under any folder name, past that bucket's
-- type and size limits. No code moves, copies or updates objects: menus and logos
-- upload with upsert:false to fresh random paths. Avatars (upsert:true, own
-- folder) and landing-media (admin) keep their UPDATE policies.

DROP POLICY IF EXISTS "restaurant_menus_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "Users update own logos" ON storage.objects;

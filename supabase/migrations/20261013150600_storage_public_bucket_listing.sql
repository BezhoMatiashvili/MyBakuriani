-- storage.objects: the five public buckets stop being listable (F-ST01, 2026-10-14, C5).
--
-- property-photos, logos, avatars, restaurant-menus and landing-media each had a
-- SELECT policy "bucket_id = '<bucket>'" for every role, so anyone holding the anon
-- key could list every object (POST /storage/v1/object/list/<bucket>): user-id
-- folders, photos of listings the site hides (C31), replaced avatars, logos and
-- menus, and orphaned ad/blog uploads (Supabase lint 0025_public_bucket_allows_listing).
--
-- Public files need no SELECT policy: storage-api serves /object/public/... and
-- /render/image/public/... as the superuser, and next/image only fetches those URLs.
-- Two client paths do read rows under the caller, so a plain DROP would break them:
--   * the upsert probe, INSERT ... ON CONFLICT DO UPDATE ... RETURNING (avatar
--     uploads use upsert:true: register, guest profile, cleaner parameters);
--   * remove(), DELETE ... RETURNING (PhotoUploader, SingleImageUploader, and the
--     admin MediaUploader on landing-media).
-- The replacement keeps exactly the rows a caller may write visible to that caller:
-- every INSERT, UPDATE and DELETE policy on these buckets tests the caller's own
-- folder, owner or owner_id, or (landing-media) is_admin_user().

DROP POLICY IF EXISTS "Property photos are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for logos" ON storage.objects;
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "restaurant_menus_public_select" ON storage.objects;
DROP POLICY IF EXISTS "landing-media public read" ON storage.objects;

DROP POLICY IF EXISTS "public buckets: own objects readable" ON storage.objects;
CREATE POLICY "public buckets: own objects readable" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('property-photos', 'logos', 'avatars', 'restaurant-menus')
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR owner = (SELECT auth.uid())
      OR owner_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "landing-media admin read" ON storage.objects;
CREATE POLICY "landing-media admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'landing-media' AND (SELECT public.is_admin_user()));

-- A SELECT/ALL policy on these buckets under any other name (one created by hand
-- on another project) would keep the bucket listable: refuse instead.
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO leftover
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND cmd IN ('SELECT', 'ALL')
    AND permissive = 'PERMISSIVE'
    AND policyname NOT IN ('public buckets: own objects readable', 'landing-media admin read')
    AND coalesce(qual, '') ~ '''(property-photos|logos|avatars|restaurant-menus|landing-media)''';
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'storage.objects still has SELECT policies on the public buckets: %', leftover
      USING ERRCODE = '55000';
  END IF;
END $$;

-- Behavioural check (catches a policy that reaches these buckets without naming
-- them, e.g. USING (true) or a deny-list): neither anon nor a signed-in stranger
-- may read a row of the five public buckets.
DO $$
DECLARE
  saved text := current_user;
  leaked text;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT string_agg(DISTINCT bucket_id, ', ') INTO leaked FROM storage.objects
   WHERE bucket_id IN ('property-photos', 'logos', 'avatars', 'restaurant-menus', 'landing-media');
  EXECUTE format('SET LOCAL ROLE %I', saved);
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'storage.objects: anon can still read %', leaked USING ERRCODE = '55000';
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated"}', true);
  SELECT string_agg(DISTINCT bucket_id, ', ') INTO leaked FROM storage.objects
   WHERE bucket_id IN ('property-photos', 'logos', 'avatars', 'restaurant-menus', 'landing-media');
  EXECUTE format('SET LOCAL ROLE %I', saved);
  PERFORM set_config('request.jwt.claims', '', true);
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'storage.objects: a signed-in stranger can still read %', leaked USING ERRCODE = '55000';
  END IF;
END $$;

-- SECURITY: retire unused legacy buckets and scope active brand uploads.
--
-- The chat-media policies were named as service-role policies but targeted
-- PUBLIC, which allowed anonymous uploads (and authenticated deletion).  The
-- bucket is unused and empty. product-images/service-photos are also unused and
-- empty legacy buckets, so keep them private with no client policies.

DROP POLICY IF EXISTS "temporary audit cleanup read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read access for chat media" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete chat media" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload chat media" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for product images" ON storage.objects;

UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('chat-media', 'product-images', 'service-photos');

-- Organization brand images remain public by design, but a user may only
-- create and mutate objects in their own top-level folder.  The bucket-level
-- size/type constraints also apply when the Storage REST API is called without
-- going through the browser component.
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;

CREATE POLICY "Users upload own logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users update own logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND owner_id = (SELECT auth.uid()::text)
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND owner_id = (SELECT auth.uid()::text)
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users delete own logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND owner_id = (SELECT auth.uid()::text)
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'logos';

-- Security hardening S2 (2026-09-27): narrow browser writes on the public property-photos
-- bucket (D6). Every app writer (PhotoUploader, the create/service profile photo) creates a
-- new object at <auth.uid()>/<file> with upsert off and never updates or moves it, so INSERT
-- now requires exactly that one-level own folder (the unused listing-id folder branch is
-- gone) and the UPDATE policy is dropped. SELECT, DELETE and service-role writers unchanged.
-- S19 (grants on schema net) is not here: supabase_admin owns and granted them (runbook).

ALTER POLICY "Authenticated users can upload own property photos"
  ON storage.objects
  WITH CHECK (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND array_length(storage.foldername(name), 1) = 1
  );

DROP POLICY "Authenticated users can update own property photos" ON storage.objects;

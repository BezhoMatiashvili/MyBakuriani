-- Track B hardening (forward-safe, non-destructive)

-- 1) Keep updated_at consistent where such column exists.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name TEXT;
  tables_with_updated_at TEXT[] := ARRAY[
    'profiles',
    'properties',
    'bookings',
    'services',
    'balances'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_with_updated_at
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_' || table_name || '_updated_at'
        AND tgrelid = to_regclass('public.' || table_name)
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        'set_' || table_name || '_updated_at',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

-- 2) Ensure storage bucket exists with expected constraints.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'property-photos',
  'property-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'property-photos'
);

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'property-photos';

-- 3) Storage RLS for property photos bucket.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Property photos are publicly viewable'
  ) THEN
    CREATE POLICY "Property photos are publicly viewable"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'property-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload own property photos'
  ) THEN
    CREATE POLICY "Authenticated users can upload own property photos"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'property-photos'
      AND (
        split_part(name, '/', 1) = auth.uid()::text
        OR (
          split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = split_part(name, '/', 1)::uuid
              AND p.owner_id = auth.uid()
          )
        )
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update own property photos'
  ) THEN
    CREATE POLICY "Authenticated users can update own property photos"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'property-photos'
      AND owner = auth.uid()
    )
    WITH CHECK (
      bucket_id = 'property-photos'
      AND owner = auth.uid()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete own property photos'
  ) THEN
    CREATE POLICY "Authenticated users can delete own property photos"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'property-photos'
      AND owner = auth.uid()
    );
  END IF;
END;
$$;

-- F-MC01: per-owner Storage upload budget, rolling 24 hours.
--
-- An owner may add or rewrite at most 1000 objects or 1 GiB (metadata.size) in
-- 24 hours, across all buckets. The owner is storage.objects.owner_id, the
-- uploader's JWT sub; for a signed upload URL it is the user who minted it.
--
-- Why a trigger and not an INSERT policy: storage-api (v1.80.2 on staging)
-- checks the INSERT policies only in its canUpload test insert, under the
-- caller's role. Its final upsert always runs as service_role. A signed upload
-- URL runs both steps as service_role, and a signed TUS upload skips the test
-- insert entirely. So a policy is checked once, when the URL is minted, and a
-- user under budget can mint any number of URLs. A BEFORE INSERT trigger fires
-- on every one of those inserts, whatever the role.
--
-- * owner_id NULL is a service-role write (server routes, scripts, upload
--   intents). Not budgeted.
-- * Admins are exempt. This mirrors public.is_admin_user() for the row's OWNER:
--   auth.uid() is NULL in storage-api's final insert. ListingAuditPanel stores
--   other owners' photos under the admin's own folder.
-- * The count uses the (bucket_id, name COLLATE "C") index on the owner's name
--   prefix. Every client INSERT policy pins the first folder to auth.uid();
--   restaurant-menus' split_part() also admits the bare "<uid>" name, which the
--   range includes. An object outside that prefix can only come from an admin
--   (exempt) or the service role (owner NULL).
-- * updated_at also counts a rewrite. INSERT ... ON CONFLICT DO UPDATE keeps
--   created_at, and the BEFORE UPDATE trigger bumps updated_at. Storage-api
--   never updates rows on read.
-- * The refusal is SQLSTATE 42501 with "row-level security" in the message.
--   storage-api turns exactly that into its existing AccessDenied answer, "new
--   row violates row-level security policy", which every uploader already
--   handles. Any other code would show a new error string or a 500.
-- * No advisory lock: storage-api holds the insert's transaction open while
--   it awaits its event sends, so a per-owner lock would serialise one user's
--   parallel uploads behind those. Concurrent inserts can overshoot the count
--   by the number of final-insert transactions in flight at once.
-- A move is an UPDATE, which the budget trigger does not see: refuse while an
-- UPDATE policy still lets an owner move objects out of the budgeted folder
-- (20261013150500 drops the two loose ones).
DO $$
DECLARE
  loose text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO loose
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('UPDATE', 'ALL')
     AND policyname NOT IN ('avatars owner update', 'landing-media admin update');
  IF loose IS NOT NULL THEN
    RAISE EXCEPTION 'storage.objects has UPDATE policies that let an owner move objects out of the budgeted folder; apply 20261013150500 first: %', loose
      USING ERRCODE = '55000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_storage_upload_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count bigint;
  v_bytes numeric;
BEGIN
  IF NEW.owner_id IS NULL OR NEW.owner_id = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.owner IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = NEW.owner
      AND p.role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*),
         coalesce(sum(CASE WHEN jsonb_typeof(o.metadata -> 'size') = 'number'
                           THEN (o.metadata ->> 'size')::numeric
                           ELSE 0 END), 0)
    INTO v_count, v_bytes
    FROM storage.objects o
   WHERE o.bucket_id = ANY (ARRAY(SELECT b.id FROM storage.buckets b))
     AND o.name COLLATE "C" >= NEW.owner_id COLLATE "C"
     AND o.name COLLATE "C" < (NEW.owner_id || '0') COLLATE "C"
     AND o.owner_id = NEW.owner_id
     AND coalesce(o.updated_at, o.created_at) > now() - interval '24 hours';

  IF v_count >= 1000 OR v_bytes >= 1073741824 THEN
    RAISE EXCEPTION 'new row violates row-level security policy for table "objects"'
      USING ERRCODE = '42501',
            DETAIL = 'Storage upload budget: 1000 objects or 1 GiB per owner in 24 hours.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_storage_upload_budget() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_storage_upload_budget ON storage.objects;
CREATE TRIGGER enforce_storage_upload_budget
  BEFORE INSERT ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_upload_budget();

-- content-change-media takes no browser upload (no code has ever written it; the
-- preview route only signs reads), so its direct INSERT policy goes too.
DROP POLICY IF EXISTS "Change-media owner upload" ON storage.objects;

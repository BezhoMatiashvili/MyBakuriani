-- Ownership ID files are kept after the decision (2026-10-28, C39).
--
-- The owner's rule: an admin must still see the ID card or passport and the registry extract behind a
-- decision, so a document is kept while any request that uses it is pending or approved, and for 90
-- days after that request was rejected or revoked (from reviewed_at); then the hourly purge deletes
-- it. Until now every decision purged its files at once. A basis trigger's automatic close sets
-- reviewed_at = now(), so it starts the 90 days too. A file used by a kept request and a due one
-- stays. Ownerless, discarded, failed (15 min) and unsubmitted (24 h) files keep today's rules, and a
-- deleted listing or account still frees its files (ownership_verifications CASCADE,
-- documents.owner_id SET NULL).
--
-- The 60-file cap no longer counts files of approved/revoked or admin-reviewed requests: they are
-- kept now, and about 30 verified listings would otherwise lock an owner out of uploads for good.
--
-- Bodies = 20261001200000 (= repo = live staging 2026-10-28) with only those predicates and comments
-- changed: signatures, locks, SKIP LOCKED and search_path are unchanged; the ACL is restated.
-- Apply after the app that says 90 days (DashboardAccount.ownership.privacy,
-- Support.canned.verifyOwnership, knowledge.ts), so owners are told before their files are kept.
-- The guard refuses (55000) where a live body differs from the reviewed 20261001200000 one.

DO $guard$
DECLARE
  v_cap text := (SELECT md5(p.prosrc) FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.enforce_ownership_document_limit()'));
  v_claim text := (SELECT md5(p.prosrc) FROM pg_proc p
                   WHERE p.oid = to_regprocedure('public.claim_ownership_documents_for_purge(uuid, integer)'));
BEGIN
  IF v_cap IS DISTINCT FROM 'd19a3b120adf42e1e26095e31a99e32a'
     OR v_claim IS DISTINCT FROM 'a4dd2666f51bff07de560d698fb68df7' THEN
    RAISE EXCEPTION 'ownership_document_retention: a live body differs from the reviewed one (cap md5 %, claim md5 %); regenerate this migration from the live definitions', v_cap, v_claim
      USING ERRCODE = '55000';
  END IF;
END
$guard$;

-- The rate limiter fails open by design (C16), so this cap is the hard bound
-- on what one owner can park in the bucket: 50 listings + 1 ID fit under it.
-- Files an admin approved or decided are kept (C39) and not counted.
CREATE OR REPLACE FUNCTION public.enforce_ownership_document_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'OWNERSHIP_DOCUMENT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('ownership-owner:' || NEW.owner_id::text, 0)
  );

  IF (
    SELECT count(*)
    FROM public.ownership_verification_documents d
    WHERE d.owner_id = NEW.owner_id
      AND d.purged_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.ownership_verifications v
        WHERE (v.status IN ('approved', 'revoked') OR v.reviewed_by IS NOT NULL)
          AND (v.identity_document_id = d.id OR v.registry_extract_document_id = d.id)
      )
  ) >= 60 THEN
    RAISE EXCEPTION 'OWNERSHIP_DOCUMENT_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Purge claim (the one definition of "safe to delete")
-- ---------------------------------------------------------------------------

-- Claims documents no request keeps (pending, approved, or rejected/revoked
-- under 90 days ago) and that are ownerless, discarded, failed over 15 min
-- ago, older than 24 h, or used by a request. The claim runs under each
-- owner's lock, so a submit that is still referencing one of them either
-- commits first (and the claim skips it) or sees the claim and refuses it.
-- purge.ts then removes the objects and stamps purged_at; a claim left
-- unstamped for 10 min is taken again.
CREATE OR REPLACE FUNCTION public.claim_ownership_documents_for_purge(
  p_owner_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_owners uuid[];
  v_owner uuid;
BEGIN
  IF p_owner_id IS NOT NULL THEN
    v_owners := ARRAY[p_owner_id];
  ELSE
    SELECT coalesce(array_agg(o.owner_id ORDER BY o.owner_id), '{}')
      INTO v_owners
    FROM (
      SELECT DISTINCT c.owner_id
      FROM public.ownership_verification_documents c
      WHERE c.purged_at IS NULL
        AND c.owner_id IS NOT NULL
        AND (c.purge_claimed_at IS NULL OR c.purge_claimed_at < now() - interval '10 minutes')
        AND NOT EXISTS (
          SELECT 1 FROM public.ownership_verifications v
          WHERE (v.status IN ('pending', 'approved') OR v.reviewed_at > now() - interval '90 days')
            AND (v.identity_document_id = c.id OR v.registry_extract_document_id = c.id)
        )
        AND (
          c.discarded_at IS NOT NULL
          OR c.upload_failed_at < now() - interval '15 minutes'
          OR c.created_at < now() - interval '24 hours'
          OR EXISTS (
            SELECT 1 FROM public.ownership_verifications v
            WHERE v.identity_document_id = c.id OR v.registry_extract_document_id = c.id
          )
        )
      ORDER BY c.owner_id
      LIMIT v_limit
    ) o;
  END IF;

  FOREACH v_owner IN ARRAY v_owners LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('ownership-owner:' || v_owner::text, 0)
    );
  END LOOP;

  -- A new statement after the locks: it sees every submit that committed
  -- while this call waited.
  RETURN QUERY
  WITH claimed AS (
  UPDATE public.ownership_verification_documents d
     SET purge_claimed_at = now()
   WHERE d.id IN (
     SELECT c.id
     FROM public.ownership_verification_documents c
     WHERE c.purged_at IS NULL
       AND (c.purge_claimed_at IS NULL OR c.purge_claimed_at < now() - interval '10 minutes')
       AND (
         c.owner_id = ANY (v_owners)
         OR (p_owner_id IS NULL AND c.owner_id IS NULL)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.ownership_verifications v
         WHERE (v.status IN ('pending', 'approved') OR v.reviewed_at > now() - interval '90 days')
           AND (v.identity_document_id = c.id OR v.registry_extract_document_id = c.id)
       )
       AND (
         c.owner_id IS NULL
         OR c.discarded_at IS NOT NULL
         OR c.upload_failed_at < now() - interval '15 minutes'
         OR c.created_at < now() - interval '24 hours'
         OR EXISTS (
           SELECT 1 FROM public.ownership_verifications v
           WHERE v.identity_document_id = c.id OR v.registry_extract_document_id = c.id
         )
       )
     ORDER BY c.created_at
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
   )
  RETURNING d.id, d.storage_path
  )
  SELECT claimed.id, claimed.storage_path FROM claimed;
END;
$$;

-- C34: service_role only (CREATE OR REPLACE keeps the ACL; restated).
REVOKE ALL ON FUNCTION public.enforce_ownership_document_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ownership_documents_for_purge(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ownership_documents_for_purge(uuid, integer) TO service_role;

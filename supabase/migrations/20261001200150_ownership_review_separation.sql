-- C39 follow-up (2026-10-02): separation of duties + a stronger contract snapshot.
--
-- 1. review_ownership_verification refuses a decision on the reviewing admin's
--    own request (OWNERSHIP_REVIEW_SELF, 42501): the badge says someone other
--    than the owner checked the documents. With a single admin, that admin's own
--    listings cannot be verified; a second admin has to decide.
-- 2. ownership_contract_snapshot() gains 'basis_trigger_defs' (table, enabled
--    flag and pg_get_triggerdef per basis trigger). Existing keys are unchanged.
--
-- Both bodies are the live staging definitions (pg_get_functiondef) with only
-- the additions above. CREATE OR REPLACE keeps the ACL; it is restated anyway.
-- Apply after 20261001200000 and before 20261001200200 (the purge schedule).

CREATE OR REPLACE FUNCTION public.review_ownership_verification(p_verification_id uuid, p_admin_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public.ownership_verifications%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_target text;
  v_required text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'revoke') THEN
    RAISE EXCEPTION 'OWNERSHIP_REVIEW_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'OWNERSHIP_REVIEW_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_action IN ('reject', 'revoke') AND v_note IS NULL THEN
    RAISE EXCEPTION 'OWNERSHIP_NOTE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'OWNERSHIP_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  -- Only the verification row is locked, never the listing (lock order).
  SELECT * INTO v_row
  FROM public.ownership_verifications
  WHERE id = p_verification_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNERSHIP_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Separation of duties: an admin never decides on a request for their own
  -- listing (approve, reject or revoke). Another admin has to.
  IF v_row.owner_id = p_admin_id THEN
    RAISE EXCEPTION 'OWNERSHIP_REVIEW_SELF' USING ERRCODE = '42501';
  END IF;

  v_target := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'revoked'
  END;
  v_required := CASE p_action WHEN 'revoke' THEN 'approved' ELSE 'pending' END;

  -- The same admin decision again (a double click, a retried request) is a
  -- no-op. A row a basis trigger closed (reviewed_by IS NULL) is not: the
  -- admin's reason would be dropped silently, so it is reported instead.
  IF v_row.status = v_target AND v_row.reviewed_by IS NOT NULL THEN
    RETURN json_build_object(
      'id', v_row.id,
      'status', v_row.status,
      'owner_id', v_row.owner_id,
      'property_id', v_row.property_id,
      'service_id', v_row.service_id,
      'idempotent', true
    );
  END IF;
  IF v_row.status <> v_required THEN
    RAISE EXCEPTION 'OWNERSHIP_ALREADY_DECIDED' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'approve' AND EXISTS (
    SELECT 1
    FROM public.ownership_verification_documents d
    WHERE d.id IN (v_row.identity_document_id, v_row.registry_extract_document_id)
      AND (d.purge_claimed_at IS NOT NULL OR d.purged_at IS NOT NULL OR d.discarded_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'OWNERSHIP_DOCUMENT_MISSING' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ownership_verifications
     SET status = v_target,
         decision_note = v_note,
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = v_row.id;

  BEGIN
    PERFORM public._notify_ownership_owner(
      v_row.owner_id,
      v_row.property_id,
      v_row.service_id,
      CASE WHEN p_action = 'revoke'
        THEN 'მესაკუთრეობის დადასტურება გაუქმდა'
        ELSE 'მესაკუთრეობის დადასტურება: მოთხოვნა განხილულია'
      END,
      CASE WHEN p_action = 'revoke'
        THEN 'განცხადების მესაკუთრეობის დადასტურება გაუქმდა. მიზეზი იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“.'
        ELSE 'მესაკუთრეობის დადასტურების მოთხოვნა განხილულია. შედეგი იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“.'
      END
    );
  EXCEPTION WHEN OTHERS THEN
    -- The decision stands even if the notice cannot be written.
    RAISE WARNING 'ownership notice failed for request %: %', v_row.id, SQLERRM;
  END;

  RETURN json_build_object(
    'id', v_row.id,
    'status', v_target,
    'owner_id', v_row.owner_id,
    'property_id', v_row.property_id,
    'service_id', v_row.service_id,
    'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ownership_contract_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH tables AS (
    SELECT c.oid, c.relname, c.relrowsecurity, c.relacl, c.relowner
    FROM pg_catalog.pg_class c
    WHERE c.oid IN (
      'public.ownership_verification_documents'::regclass,
      'public.ownership_verifications'::regclass
    )
  ),
  grants AS (
    -- Table-level grants to the client roles and PUBLIC (grantee 0).
    SELECT t.relname AS table_name,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
           a.privilege_type AS privilege,
           NULL::text AS column_name
    FROM tables t
    CROSS JOIN LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
    LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
    WHERE a.grantee = 0 OR r.rolname IN ('anon', 'authenticated')
    UNION ALL
    -- Column-level grants.
    SELECT t.relname,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END,
           a.privilege_type,
           att.attname::text
    FROM tables t
    JOIN pg_catalog.pg_attribute att
      ON att.attrelid = t.oid AND att.attnum > 0 AND NOT att.attisdropped
    CROSS JOIN LATERAL aclexplode(att.attacl) a
    LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
    WHERE att.attacl IS NOT NULL
      AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
  )
  SELECT jsonb_build_object(
    'bucket', (
      SELECT jsonb_build_object(
        'public', b.public,
        'file_size_limit', b.file_size_limit,
        'allowed_mime_types', to_jsonb(b.allowed_mime_types)
      )
      FROM storage.buckets b
      WHERE b.id = 'ownership-documents'
    ),
    'policies_mentioning_bucket', coalesce((
      SELECT jsonb_agg(p.policyname::text ORDER BY p.policyname)
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
        AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%ownership-documents%'
    ), '[]'::jsonb),
    'policies_without_bucket_test', coalesce((
      SELECT jsonb_agg(p.policyname::text ORDER BY p.policyname)
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
        AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) NOT LIKE '%bucket_id%'
    ), '[]'::jsonb),
    'client_grants', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'table', g.table_name,
          'grantee', g.grantee,
          'privilege', g.privilege,
          'column', g.column_name
        )
        ORDER BY g.table_name, g.grantee, g.privilege, g.column_name
      )
      FROM grants g
    ), '[]'::jsonb),
    'rls', (
      SELECT jsonb_object_agg(t.relname, t.relrowsecurity) FROM tables t
    ),
    'checks', (
      SELECT jsonb_object_agg(con.conname, pg_get_constraintdef(con.oid))
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid IN (SELECT t.oid FROM tables t)
        AND con.contype = 'c'
    ),
    'triggers', coalesce((
      SELECT jsonb_object_agg(tg.tgname, tg.tgenabled::text)
      FROM pg_catalog.pg_trigger tg
      WHERE NOT tg.tgisinternal
        AND tg.tgname IN (
          'ownership_close_on_property_basis_change',
          'ownership_close_on_service_basis_change',
          'ownership_documents_enforce_limit'
        )
    ), '{}'::jsonb),
    -- What each basis trigger watches: its table, its UPDATE OF column list
    -- and its value-comparing WHEN (C39), so check-db-contracts can tell a
    -- trigger that fires on every edit from one that never fires.
    'basis_trigger_defs', coalesce((
      SELECT jsonb_object_agg(
        tg.tgname,
        jsonb_build_object(
          'table', tg.tgrelid::regclass::text,
          'enabled', tg.tgenabled::text,
          'def', pg_get_triggerdef(tg.oid)
        )
      )
      FROM pg_catalog.pg_trigger tg
      WHERE NOT tg.tgisinternal
        AND tg.tgname IN (
          'ownership_close_on_property_basis_change',
          'ownership_close_on_service_basis_change'
        )
    ), '{}'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.review_ownership_verification(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_ownership_verification(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.ownership_contract_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ownership_contract_snapshot() TO service_role;

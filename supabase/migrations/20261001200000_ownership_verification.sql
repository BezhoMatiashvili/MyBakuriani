-- 20261001200000_ownership_verification.sql
--
-- Ownership verification ("მესაკუთრეობის დადასტურება", contract C39).
--
-- A listing owner uploads, per listing, an extract from the Public Registry
-- and, once per submission, an ID card or passport. An admin approves,
-- rejects or later revokes each listing. Approved listings carry a badge on
-- every public card and detail page (public_*.ownership_verified, added by
-- 20261001200100).
--
--   * Bucket `ownership-documents`: private, no storage.objects policies.
--     Browsers never touch it: service-role API routes upload, an admin views
--     a file through a 60 s signed URL, src/lib/ownership/purge.ts deletes.
--   * ownership_verification_documents: one row per uploaded file.
--   * ownership_verifications: one row per listing per request.
--   * Basis triggers on properties/services: a change to what the extract
--     proved (a property's owner, cadastral code, address or map pin; a
--     service's owner, title, provider name or category) closes the live
--     request, so `status` is always the truth and the badge needs no
--     snapshot comparison.
--   * service_role RPCs: submit, review, discard, purge claim, and the
--     contract snapshot that scripts/check-db-contracts.mjs reads (C39).
--
-- Lock order on every path is listing row -> verification row: a listing
-- UPDATE holds the listing row when its trigger touches verification rows;
-- submit locks its listings FOR SHARE before inserting; review locks only the
-- verification row. Uploads, submits, discards and purge claims of one owner
-- serialize on one advisory key ('ownership-owner:' || owner_id).

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ownership-documents',
  'ownership-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

CREATE TABLE public.ownership_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL: deleting an account must not erase the trail of what was
  -- uploaded; ownerless rows are purged at once.
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The upload route never deletes a row after an upload attempt (a timed-out
  -- write can still land); it stamps this instead, and the purge removes the
  -- object if it exists.
  upload_failed_at timestamptz,
  -- "Replace" on the owner page.
  discarded_at timestamptz,
  -- Set under the owner lock before the object is removed (see the claim RPC).
  purge_claimed_at timestamptz,
  purged_at timestamptz,
  CONSTRAINT ownership_verification_documents_kind_check
    CHECK (kind IN ('identity', 'registry_extract')),
  CONSTRAINT ownership_verification_documents_content_type_check
    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT ownership_verification_documents_byte_size_check
    CHECK (byte_size BETWEEN 1 AND 10485760),
  CONSTRAINT ownership_verification_documents_path_check
    CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  CONSTRAINT ownership_verification_documents_storage_path_key UNIQUE (storage_path)
);

CREATE INDEX ownership_verification_documents_owner_idx
  ON public.ownership_verification_documents (owner_id, created_at DESC);
CREATE INDEX ownership_verification_documents_unpurged_idx
  ON public.ownership_verification_documents (created_at) WHERE purged_at IS NULL;

ALTER TABLE public.ownership_verification_documents ENABLE ROW LEVEL SECURITY;

-- Service role only: no client role reads or writes document rows.
REVOKE ALL ON public.ownership_verification_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_verification_documents TO service_role;

-- The rate limiter fails open by design (C16), so this cap is the hard bound
-- on what one owner can park in the bucket: 50 listings + 1 ID fit under it.
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
  ) >= 60 THEN
    RAISE EXCEPTION 'OWNERSHIP_DOCUMENT_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ownership_documents_enforce_limit
  BEFORE INSERT ON public.ownership_verification_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ownership_document_limit();

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

CREATE TABLE public.ownership_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  identity_document_id uuid NOT NULL
    REFERENCES public.ownership_verification_documents(id),
  registry_extract_document_id uuid NOT NULL
    REFERENCES public.ownership_verification_documents(id),
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- C9: exactly one listing reference (there is no listings table).
  CONSTRAINT ownership_verifications_exactly_one_ref CHECK (
    (property_id IS NOT NULL)::int + (service_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT ownership_verifications_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  CONSTRAINT ownership_verifications_note_length
    CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  -- Written as NOT IN so it renders as "<> ALL" and the contract snapshot's
  -- "= ANY" scan sees only the status list above.
  CONSTRAINT ownership_verifications_note_required CHECK (
    status NOT IN ('rejected', 'revoked')
    OR (decision_note IS NOT NULL AND btrim(decision_note) <> '')
  )
);

-- One live (pending or approved) request per listing.
CREATE UNIQUE INDEX ownership_verifications_live_property_key
  ON public.ownership_verifications (property_id)
  WHERE property_id IS NOT NULL AND status IN ('pending', 'approved');
CREATE UNIQUE INDEX ownership_verifications_live_service_key
  ON public.ownership_verifications (service_id)
  WHERE service_id IS NOT NULL AND status IN ('pending', 'approved');
-- FK-side indexes so deleting a listing cascades without a sequential scan
-- (decided rows are kept, so the partial unique indexes do not cover them).
CREATE INDEX ownership_verifications_property_idx
  ON public.ownership_verifications (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX ownership_verifications_service_idx
  ON public.ownership_verifications (service_id) WHERE service_id IS NOT NULL;
CREATE INDEX ownership_verifications_owner_idx
  ON public.ownership_verifications (owner_id, created_at DESC);
CREATE INDEX ownership_verifications_submission_idx
  ON public.ownership_verifications (submission_id);
CREATE INDEX ownership_verifications_pending_idx
  ON public.ownership_verifications (created_at) WHERE status = 'pending';
CREATE INDEX ownership_verifications_identity_document_idx
  ON public.ownership_verifications (identity_document_id);
CREATE INDEX ownership_verifications_extract_document_idx
  ON public.ownership_verifications (registry_extract_document_id);

ALTER TABLE public.ownership_verifications ENABLE ROW LEVEL SECURITY;

-- Owners read their own requests (owner page, cabinet chips) through a
-- column grant: not who reviewed them, not the document ids. No client writes:
-- every change goes through the service-role RPCs below.
REVOKE ALL ON public.ownership_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, submission_id, owner_id, property_id, service_id, status,
  decision_note, reviewed_at, created_at, updated_at
) ON public.ownership_verifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_verifications TO service_role;

CREATE POLICY "owners read own ownership verifications"
  ON public.ownership_verifications FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

-- Approve -> revoke history with the acting admin (x-actor-id).
CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.ownership_verifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Owner notices
-- ---------------------------------------------------------------------------

-- One generic notice per decision. The SMS mirror texts only the title, so
-- titles never name a listing or a reason; the owner page shows the details.
-- Coalesced like _notify_admins: while an identical notice is still unread,
-- the page it links to already shows every outcome.
CREATE OR REPLACE FUNCTION public._notify_ownership_owner(
  p_owner_id uuid,
  p_property_id uuid,
  p_service_id uuid,
  p_title text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scope text;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN;
  END IF;
  -- C19: always an explicit cabinet scope.
  v_scope := public.dashboard_scope_for_listing(p_property_id, p_service_id, p_owner_id);

  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = p_owner_id
      AND n.type = 'verification'
      AND n.title = p_title
      AND n.action_url = '/dashboard/account/ownership'
      AND n.dashboard_scope IS NOT DISTINCT FROM v_scope
      AND n.is_read = false
  ) THEN
    RETURN;
  END IF;

  PERFORM public._notify(
    p_owner_id,
    'verification',
    p_title,
    p_message,
    '/dashboard/account/ownership',
    v_scope
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Basis triggers (one function per table: the columns differ)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_ownership_on_property_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revoked integer := 0;
  v_rejected integer := 0;
BEGIN
  WITH closed AS (
    UPDATE public.ownership_verifications v
       SET status = CASE v.status WHEN 'approved' THEN 'revoked' ELSE 'rejected' END,
           decision_note = 'მონაცემები შეიცვალა',
           reviewed_by = NULL,
           reviewed_at = now(),
           updated_at = now()
     WHERE v.property_id = NEW.id
       AND v.status IN ('pending', 'approved')
    RETURNING v.status
  )
  SELECT count(*) FILTER (WHERE closed.status = 'revoked'),
         count(*) FILTER (WHERE closed.status = 'rejected')
    INTO v_revoked, v_rejected
  FROM closed;

  -- An owner change is an admin action; the previous owner is not told.
  IF v_revoked + v_rejected > 0 AND OLD.owner_id IS NOT DISTINCT FROM NEW.owner_id THEN
    BEGIN
      PERFORM public._notify_ownership_owner(
        NEW.owner_id,
        NEW.id,
        NULL,
        CASE WHEN v_revoked > 0
          THEN 'მესაკუთრეობის დადასტურება გაუქმდა'
          ELSE 'მესაკუთრეობის დადასტურება: მოთხოვნა განხილულია'
        END,
        'განცხადების მონაცემები შეიცვალა, ამიტომ მესაკუთრეობა ხელახლა უნდა დადასტურდეს. დეტალები იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“.'
      );
    EXCEPTION WHEN OTHERS THEN
      -- A notice must never fail the listing update itself.
      RAISE WARNING 'ownership notice failed for property %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_ownership_on_service_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revoked integer := 0;
  v_rejected integer := 0;
BEGIN
  WITH closed AS (
    UPDATE public.ownership_verifications v
       SET status = CASE v.status WHEN 'approved' THEN 'revoked' ELSE 'rejected' END,
           decision_note = 'მონაცემები შეიცვალა',
           reviewed_by = NULL,
           reviewed_at = now(),
           updated_at = now()
     WHERE v.service_id = NEW.id
       AND v.status IN ('pending', 'approved')
    RETURNING v.status
  )
  SELECT count(*) FILTER (WHERE closed.status = 'revoked'),
         count(*) FILTER (WHERE closed.status = 'rejected')
    INTO v_revoked, v_rejected
  FROM closed;

  IF v_revoked + v_rejected > 0 AND OLD.owner_id IS NOT DISTINCT FROM NEW.owner_id THEN
    BEGIN
      PERFORM public._notify_ownership_owner(
        NEW.owner_id,
        NULL,
        NEW.id,
        CASE WHEN v_revoked > 0
          THEN 'მესაკუთრეობის დადასტურება გაუქმდა'
          ELSE 'მესაკუთრეობის დადასტურება: მოთხოვნა განხილულია'
        END,
        'განცხადების მონაცემები შეიცვალა, ამიტომ მესაკუთრეობა ხელახლა უნდა დადასტურდეს. დეტალები იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“.'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ownership notice failed for service %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

-- The WHEN clauses compare values: content-change approval and
-- /api/admin/listings/update rewrite every reviewable column, so a column list
-- alone would close the request on every description or photo edit.
CREATE TRIGGER ownership_close_on_property_basis_change
  AFTER UPDATE OF owner_id, cadastral_code, location, location_lat, location_lng
  ON public.properties
  FOR EACH ROW
  WHEN (
    OLD.owner_id IS DISTINCT FROM NEW.owner_id
    OR nullif(btrim(OLD.cadastral_code), '') IS DISTINCT FROM nullif(btrim(NEW.cadastral_code), '')
    OR btrim(OLD.location) IS DISTINCT FROM btrim(NEW.location)
    OR OLD.location_lat IS DISTINCT FROM NEW.location_lat
    OR OLD.location_lng IS DISTINCT FROM NEW.location_lng
  )
  EXECUTE FUNCTION public.close_ownership_on_property_change();

CREATE TRIGGER ownership_close_on_service_basis_change
  AFTER UPDATE OF owner_id, title, provider_name, category
  ON public.services
  FOR EACH ROW
  WHEN (
    OLD.owner_id IS DISTINCT FROM NEW.owner_id
    OR btrim(OLD.title) IS DISTINCT FROM btrim(NEW.title)
    OR nullif(btrim(OLD.provider_name), '') IS DISTINCT FROM nullif(btrim(NEW.provider_name), '')
    OR OLD.category IS DISTINCT FROM NEW.category
  )
  EXECUTE FUNCTION public.close_ownership_on_service_change();

-- ---------------------------------------------------------------------------
-- Submit
-- ---------------------------------------------------------------------------

-- p_items: [{ "kind": "property" | "service", "id": uuid, "document_id": uuid }]
CREATE OR REPLACE FUNCTION public.submit_ownership_verifications(
  p_owner_id uuid,
  p_identity_document_id uuid,
  p_items jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission uuid := gen_random_uuid();
  v_count integer;
  v_bad integer;
  v_distinct integer;
  v_found integer;
  v_property_ids uuid[];
  v_service_ids uuid[];
BEGIN
  IF p_owner_id IS NULL
     OR p_identity_document_id IS NULL
     OR p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'OWNERSHIP_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 50 THEN
    RAISE EXCEPTION 'OWNERSHIP_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT
    coalesce(array_agg(x.id) FILTER (WHERE x.kind = 'property'), '{}'),
    coalesce(array_agg(x.id) FILTER (WHERE x.kind = 'service'), '{}'),
    count(*) FILTER (
      WHERE x.kind IS NULL OR x.kind NOT IN ('property', 'service')
         OR x.id IS NULL OR x.document_id IS NULL
    ),
    count(DISTINCT (x.kind, x.id))
  INTO v_property_ids, v_service_ids, v_bad, v_distinct
  FROM jsonb_to_recordset(p_items) AS x(kind text, id uuid, document_id uuid);

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'OWNERSHIP_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_distinct <> v_count THEN
    RAISE EXCEPTION 'OWNERSHIP_REQUEST_EXISTS' USING ERRCODE = '23505';
  END IF;

  -- Uploads, discards and purge claims of this owner wait for this one.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('ownership-owner:' || p_owner_id::text, 0)
  );

  -- FOR SHARE: a concurrent basis change waits for this commit, and its
  -- trigger then closes the request this call inserts.
  SELECT count(*) INTO v_found
  FROM (
    SELECT p.id
    FROM public.properties p
    WHERE p.id = ANY (v_property_ids)
      AND p.owner_id = p_owner_id
      AND p.status <> 'blocked'
    ORDER BY p.id
    FOR SHARE
  ) locked;
  IF v_found <> cardinality(v_property_ids) THEN
    -- Same answer for "not yours".
    RAISE EXCEPTION 'OWNERSHIP_LISTING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_found
  FROM (
    SELECT s.id
    FROM public.services s
    WHERE s.id = ANY (v_service_ids)
      AND s.owner_id = p_owner_id
      AND s.status <> 'blocked'
    ORDER BY s.id
    FOR SHARE
  ) locked;
  IF v_found <> cardinality(v_service_ids) THEN
    RAISE EXCEPTION 'OWNERSHIP_LISTING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- A usable document: this owner's, the right kind, not failed, discarded,
  -- claimed or purged, under 23 h old, and used by no decided request. The
  -- purge takes only documents over 24 h old or used solely by decided
  -- requests, so whatever it can take, this refuses.
  IF NOT EXISTS (
    SELECT 1
    FROM public.ownership_verification_documents d
    WHERE d.id = p_identity_document_id
      AND d.owner_id = p_owner_id
      AND d.kind = 'identity'
      AND d.upload_failed_at IS NULL
      AND d.discarded_at IS NULL
      AND d.purge_claimed_at IS NULL
      AND d.purged_at IS NULL
      AND d.created_at > now() - interval '23 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM public.ownership_verifications v
        WHERE v.status <> 'pending'
          AND (v.identity_document_id = d.id OR v.registry_extract_document_id = d.id)
      )
  ) THEN
    RAISE EXCEPTION 'OWNERSHIP_DOCUMENT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad
  FROM jsonb_to_recordset(p_items) AS x(kind text, id uuid, document_id uuid)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.ownership_verification_documents d
    WHERE d.id = x.document_id
      AND d.owner_id = p_owner_id
      AND d.kind = 'registry_extract'
      AND d.upload_failed_at IS NULL
      AND d.discarded_at IS NULL
      AND d.purge_claimed_at IS NULL
      AND d.purged_at IS NULL
      AND d.created_at > now() - interval '23 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM public.ownership_verifications v
        WHERE v.status <> 'pending'
          AND (v.identity_document_id = d.id OR v.registry_extract_document_id = d.id)
      )
  );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'OWNERSHIP_DOCUMENT_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Each property has its own registry extract, so a property item's extract
  -- appears on no other item and on no earlier request. Service listings of
  -- one business may share an extract, but never with a property.
  SELECT count(*) INTO v_bad
  FROM jsonb_to_recordset(p_items) AS x(kind text, id uuid, document_id uuid)
  WHERE (
      x.kind = 'property'
      AND (
        (
          SELECT count(*)
          FROM jsonb_to_recordset(p_items) AS y(kind text, id uuid, document_id uuid)
          WHERE y.document_id = x.document_id
        ) > 1
        OR EXISTS (
          SELECT 1 FROM public.ownership_verifications v
          WHERE v.registry_extract_document_id = x.document_id
        )
      )
    )
    OR (
      x.kind = 'service'
      AND EXISTS (
        SELECT 1 FROM public.ownership_verifications v
        WHERE v.registry_extract_document_id = x.document_id
          AND v.property_id IS NOT NULL
      )
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'OWNERSHIP_EXTRACT_SHARED' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ownership_verifications v
    WHERE v.status IN ('pending', 'approved')
      AND (v.property_id = ANY (v_property_ids) OR v.service_id = ANY (v_service_ids))
  ) THEN
    RAISE EXCEPTION 'OWNERSHIP_REQUEST_EXISTS' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.ownership_verifications (
    submission_id, owner_id, property_id, service_id,
    identity_document_id, registry_extract_document_id
  )
  SELECT
    v_submission,
    p_owner_id,
    CASE WHEN x.kind = 'property' THEN x.id END,
    CASE WHEN x.kind = 'service' THEN x.id END,
    p_identity_document_id,
    x.document_id
  FROM jsonb_to_recordset(p_items) AS x(kind text, id uuid, document_id uuid);

  PERFORM public._notify_admins(
    'admin_ownership_pending',
    'მესაკუთრეობის დადასტურება: ახალი მოთხოვნა',
    'მესაკუთრემ დოკუმენტები გამოგზავნა ' || v_count || ' განცხადებისთვის.',
    '/dashboard/admin/verifications?tab=ownership',
    p_owner_id
  );

  RETURN json_build_object('submission_id', v_submission, 'count', v_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.review_ownership_verification(
  p_verification_id uuid,
  p_admin_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- ---------------------------------------------------------------------------
-- Discard ("replace" on the owner page)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discard_ownership_document(
  p_owner_id uuid,
  p_document_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_owner_id IS NULL OR p_document_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('ownership-owner:' || p_owner_id::text, 0)
  );

  UPDATE public.ownership_verification_documents d
     SET discarded_at = now()
   WHERE d.id = p_document_id
     AND d.owner_id = p_owner_id
     AND d.discarded_at IS NULL
     AND d.purged_at IS NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.ownership_verifications v
       WHERE v.identity_document_id = d.id OR v.registry_extract_document_id = d.id
     );
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- Purge claim (the one definition of "safe to delete")
-- ---------------------------------------------------------------------------

-- Claims documents no pending request needs and that are ownerless,
-- discarded, failed over 15 min ago, older than 24 h, or used only by decided
-- requests. The claim runs under each owner's lock, so a submit that is still
-- referencing one of them either commits first (and the claim skips it) or
-- sees the claim and refuses it. purge.ts then removes the objects and stamps
-- purged_at; a claim left unstamped for 10 min is taken again.
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
          WHERE v.status = 'pending'
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
         WHERE v.status = 'pending'
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

-- ---------------------------------------------------------------------------
-- Contract snapshot (scripts/check-db-contracts.mjs, C39)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ownership_contract_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
    ), '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Function privileges (C34): nothing for PUBLIC, anon or authenticated
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.enforce_ownership_document_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._notify_ownership_owner(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_ownership_on_property_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_ownership_on_service_change() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_ownership_verifications(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ownership_verifications(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.review_ownership_verification(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_ownership_verification(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.discard_ownership_document(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_ownership_document(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_ownership_documents_for_purge(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ownership_documents_for_purge(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.ownership_contract_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ownership_contract_snapshot() TO service_role;

NOTIFY pgrst, 'reload schema';

-- Restaurants now discount specific menu items instead of the whole listing.
-- This introduces a real structured menu (service_menu_items) and retires the
-- flat, listing-wide food discount (request_kind='food_discount') in favor of
-- per-dish discounts, reusing the same paid + admin-approved mechanics as
-- before (see 20260804180000_food_discount_admin_review.sql), just re-targeted
-- at one menu item instead of the whole services row.

-- 1. Structured menu items ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  price numeric(10,2) NOT NULL CHECK (price >= 0 AND price < 100000),
  currency text NOT NULL DEFAULT 'GEL',
  photo_url text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  discount_percent integer NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 90),
  discount_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_menu_items_service_idx
  ON public.service_menu_items(service_id, sort_order);
CREATE INDEX IF NOT EXISTS service_menu_items_active_discount_idx
  ON public.service_menu_items(service_id)
  WHERE discount_percent > 0;

CREATE OR REPLACE FUNCTION public.set_service_menu_items_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS set_service_menu_items_updated_at ON public.service_menu_items;
CREATE TRIGGER set_service_menu_items_updated_at
  BEFORE UPDATE ON public.service_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_service_menu_items_updated_at();
REVOKE ALL ON FUNCTION public.set_service_menu_items_updated_at() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.service_menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners can view own menu items" ON public.service_menu_items;
CREATE POLICY "Owners can view own menu items"
  ON public.service_menu_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND s.owner_id = (select auth.uid())
    )
  );
-- No owner INSERT/UPDATE/DELETE policy: all writes go through the
-- self_service_* RPCs below (service_role, bypasses RLS by design), mirroring
-- self_service_set_cleaner_working_hours (20260801120000). Admin/service_role
-- already bypass RLS, same as the services table itself.

-- Only the approval RPC (service_role) may change the paid discount columns,
-- even though the CRUD RPCs above already run as service_role -- belt and
-- suspenders against a future CRUD-RPC bug touching these two fields.
CREATE OR REPLACE FUNCTION public.prevent_menu_item_protected_field_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.discount_percent IS NOT DISTINCT FROM OLD.discount_percent
     AND NEW.discount_expires_at IS NOT DISTINCT FROM OLD.discount_expires_at THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'menu_item_discount_fields_are_admin_managed' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_menu_item_protected_field_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_menu_item_protected_field_change ON public.service_menu_items;
CREATE TRIGGER prevent_menu_item_protected_field_change
  BEFORE UPDATE ON public.service_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_menu_item_protected_field_change();

-- Public read model: unavailable items and items of non-active listings never
-- appear, mirroring public_services' own status='active' filter.
CREATE OR REPLACE VIEW public.public_service_menu_items
WITH (security_invoker = false) AS
SELECT mi.id, mi.service_id, mi.name, mi.description, mi.price, mi.currency,
       mi.photo_url, mi.sort_order, mi.discount_percent, mi.discount_expires_at,
       (coalesce(mi.discount_percent, 0) > 0
        AND (mi.discount_expires_at IS NULL OR mi.discount_expires_at > now())
       ) AS has_active_discount
FROM public.service_menu_items mi
JOIN public.services s ON s.id = mi.service_id
WHERE s.status = 'active' AND mi.is_available = true;

REVOKE ALL ON public.public_service_menu_items FROM PUBLIC;
GRANT SELECT ON public.public_service_menu_items TO anon, authenticated;

-- 2. content_change_requests gains item-level targeting ---------------------

ALTER TABLE public.content_change_requests
  ADD COLUMN IF NOT EXISTS target_menu_item_id uuid
    REFERENCES public.service_menu_items(id) ON DELETE SET NULL;

ALTER TABLE public.content_change_requests
  DROP CONSTRAINT IF EXISTS content_change_request_kind_check;
ALTER TABLE public.content_change_requests
  ADD CONSTRAINT content_change_request_kind_check
    CHECK (request_kind IN ('content', 'food_discount', 'menu_item_discount'));

-- target_type stays 'service' (not the item) so every existing generic code
-- path (cache revalidation, the reject-notification dashboard-scope lookup)
-- keeps working unchanged; target_menu_item_id is the orthogonal item link.
ALTER TABLE public.content_change_requests
  DROP CONSTRAINT IF EXISTS content_change_menu_item_discount_target_check;
ALTER TABLE public.content_change_requests
  ADD CONSTRAINT content_change_menu_item_discount_target_check CHECK (
    request_kind <> 'menu_item_discount'
    OR (
      target_type = 'service'
      AND target_menu_item_id IS NOT NULL
      AND quoted_amount_gel IS NOT NULL AND quoted_amount_gel >= 0
      AND quoted_duration_hours IS NOT NULL AND quoted_duration_hours > 0
      AND pricing_package_id IS NOT NULL
    )
  );

-- 'content'/'food_discount' keep one-pending-per-target; 'menu_item_discount'
-- gets its own per-item uniqueness so two different dishes on the same
-- restaurant can each carry an independent pending request.
DROP INDEX IF EXISTS public.content_change_one_pending_target_kind;
CREATE UNIQUE INDEX IF NOT EXISTS content_change_one_pending_target_kind
  ON public.content_change_requests(target_type, target_id, request_kind)
  WHERE status = 'pending' AND request_kind <> 'menu_item_discount';
CREATE UNIQUE INDEX IF NOT EXISTS content_change_one_pending_menu_item_discount
  ON public.content_change_requests(target_menu_item_id)
  WHERE status = 'pending' AND request_kind = 'menu_item_discount';

-- Only the specialised approval RPC for the matching kind may transition a
-- food-discount or menu-item-discount request to approved -- prevents the
-- generic editorial RPC from marking either kind paid without charging/writing.
CREATE OR REPLACE FUNCTION public.guard_food_discount_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    IF OLD.request_kind = 'food_discount'
       AND coalesce(current_setting('mybakuriani.food_discount_approval', true), '') <> OLD.id::text THEN
      RAISE EXCEPTION 'specialized_food_discount_approval_required' USING ERRCODE = '42501';
    END IF;
    IF OLD.request_kind = 'menu_item_discount'
       AND coalesce(current_setting('mybakuriani.menu_item_discount_approval', true), '') <> OLD.id::text THEN
      RAISE EXCEPTION 'specialized_menu_item_discount_approval_required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- trigger object already exists and is attached to content_change_requests
-- (created by 20260804180000); only the function body changes here.

-- 3. Discount request/approval RPCs, targeting one menu item ----------------

CREATE OR REPLACE FUNCTION public.submit_menu_item_discount_request(
  p_requester_id uuid,
  p_menu_item_id uuid,
  p_package_id uuid,
  p_discount_percent integer,
  p_quantity integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_item public.service_menu_items%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_package public.pricing_packages%ROWTYPE;
  v_balance numeric := 0;
  v_duration integer;
  v_amount numeric;
  v_request public.content_change_requests%ROWTYPE;
BEGIN
  IF p_requester_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_discount_percent IS NULL OR p_discount_percent < 1 OR p_discount_percent > 90 THEN
    RAISE EXCEPTION 'invalid_discount_percent' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 365 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.service_menu_items
  WHERE id = p_menu_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_service FROM public.services
  WHERE id = v_item.service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_service.owner_id <> p_requester_id THEN
    RAISE EXCEPTION 'service_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_service.category <> 'food' OR v_service.status <> 'active' THEN
    RAISE EXCEPTION 'active_food_service_required' USING ERRCODE = '22023';
  END IF;
  IF NOT v_item.is_available THEN
    RAISE EXCEPTION 'menu_item_unavailable' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_package FROM public.pricing_packages
  WHERE id = p_package_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_package.is_enabled
     OR v_package.category <> 'vip'
     OR coalesce(v_package.meta ->> 'tier', '') <> 'discount' THEN
    RAISE EXCEPTION 'discount_package_required' USING ERRCODE = '22023';
  END IF;
  v_duration := coalesce(nullif(v_package.meta ->> 'duration_hours', '')::integer, 24) * p_quantity;
  IF v_duration < 1 OR v_duration > 8760 THEN
    RAISE EXCEPTION 'invalid_package_duration' USING ERRCODE = '22023';
  END IF;
  v_amount := v_package.amount_gel * p_quantity;

  SELECT coalesce(amount, 0) INTO v_balance
  FROM public.balances WHERE user_id = p_requester_id;
  IF v_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
  FROM public.content_change_requests
  WHERE request_kind = 'menu_item_discount'
    AND target_menu_item_id = p_menu_item_id
    AND status = 'pending'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.content_change_requests SET
      requester_id = p_requester_id,
      before_snapshot = jsonb_build_object(
        'discount_percent', v_item.discount_percent,
        'discount_expires_at', v_item.discount_expires_at
      ),
      proposed_values = jsonb_build_object('discount_percent', p_discount_percent),
      field_diff = jsonb_build_object(
        'discount_percent', jsonb_build_object(
          'before', v_item.discount_percent,
          'after', p_discount_percent
        )
      ),
      pricing_package_id = v_package.id,
      quoted_amount_gel = v_amount,
      quoted_duration_hours = v_duration,
      payment_error = null,
      request_metadata = jsonb_build_object('menu_item_name', v_item.name, 'menu_item_price', v_item.price)
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.content_change_requests (
      requester_id, target_type, target_id, target_menu_item_id, request_kind,
      before_snapshot, proposed_values, field_diff,
      pricing_package_id, quoted_amount_gel, quoted_duration_hours, request_metadata
    ) VALUES (
      p_requester_id, 'service', v_service.id, v_item.id, 'menu_item_discount',
      jsonb_build_object(
        'discount_percent', v_item.discount_percent,
        'discount_expires_at', v_item.discount_expires_at
      ),
      jsonb_build_object('discount_percent', p_discount_percent),
      jsonb_build_object(
        'discount_percent', jsonb_build_object(
          'before', v_item.discount_percent,
          'after', p_discount_percent
        )
      ),
      v_package.id, v_amount, v_duration,
      jsonb_build_object('menu_item_name', v_item.name, 'menu_item_price', v_item.price)
    ) RETURNING * INTO v_request;
  END IF;

  RETURN jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'menu_item_id', v_item.id,
    'discount_percent', p_discount_percent,
    'quoted_amount_gel', v_amount,
    'quoted_duration_hours', v_duration,
    'created_at', v_request.created_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_menu_item_discount_request(uuid,uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_menu_item_discount_request(uuid,uuid,uuid,integer,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.approve_menu_item_discount_request(
  p_request_id uuid,
  p_admin_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  r public.content_change_requests%ROWTYPE;
  v_item public.service_menu_items%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_balance numeric;
  v_percent integer;
  v_expires_at timestamptz;
  v_notify_payment_issue boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.content_change_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending' USING ERRCODE = 'P0001'; END IF;
  IF r.request_kind <> 'menu_item_discount' THEN
    RAISE EXCEPTION 'menu_item_discount_request_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.service_menu_items WHERE id = r.target_menu_item_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.content_change_requests SET
      status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now(),
      rejection_reason = 'target_menu_item_missing'
    WHERE id = r.id;
    RETURN jsonb_build_object('status', 'superseded', 'reason', 'target_menu_item_missing');
  END IF;

  SELECT * INTO v_service FROM public.services WHERE id = v_item.service_id FOR UPDATE;
  IF NOT FOUND OR v_service.owner_id <> r.requester_id THEN
    UPDATE public.content_change_requests SET
      status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now(),
      rejection_reason = 'target_missing_or_owner_changed'
    WHERE id = r.id;
    RETURN jsonb_build_object('status', 'superseded', 'reason', 'target_missing_or_owner_changed');
  END IF;
  IF v_service.category <> 'food' OR v_service.status <> 'active' OR NOT v_item.is_available THEN
    UPDATE public.content_change_requests SET
      status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now(),
      rejection_reason = 'active_food_service_required'
    WHERE id = r.id;
    RETURN jsonb_build_object('status', 'superseded', 'reason', 'active_food_service_required');
  END IF;
  IF (r.before_snapshot -> 'discount_percent') IS DISTINCT FROM coalesce(to_jsonb(v_item.discount_percent), 'null'::jsonb)
     OR (r.before_snapshot -> 'discount_expires_at') IS DISTINCT FROM coalesce(to_jsonb(v_item.discount_expires_at), 'null'::jsonb) THEN
    UPDATE public.content_change_requests SET
      status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now(),
      rejection_reason = 'stale_discount_state'
    WHERE id = r.id;
    INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
    VALUES (r.requester_id,'content_change_superseded','ფასდაკლების მოთხოვნა ვადაგასულია',
      'კერძის ფასდაკლების მდგომარეობა შეიცვალა. გთხოვთ, მოთხოვნა ხელახლა გაგზავნოთ.',
      '/dashboard/food/orders','food');
    RETURN jsonb_build_object('status', 'superseded', 'reason', 'stale_discount_state');
  END IF;

  v_percent := nullif(r.proposed_values ->> 'discount_percent', '')::integer;
  IF v_percent IS NULL OR v_percent < 1 OR v_percent > 90
     OR r.quoted_amount_gel IS NULL OR r.quoted_amount_gel < 0
     OR r.quoted_duration_hours IS NULL OR r.quoted_duration_hours < 1 THEN
    RAISE EXCEPTION 'invalid_discount_request' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.balances(user_id, amount, sms_remaining)
  VALUES (r.requester_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT amount INTO v_balance FROM public.balances
  WHERE user_id = r.requester_id FOR UPDATE;
  IF v_balance < r.quoted_amount_gel THEN
    v_notify_payment_issue := r.payment_error IS DISTINCT FROM 'insufficient_balance';
    UPDATE public.content_change_requests
    SET payment_error = 'insufficient_balance'
    WHERE id = r.id;
    IF v_notify_payment_issue THEN
      INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
      VALUES (r.requester_id,'payment_required','ფასდაკლებისთვის ბალანსი არასაკმარისია',
        format('დასამტკიცებლად საჭიროა %s ₾. შეავსეთ ბალანსი და ადმინი შეძლებს მოთხოვნის ხელახლა დამტკიცებას.', r.quoted_amount_gel),
        '/dashboard/food/balance','food');
    END IF;
    RETURN jsonb_build_object(
      'status', 'payment_required',
      'reason', 'insufficient_balance',
      'required', r.quoted_amount_gel,
      'available', v_balance
    );
  END IF;

  v_expires_at := now() + make_interval(hours => r.quoted_duration_hours);
  UPDATE public.balances
  SET amount = amount - r.quoted_amount_gel, updated_at = now()
  WHERE user_id = r.requester_id;
  UPDATE public.service_menu_items
  SET discount_percent = v_percent,
      discount_expires_at = v_expires_at,
      updated_at = now()
  WHERE id = v_item.id;
  INSERT INTO public.transactions(user_id, amount, type, description, reference_id)
  VALUES (
    r.requester_id,
    -r.quoted_amount_gel,
    'discount_badge',
    format('კერძის ფასდაკლება: %s — %s%% (%s სთ)', v_item.name, v_percent, r.quoted_duration_hours),
    r.id
  );

  PERFORM set_config('mybakuriani.menu_item_discount_approval', r.id::text, true);
  UPDATE public.content_change_requests SET
    status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(),
    rejection_reason = null, payment_error = null
  WHERE id = r.id;
  INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
  VALUES (r.requester_id,'content_change_approved','კერძის ფასდაკლება დამტკიცდა',
    format('%s — %s%% ფასდაკლება გააქტიურდა %s საათით.', v_item.name, v_percent, r.quoted_duration_hours),
    '/dashboard/food/orders','food');

  RETURN jsonb_build_object(
    'status', 'approved',
    'target_type', 'service',
    'target_id', v_service.id,
    'menu_item_id', v_item.id,
    'discount_percent', v_percent,
    'expires_at', v_expires_at,
    'charged', r.quoted_amount_gel
  );
END;
$$;
REVOKE ALL ON FUNCTION public.approve_menu_item_discount_request(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_menu_item_discount_request(uuid,uuid)
  TO service_role;

-- 4. Self-service menu-item CRUD (immediate, not review-gated -- see plan) --

CREATE OR REPLACE FUNCTION public.self_service_create_menu_item(
  p_actor_id uuid,
  p_service_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_photo_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_service public.services%ROWTYPE;
  v_name text;
  v_description text;
  v_next_sort integer;
  v_item public.service_menu_items%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_service_id IS NULL THEN
    RAISE EXCEPTION 'invalid_menu_item_payload' USING ERRCODE = '22023';
  END IF;
  v_name := btrim(coalesce(p_name, ''));
  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_menu_item_name' USING ERRCODE = '22023';
  END IF;
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'invalid_menu_item_description' USING ERRCODE = '22023';
  END IF;
  IF p_price IS NULL OR p_price < 0 OR p_price >= 100000 THEN
    RAISE EXCEPTION 'invalid_menu_item_price' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_service FROM public.services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_service.owner_id <> p_actor_id THEN
    RAISE EXCEPTION 'service_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_service.category <> 'food' THEN
    RAISE EXCEPTION 'service_is_not_food' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(sort_order) + 1, 0) INTO v_next_sort
  FROM public.service_menu_items WHERE service_id = p_service_id;

  INSERT INTO public.service_menu_items (
    service_id, name, description, price, photo_url, sort_order
  ) VALUES (
    p_service_id, v_name, v_description, p_price,
    nullif(btrim(coalesce(p_photo_url, '')), ''), v_next_sort
  ) RETURNING * INTO v_item;

  RETURN to_jsonb(v_item);
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_create_menu_item(uuid,uuid,text,text,numeric,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_create_menu_item(uuid,uuid,text,text,numeric,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.self_service_update_menu_item(
  p_actor_id uuid,
  p_menu_item_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_photo_url text,
  p_is_available boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_item public.service_menu_items%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_name text;
  v_description text;
BEGIN
  IF p_actor_id IS NULL OR p_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_menu_item_payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.service_menu_items WHERE id = p_menu_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_service FROM public.services WHERE id = v_item.service_id FOR UPDATE;
  IF NOT FOUND OR v_service.owner_id <> p_actor_id THEN
    RAISE EXCEPTION 'service_forbidden' USING ERRCODE = '42501';
  END IF;

  v_name := btrim(coalesce(p_name, v_item.name));
  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_menu_item_name' USING ERRCODE = '22023';
  END IF;
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'invalid_menu_item_description' USING ERRCODE = '22023';
  END IF;
  IF p_price IS NULL OR p_price < 0 OR p_price >= 100000 THEN
    RAISE EXCEPTION 'invalid_menu_item_price' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_menu_items SET
    name = v_name,
    description = v_description,
    price = p_price,
    photo_url = nullif(btrim(coalesce(p_photo_url, '')), ''),
    is_available = coalesce(p_is_available, v_item.is_available),
    updated_at = now()
  WHERE id = p_menu_item_id
  RETURNING * INTO v_item;

  RETURN to_jsonb(v_item);
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_update_menu_item(uuid,uuid,text,text,numeric,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_update_menu_item(uuid,uuid,text,text,numeric,text,boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.self_service_delete_menu_item(
  p_actor_id uuid,
  p_menu_item_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_item public.service_menu_items%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_superseded_count integer;
BEGIN
  IF p_actor_id IS NULL OR p_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_menu_item_payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.service_menu_items WHERE id = p_menu_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_service FROM public.services WHERE id = v_item.service_id FOR UPDATE;
  IF NOT FOUND OR v_service.owner_id <> p_actor_id THEN
    RAISE EXCEPTION 'service_forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.content_change_requests SET
    status = 'superseded', reviewed_at = now(),
    rejection_reason = 'menu_item_deleted'
  WHERE target_menu_item_id = p_menu_item_id AND status = 'pending' AND request_kind = 'menu_item_discount';
  GET DIAGNOSTICS v_superseded_count = ROW_COUNT;

  IF v_superseded_count > 0 THEN
    INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
    VALUES (p_actor_id,'content_change_superseded','კერძი წაშლილია',
      format('%s წაშლილია — ფასდაკლების მოთხოვნა გაუქმდა.', v_item.name),
      '/dashboard/food/orders','food');
  END IF;

  DELETE FROM public.service_menu_items WHERE id = p_menu_item_id;

  RETURN jsonb_build_object('id', p_menu_item_id, 'deleted', true);
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_delete_menu_item(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_delete_menu_item(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.self_service_reorder_menu_items(
  p_actor_id uuid,
  p_service_id uuid,
  p_ordered_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_service public.services%ROWTYPE;
  v_id uuid;
  v_position integer := 0;
  v_count integer;
BEGIN
  IF p_actor_id IS NULL OR p_service_id IS NULL OR p_ordered_ids IS NULL THEN
    RAISE EXCEPTION 'invalid_menu_item_payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_service FROM public.services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_service.owner_id <> p_actor_id THEN
    RAISE EXCEPTION 'service_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count FROM public.service_menu_items WHERE service_id = p_service_id;
  IF v_count <> coalesce(array_length(p_ordered_ids, 1), 0) THEN
    RAISE EXCEPTION 'ordered_ids_mismatch' USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE public.service_menu_items
    SET sort_order = v_position, updated_at = now()
    WHERE id = v_id AND service_id = p_service_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_position := v_position + 1;
  END LOOP;

  RETURN jsonb_build_object('service_id', p_service_id, 'count', v_position);
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_reorder_menu_items(uuid,uuid,uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_reorder_menu_items(uuid,uuid,uuid[])
  TO service_role;

-- 5. Ship-time cutover --------------------------------------------------------

-- Any restaurant discount request still awaiting review cannot be approved
-- through a route that no longer exists in the app; supersede and notify
-- rather than strand it pending forever.
WITH superseded AS (
  UPDATE public.content_change_requests
  SET status = 'superseded', reviewed_at = now(),
      rejection_reason = 'flat_restaurant_discount_retired'
  WHERE status = 'pending' AND request_kind = 'food_discount'
  RETURNING requester_id
)
INSERT INTO public.notifications(user_id, type, title, message, action_url, dashboard_scope)
SELECT DISTINCT requester_id, 'content_change_superseded',
  'რესტორნის ფასდაკლების ფორმატი შეიცვალა',
  'ახლა ფასდაკლებას კონკრეტულ კერძზე დააქტიურებთ. გთხოვთ, მოთხოვნა ხელახლა გაგზავნოთ მენიუს გვერდიდან.',
  '/dashboard/food/orders', 'food'
FROM superseded;

-- The UI/API surface that explained and managed a whole-listing discount is
-- being removed in this same release; clear any active one immediately rather
-- than let it expire silently with nothing left to explain it.
UPDATE public.services
SET discount_percent = 0, discount_expires_at = null, updated_at = now()
WHERE category = 'food' AND coalesce(discount_percent, 0) > 0;

-- 6. public_services: food's has_active_discount now reflects menu items ----
-- (append-only per this view's own convention -- existing columns keep their
-- position; only has_active_discount's definition changes, plus one new
-- trailing column.)

CREATE OR REPLACE VIEW public.public_services
WITH (security_invoker = false) AS
SELECT s.id, s.category, s.title, s.description, s.price, s.price_unit, s.currency, s.photos,
       s.location, s.schedule, s.discount_percent, s.is_vip, s.views_count, s.driver_name,
       s.vehicle_capacity, s.route, s.cuisine_type, s.has_delivery, s.operating_hours, s.menu,
       s.position, s.salary_range, s.experience_required, s.employment_schedule, s.created_at,
       s.updated_at, s.is_new, s.avg_check, s.menu_url, s.has_kids_area, s.has_lounge,
       s.has_live_music, s.employment_type, s.work_schedule, s.salary_type, s.salary_min,
       s.salary_max, s.salary_daily, s.accommodation, s.meals, s.requirements, s.languages,
       s.service_field, s.provider_name, s.rating, s.reviews_count, s.safety_notes, s.activity_type,
       s.activity_category, s.duration, s.age_min, s.good_for, s.coords, s.restaurant_type,
       s.is_super_vip, s.vip_expires_at, s.menu_views_count, s.vehicle_color, s.features,
       s.route_pricing, s.discount_expires_at,
       p.display_name as profile_display_name, p.avatar_url as profile_avatar_url,
       p.is_verified as profile_is_verified,
       regexp_replace(coalesce(s.whatsapp, ''), '[^0-9]', '', 'g') ~ '^(995)?5[0-9]{8}$' as has_whatsapp,
       CASE WHEN s.category = 'food' THEN EXISTS (
         SELECT 1 FROM public.service_menu_items mi
         WHERE mi.service_id = s.id
           AND coalesce(mi.discount_percent, 0) > 0
           AND (mi.discount_expires_at IS NULL OR mi.discount_expires_at > now())
       )
       ELSE coalesce(s.discount_percent, 0) > 0
         AND (s.discount_expires_at IS NULL OR s.discount_expires_at > now())
       END as has_active_discount,
       s.vehicle_make, s.transport_type, s.routes, s.equipment,
       (SELECT max(mi.discount_percent) FROM public.service_menu_items mi
        WHERE mi.service_id = s.id
          AND coalesce(mi.discount_percent, 0) > 0
          AND (mi.discount_expires_at IS NULL OR mi.discount_expires_at > now())
       ) as best_active_menu_item_discount_percent
FROM public.services s
LEFT JOIN public.profiles p on p.id = s.owner_id
WHERE s.status = 'active';

REVOKE ALL ON public.public_services FROM PUBLIC;
GRANT SELECT ON public.public_services TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Organization RPCs. All SECURITY DEFINER with empty search_path + fully
-- schema-qualified names (matches 20260626121000_fix_function_search_path.sql).
-- The first three validate the caller via auth.uid() and are granted to
-- `authenticated` (callable directly from the browser client). The money RPC is
-- granted only to `service_role` and is invoked from the company-subscription
-- edge function after JWT validation (mirrors purchase_vip / purchase-vip).

-- ---------------------------------------------------------------------------
-- create_organization — owner registers a company (pending) + owner membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization(
  p_org_type text,
  p_legal_name text,
  p_identification_code text,
  p_brand_name text,
  p_company_type text,
  p_logo_url text DEFAULT NULL,
  p_cover_url text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ავტორიზაცია სავალდებულოა' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_legal_name), '') = '' OR coalesce(trim(p_brand_name), '') = '' THEN
    RAISE EXCEPTION 'სავალდებულო ველები არ არის შევსებული' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (
    owner_id, org_type, legal_name, identification_code, brand_name, company_type,
    logo_url, cover_url, phone, website, city, address, location_lat, location_lng, status
  ) VALUES (
    v_uid, p_org_type, trim(p_legal_name), trim(p_identification_code),
    trim(p_brand_name), p_company_type,
    p_logo_url, p_cover_url, p_phone, p_website, p_city, p_address, p_lat, p_lng, 'pending'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status, approved_at, approved_by)
  VALUES (v_org_id, v_uid, 'owner', 'approved', now(), v_uid);

  RETURN v_org_id;
END;
$$;
-- NOTE: Supabase default privileges grant EXECUTE to anon/authenticated on new
-- public functions, so REVOKE FROM PUBLIC alone is insufficient — revoke anon too.
REVOKE ALL ON FUNCTION public.create_organization(text,text,text,text,text,text,text,text,text,text,text,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text,text,text,text,text,text,text,text,text,text,text,double precision,double precision) TO authenticated;

-- ---------------------------------------------------------------------------
-- request_organization_membership — a user asks to join a company as an agent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_organization_membership(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_brand text;
  v_member_id uuid;
  v_existing_status text;
  v_requester_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ავტორიზაცია სავალდებულოა' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id, brand_name INTO v_owner, v_brand
  FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'კომპანია ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner = v_uid THEN
    RAISE EXCEPTION 'თქვენ უკვე ხართ ამ კომპანიის მფლობელი' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_member_id, v_existing_status
  FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = v_uid;

  IF FOUND THEN
    IF v_existing_status IN ('pending', 'approved') THEN
      RAISE EXCEPTION 'მოთხოვნა უკვე გაგზავნილია' USING ERRCODE = '22023';
    END IF;
    UPDATE public.organization_members
    SET status = 'pending', role = 'agent', created_at = now()
    WHERE id = v_member_id;
  ELSE
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (p_org_id, v_uid, 'agent', 'pending')
    RETURNING id INTO v_member_id;
  END IF;

  SELECT display_name INTO v_requester_name FROM public.profiles WHERE id = v_uid;

  PERFORM public._notify(
    v_owner,
    'org_membership_request',
    'ახალი აგენტის მოთხოვნა',
    format('%s ითხოვს კომპანიაში "%s" აგენტად დამატებას.',
           coalesce(v_requester_name, 'მომხმარებელი'), v_brand),
    format('/dashboard/seller/organizations/%s', p_org_id)
  );

  RETURN v_member_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_organization_membership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_organization_membership(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- respond_membership_request — company owner approves / rejects an agent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_membership_request(p_member_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_owner uuid;
  v_member_user uuid;
  v_brand text;
  v_status text;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'არასწორი მოქმედება' USING ERRCODE = '22023';
  END IF;

  SELECT m.organization_id, m.user_id, o.owner_id, o.brand_name
    INTO v_org_id, v_member_user, v_owner, v_brand
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'მოთხოვნა ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'არ გაქვთ უფლება' USING ERRCODE = '42501';
  END IF;

  v_status := CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE public.organization_members
  SET status = v_status,
      approved_at = CASE WHEN p_action = 'approve' THEN now() ELSE NULL END,
      approved_by = v_uid
  WHERE id = p_member_id;

  PERFORM public._notify(
    v_member_user,
    'org_membership_response',
    CASE WHEN p_action = 'approve' THEN 'აგენტობა დადასტურდა' ELSE 'აგენტობა უარყოფილია' END,
    CASE WHEN p_action = 'approve'
         THEN format('თქვენ დაემატეთ კომპანიას "%s" აგენტად.', v_brand)
         ELSE format('კომპანიამ "%s" უარყო თქვენი მოთხოვნა.', v_brand) END,
    '/dashboard/seller/organizations'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.respond_membership_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_membership_request(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- purchase_company_subscription — debit owner balance, grant a 30-day package.
-- service_role only; invoked by the company-subscription edge function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_company_subscription(
  p_user_id uuid,
  p_org_id uuid,
  p_tier text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_brand text;
  v_amount numeric;
  v_meta jsonb;
  v_limit int;
  v_balance numeric;
  v_new_balance numeric;
  v_expires timestamptz := now() + interval '30 days';
  v_sub_id uuid;
BEGIN
  IF p_tier NOT IN ('entry', 'pro', 'premium') THEN
    RAISE EXCEPTION 'არასწორი პაკეტი' USING ERRCODE = '22023';
  END IF;

  SELECT owner_id, brand_name INTO v_owner, v_brand
  FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'კომპანია ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner <> p_user_id THEN
    RAISE EXCEPTION 'მხოლოდ კომპანიის მფლობელს შეუძლია პაკეტის შეძენა' USING ERRCODE = '42501';
  END IF;

  SELECT amount_gel, meta INTO v_amount, v_meta
  FROM public.pricing_packages
  WHERE category = 'subscription' AND code = 'company-' || p_tier AND is_enabled = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'პაკეტი ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  v_limit := NULLIF(v_meta ->> 'listing_limit', '')::int;  -- NULL = unlimited

  -- Lock owner balance (create if missing)
  INSERT INTO public.balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  SELECT amount INTO v_balance FROM public.balances WHERE user_id = p_user_id FOR UPDATE;

  IF coalesce(v_balance, 0) < v_amount THEN
    RAISE EXCEPTION 'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_amount, coalesce(v_balance, 0) USING ERRCODE = '22023';
  END IF;

  v_new_balance := v_balance - v_amount;
  UPDATE public.balances SET amount = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, -v_amount, 'commission',
          format('კომპანიის გამოწერა: %s (%s)', v_brand, upper(p_tier)), p_org_id);

  -- Replace any current active subscription for this org
  UPDATE public.organization_subscriptions
  SET status = 'expired'
  WHERE organization_id = p_org_id AND status = 'active';

  INSERT INTO public.organization_subscriptions
    (organization_id, tier, listing_limit, amount_gel, starts_at, expires_at, status)
  VALUES (p_org_id, p_tier, v_limit, v_amount, now(), v_expires, 'active')
  RETURNING id INTO v_sub_id;

  PERFORM public._notify(
    p_user_id,
    'company_subscription',
    'გამოწერა გააქტიურდა',
    format('კომპანიის "%s" %s პაკეტი გააქტიურდა.', v_brand, upper(p_tier)),
    format('/dashboard/seller/organizations/%s', p_org_id)
  );

  RETURN json_build_object(
    'subscription_id', v_sub_id,
    'tier', p_tier,
    'listing_limit', v_limit,
    'cost', v_amount,
    'new_balance', v_new_balance,
    'expires_at', v_expires
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_company_subscription(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_company_subscription(uuid, uuid, text) TO service_role;

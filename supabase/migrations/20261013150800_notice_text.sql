-- User-typed names and titles in notifications are plain, link-free text (2026-10-13).
--
-- Seven DEFINER functions put text another user typed straight into a
-- notification message, which email_enqueue_notification mails from
-- mybakuriani.ge (C33; the HTML part is escaped, but newlines become <br> and mail
-- clients turn typed URLs into links): a display name in the admin
-- content-change / SMS-approval notices and in an agency's membership request, an
-- anonymous job applicant's full_name in the employer's notice, a company's
-- brand_name in the admin and member notices, a listing title in the admin
-- moderation notice. public._notice_text flattens line breaks and invisible or
-- bidi characters to a space (the C24 class) and defangs links (inner dots ->
-- U+2024, '://' -> ':/ /'); real names and titles read the same.
--
-- Bodies = the live staging definitions with the value wrapped; the guard refuses
-- (55000) where a live body differs. CREATE OR REPLACE keeps each function's ACL.

do $guard$
declare
  r record;
begin
  for r in
    select v.fn, v.expected,
           (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(v.fn)) as live
    from (values
      ('public.notify_admins_content_change_pending()', '9f0e0cef2af3ac85bf4322cfc0a5a884'),
      ('public.notify_admins_sms_broadcast_pending()', 'a2b49872e365e0bdea73706bcdbf7b67'),
      ('public.request_organization_membership(uuid)', '1dee0890acf74f63a0080a7c29b03b4d'),
      ('public.notify_job_application()', '7f9188a35540cd6d6ce8d944c78780b3'),
      ('public.notify_admins_organization_pending()', 'f98fdbc3a76aea25207a07a2cc5d8325'),
      ('public.notify_listing_pending()', 'e66d8f4f59c23ee465a40af03ac9b6a3'),
      ('public.respond_membership_request(uuid,text)', 'e49048d61169421c7f958c986a9e6107')
    ) as v(fn, expected)
  loop
    if r.live is distinct from r.expected then
      raise exception 'notice_text: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live
        using errcode = '55000';
    end if;
  end loop;
end
$guard$;

CREATE OR REPLACE FUNCTION public._notice_text(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  -- User-typed text placed in a notification (bell + e-mail copy, C33): line
  -- breaks, control, zero-width and bidi characters become one space (the class
  -- notify_cleaner_of_new_task uses, C24), and links are defanged so a mail client
  -- cannot turn a typed name into a clickable link: a dot between two
  -- non-space characters becomes U+2024 (one dot leader) and '://' becomes ':/ /'.
  SELECT NULLIF(
    replace(
      regexp_replace(
        btrim(regexp_replace(p_text, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g')),
        '(?<=[^[:space:].])\.(?=[^[:space:].])', U&'\2024', 'g'),
      '://', ':/ /'),
    '')
$function$;

REVOKE ALL ON FUNCTION public._notice_text(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins_content_change_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name  text;
  v_label text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.requester_id;
  v_label := CASE NEW.target_type
    WHEN 'profile' THEN 'პროფილი' WHEN 'property' THEN 'განცხადება'
    WHEN 'service' THEN 'სერვისი'  WHEN 'organization' THEN 'კომპანია'
    ELSE 'კონტენტი' END;

  PERFORM public._notify_admins('admin_content_change_pending',
    'ახალი ცვლილება განსახილველად',
    format('%s ითხოვს ცვლილების დამტკიცებას (%s).', coalesce(public._notice_text(v_name), 'მომხმარებელი'), v_label),
    '/dashboard/admin/verifications?tab=changes',
    NEW.requester_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_content_change_pending failed for request %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_admins_sms_broadcast_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_name text;
BEGIN
  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.sender_id;
  PERFORM public._notify_admins('admin_sms_pending',
    'SMS დაგზავნა ელოდება დადასტურებას',
    format('%s — %s SMS ელოდება შემოწმებას.', coalesce(public._notice_text(v_name), 'მომხმარებელი'), NEW.recipient_count),
    '/dashboard/admin/sms-approvals',
    NEW.sender_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_sms_broadcast_pending failed for broadcast %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_organization_membership(p_org_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           coalesce(public._notice_text(v_requester_name), 'მომხმარებელი'), v_brand),
    format('/dashboard/seller/organizations/%s', p_org_id)
  );

  RETURN v_member_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_job_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_owner_id uuid; v_category text; v_title text; v_scope text; v_segment text;
BEGIN
  SELECT owner_id, category, title INTO v_owner_id, v_category, v_title FROM public.services WHERE id = NEW.service_id;
  IF v_owner_id IS NULL THEN RETURN NEW; END IF;
  v_scope := CASE v_category WHEN 'food' THEN 'food' WHEN 'cleaning' THEN 'cleaner'
    WHEN 'transport' THEN 'transport' WHEN 'entertainment' THEN 'entertainment'
    WHEN 'employment' THEN 'employment' ELSE 'services' END;
  v_segment := v_scope;
  PERFORM public._notify(v_owner_id, 'job_application', 'ახალი განაცხადი ვაკანსიაზე',
    coalesce(public._notice_text(NEW.full_name), 'მომხმარებელი') || ' გამოეხმაურა თქვენს ვაკანსიას „' || COALESCE(v_title, '') || '"',
    '/dashboard/' || v_segment || '/orders', v_scope);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_admins_organization_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public._notify_admins('admin_company_pending',
    'ახალი კომპანია ვერიფიკაციაზე',
    format('„%s" ელოდება ვერიფიკაციას.', coalesce(public._notice_text(NEW.brand_name), 'კომპანია')),
    '/dashboard/admin/companies',
    NEW.owner_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_organization_pending failed for org %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_listing_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text;
  v_title text := COALESCE(public._notice_text(NEW.title), 'განცხადება');
BEGIN
  v_scope := CASE TG_TABLE_NAME
    WHEN 'properties' THEN CASE WHEN coalesce((to_jsonb(NEW)->>'is_for_sale')::boolean, false) THEN 'seller' ELSE 'renter' END
    WHEN 'services' THEN CASE to_jsonb(NEW)->>'category'
      WHEN 'food' THEN 'food' WHEN 'cleaning' THEN 'cleaner'
      WHEN 'employment' THEN 'employment' WHEN 'transport' THEN 'transport'
      WHEN 'entertainment' THEN 'entertainment' ELSE 'services' END
    ELSE NULL END;
  PERFORM public._notify(NEW.owner_id, 'listing_pending',
    'თქვენი განცხადება განხილვის პროცესშია',
    '„' || v_title || '" გადაეგზავნა ადმინისტრატორს დასადასტურებლად.',
    '/dashboard', v_scope);

  -- Excludes an admin submitting their own listing: they already received the
  -- owner-facing notice above, in their renter/seller cabinet.
  PERFORM public._notify_admins('admin_listing_pending',
    'ახალი განცხადება მოდერაციაზე',
    '„' || v_title || '" ელოდება ადმინისტრატორის დადასტურებას.',
    '/dashboard/admin/verifications',
    NEW.owner_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_listing_pending failed for % %: %', TG_TABLE_NAME, NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_membership_request(p_member_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         THEN format('თქვენ დაემატეთ კომპანიას "%s" აგენტად.', public._notice_text(v_brand))
         ELSE format('კომპანიამ "%s" უარყო თქვენი მოთხოვნა.', public._notice_text(v_brand)) END,
    '/dashboard/seller/organizations'
  );
END;
$function$;

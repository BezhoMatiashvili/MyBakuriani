-- A cleaner may expose at most one cleaning service as available 24/7.
-- Working hours are an immediate operational setting: this migration provides a
-- deliberately narrow service-role RPC instead of routing them through C14 review.

-- Reconcile legacy duplicates before installing the race-safe constraint. The
-- effective value follows the application read order: schedule first, then
-- operating_hours. Keep the most recently updated row for each cleaner.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY owner_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS position
  FROM public.services
  WHERE category = 'cleaning'
    AND coalesce(nullif(btrim(schedule), ''), nullif(btrim(operating_hours), '')) = '24/7'
)
UPDATE public.services AS service
SET schedule = CASE WHEN ranked.position = 1 THEN '24/7' ELSE '09:00 - 19:00' END,
    operating_hours = CASE WHEN ranked.position = 1 THEN '24/7' ELSE '09:00 - 19:00' END,
    updated_at = now()
FROM ranked
WHERE ranked.id = service.id;

-- Hours-only requests for cleaning services can no longer be meaningfully
-- approved: the immediate setting may have changed since they were queued.
-- Supersede them and tell their requesters to save the setting again.
WITH superseded AS (
  UPDATE public.content_change_requests AS request
  SET status = 'superseded',
      reviewed_at = now(),
      rejection_reason = 'resave_required_immediate_cleaner_hours',
      updated_at = now()
  FROM public.services AS service
  WHERE request.status = 'pending'
    AND request.target_type = 'service'
    AND request.target_id = service.id
    AND service.category = 'cleaning'
    AND jsonb_typeof(request.proposed_values) = 'object'
    AND request.proposed_values ?| ARRAY['schedule', 'operating_hours']
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(request.proposed_values) AS field(key)
      WHERE field.key NOT IN ('schedule', 'operating_hours')
    )
  RETURNING request.requester_id
)
INSERT INTO public.notifications (
  user_id, type, title, message, action_url, dashboard_scope
)
SELECT
  requester_id,
  'cleaner_working_hours_resave',
  'სამუშაო საათები ხელახლა შეინახეთ',
  '24/7 რეჟიმის განახლებული წესის გამო, გთხოვთ პარამეტრებიდან სამუშაო საათები ხელახლა შეინახოთ.',
  '/dashboard/cleaner/parameters',
  'cleaner'
FROM superseded;

CREATE UNIQUE INDEX IF NOT EXISTS services_one_effective_cleaning_247_per_owner
  ON public.services(owner_id)
  WHERE category = 'cleaning'
    AND coalesce(nullif(btrim(schedule), ''), nullif(btrim(operating_hours), '')) = '24/7';

CREATE OR REPLACE FUNCTION public.self_service_set_cleaner_working_hours(
  p_actor_id uuid,
  p_service_id uuid,
  p_is_24_7 boolean,
  p_working_hours text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service public.services%ROWTYPE;
  v_hours text;
  v_start time;
  v_end time;
  v_affected_ids uuid[] := '{}'::uuid[];
  v_services jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_service_id IS NULL OR p_is_24_7 IS NULL THEN
    RAISE EXCEPTION 'invalid_cleaner_working_hours_payload' USING ERRCODE = '22023';
  END IF;

  -- Serialize every activation/demotion for one cleaner. This closes the gap
  -- between finding the former 24/7 row and updating the selected one.
  PERFORM pg_advisory_xact_lock(hashtextextended('cleaner-hours:' || p_actor_id::text, 0));

  SELECT * INTO v_service
  FROM public.services
  WHERE id = p_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cleaning_service_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_service.owner_id <> p_actor_id THEN
    RAISE EXCEPTION 'cleaning_service_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_service.category <> 'cleaning' THEN
    RAISE EXCEPTION 'service_is_not_cleaning' USING ERRCODE = '22023';
  END IF;

  IF p_is_24_7 THEN
    v_hours := '24/7';
  ELSE
    v_hours := btrim(coalesce(p_working_hours, ''));
    IF v_hours !~ '^([01][0-9]|2[0-3]):[0-5][0-9] - ([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'invalid_cleaner_working_hours_range' USING ERRCODE = '22023';
    END IF;
    v_start := split_part(v_hours, ' - ', 1)::time;
    v_end := split_part(v_hours, ' - ', 2)::time;
    IF v_end <= v_start THEN
      RAISE EXCEPTION 'invalid_cleaner_working_hours_range' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_is_24_7 THEN
    WITH demoted AS (
      UPDATE public.services
      SET schedule = '09:00 - 19:00',
          operating_hours = '09:00 - 19:00',
          updated_at = now()
      WHERE owner_id = p_actor_id
        AND category = 'cleaning'
        AND id <> p_service_id
        AND coalesce(nullif(btrim(schedule), ''), nullif(btrim(operating_hours), '')) = '24/7'
      RETURNING id
    )
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_affected_ids FROM demoted;
  END IF;

  UPDATE public.services
  SET schedule = v_hours,
      operating_hours = v_hours,
      updated_at = now()
  WHERE id = p_service_id;
  v_affected_ids := array_append(v_affected_ids, p_service_id);

  SELECT coalesce(jsonb_agg(to_jsonb(service) ORDER BY service.created_at, service.id), '[]'::jsonb)
  INTO v_services
  FROM public.services AS service
  WHERE service.id = ANY(v_affected_ids);

  RETURN jsonb_build_object('services', v_services);
END;
$$;

REVOKE ALL ON FUNCTION public.self_service_set_cleaner_working_hours(uuid,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_set_cleaner_working_hours(uuid,uuid,boolean,text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- SMS Center: automation rules + user-initiated broadcasts + audience views.
--
-- Builds on the existing sms_outbound queue from 20260517140000_sms_outreach.sql.
-- Both automation runs and broadcast fan-outs produce sms_outbound rows that go
-- through the existing admin moderation pipeline (no new dispatch path).
--
-- Non-destructive: extends sms_outbound (adds nullable columns), no existing
-- data is rewritten.

-- ---------------------------------------------------------------------------
-- 0. Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sms_broadcast_status') THEN
    CREATE TYPE public.sms_broadcast_status AS ENUM (
      'pending', 'partial_approved', 'approved', 'rejected', 'sent', 'failed'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sms_broadcast_audience') THEN
    CREATE TYPE public.sms_broadcast_audience AS ENUM (
      'renter_past_guests',
      'renter_upcoming_guests',
      'renter_all_contacts',
      'food_recent_customers',
      'food_all_contacts',
      'service_recent_clients',
      'service_all_contacts',
      'seller_active_leads',
      'seller_new_leads'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 1. sms_automation_rules — per-user preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_automation_rules (
  user_id                       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_in_reminder_enabled     boolean NOT NULL DEFAULT false,
  check_in_reminder_hours_before int   NOT NULL DEFAULT 24,
  review_request_enabled        boolean NOT NULL DEFAULT false,
  review_request_hours_after    int     NOT NULL DEFAULT 24,
  win_back_enabled              boolean NOT NULL DEFAULT false,
  win_back_days_after           int     NOT NULL DEFAULT 90,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_automation_check_in_window CHECK (check_in_reminder_hours_before BETWEEN 1 AND 168),
  CONSTRAINT sms_automation_review_window CHECK (review_request_hours_after BETWEEN 1 AND 720),
  CONSTRAINT sms_automation_win_back_window CHECK (win_back_days_after BETWEEN 7 AND 365)
);

ALTER TABLE public.sms_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_automation_owner_select" ON public.sms_automation_rules;
CREATE POLICY "sms_automation_owner_select"
  ON public.sms_automation_rules FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sms_automation_owner_insert" ON public.sms_automation_rules;
CREATE POLICY "sms_automation_owner_insert"
  ON public.sms_automation_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sms_automation_owner_update" ON public.sms_automation_rules;
CREATE POLICY "sms_automation_owner_update"
  ON public.sms_automation_rules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sms_automation_admin_all" ON public.sms_automation_rules;
CREATE POLICY "sms_automation_admin_all"
  ON public.sms_automation_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.sms_automation_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sms_automation_updated_at ON public.sms_automation_rules;
CREATE TRIGGER sms_automation_updated_at
  BEFORE UPDATE ON public.sms_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.sms_automation_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. sms_broadcasts — parent record for user-initiated mass SMS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_broadcasts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  audience          public.sms_broadcast_audience NOT NULL,
  audience_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipient_count   int NOT NULL DEFAULT 0,
  message           text NOT NULL,
  status            public.sms_broadcast_status NOT NULL DEFAULT 'pending',
  admin_notes       text,
  reviewed_by       uuid REFERENCES public.profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_broadcasts_message_len CHECK (char_length(message) BETWEEN 1 AND 320)
);

CREATE INDEX IF NOT EXISTS idx_sms_broadcasts_sender
  ON public.sms_broadcasts (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_broadcasts_pending
  ON public.sms_broadcasts (status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.sms_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_broadcasts_sender_select" ON public.sms_broadcasts;
CREATE POLICY "sms_broadcasts_sender_select"
  ON public.sms_broadcasts FOR SELECT
  USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "sms_broadcasts_admin_all" ON public.sms_broadcasts;
CREATE POLICY "sms_broadcasts_admin_all"
  ON public.sms_broadcasts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Extend sms_outbound to support automation + broadcast origin
-- ---------------------------------------------------------------------------
ALTER TABLE public.sms_outbound
  ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES public.sms_broadcasts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS automation_kind text,
  ADD COLUMN IF NOT EXISTS source_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- contact_event_id was previously NOT NULL — relax so automation/broadcast rows
-- don't need an event. The origin check below still enforces at least one source.
ALTER TABLE public.sms_outbound
  ALTER COLUMN contact_event_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sms_outbound_automation_kind_check'
  ) THEN
    ALTER TABLE public.sms_outbound
      ADD CONSTRAINT sms_outbound_automation_kind_check
      CHECK (automation_kind IS NULL OR automation_kind IN ('check_in', 'review_request', 'win_back'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sms_outbound_origin_check'
  ) THEN
    ALTER TABLE public.sms_outbound
      ADD CONSTRAINT sms_outbound_origin_check CHECK (
        contact_event_id IS NOT NULL
        OR broadcast_id IS NOT NULL
        OR automation_kind IS NOT NULL
      );
  END IF;
END$$;

-- Idempotency for automation: one row per (sender, booking, kind).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_outbound_automation
  ON public.sms_outbound (sender_id, source_booking_id, automation_kind)
  WHERE automation_kind IS NOT NULL AND source_booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_outbound_broadcast
  ON public.sms_outbound (broadcast_id)
  WHERE broadcast_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. RPC: sms_audience_count — recipient count preview
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_audience_count(
  p_sender_id uuid,
  p_audience  public.sms_broadcast_audience
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF p_sender_id IS NULL OR p_sender_id <> auth.uid() THEN
    -- callers must be operating on their own audience
    -- (service role bypasses this since auth.uid() is null)
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  CASE p_audience
    WHEN 'renter_past_guests' THEN
      SELECT count(DISTINCT b.guest_id) INTO v_count
      FROM public.bookings b
      JOIN public.profiles p ON p.id = b.guest_id
      WHERE b.owner_id = p_sender_id
        AND b.status = 'completed'
        AND b.check_out < now()
        AND p.phone IS NOT NULL
        AND p.phone <> '';

    WHEN 'renter_upcoming_guests' THEN
      SELECT count(DISTINCT b.guest_id) INTO v_count
      FROM public.bookings b
      JOIN public.profiles p ON p.id = b.guest_id
      WHERE b.owner_id = p_sender_id
        AND b.status IN ('pending', 'confirmed')
        AND b.check_in >= current_date
        AND p.phone IS NOT NULL
        AND p.phone <> '';

    WHEN 'renter_all_contacts',
         'food_all_contacts',
         'service_all_contacts' THEN
      SELECT count(DISTINCT ce.visitor_id) INTO v_count
      FROM public.contact_events ce
      JOIN public.profiles p ON p.id = ce.visitor_id
      WHERE ce.owner_id = p_sender_id
        AND ce.expires_at > now()
        AND p.phone IS NOT NULL
        AND p.phone <> '';

    WHEN 'food_recent_customers',
         'service_recent_clients' THEN
      SELECT count(DISTINCT ce.visitor_id) INTO v_count
      FROM public.contact_events ce
      JOIN public.profiles p ON p.id = ce.visitor_id
      WHERE ce.owner_id = p_sender_id
        AND ce.created_at > now() - interval '30 days'
        AND p.phone IS NOT NULL
        AND p.phone <> '';

    WHEN 'seller_active_leads' THEN
      SELECT count(*) INTO v_count
      FROM public.leads l
      WHERE l.owner_id = p_sender_id
        AND l.stage IN ('contacted', 'shown', 'negotiating')
        AND l.client_phone IS NOT NULL
        AND l.client_phone <> '';

    WHEN 'seller_new_leads' THEN
      SELECT count(*) INTO v_count
      FROM public.leads l
      WHERE l.owner_id = p_sender_id
        AND l.stage = 'new'
        AND l.client_phone IS NOT NULL
        AND l.client_phone <> '';
  END CASE;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.sms_audience_count(uuid, public.sms_broadcast_audience) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_audience_count(uuid, public.sms_broadcast_audience) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC: sms_send_broadcast — fan-out audience into pending sms_outbound rows
-- ---------------------------------------------------------------------------
-- Resolves the audience server-side (so the client can't forge recipients),
-- snapshots into sms_broadcasts.audience_snapshot, inserts one pending
-- sms_outbound row per recipient. Returns broadcast_id + recipient_count.
-- Atomic: all rows inserted in a single transaction, rolled back if insufficient
-- credits.
CREATE OR REPLACE FUNCTION public.sms_send_broadcast(
  p_sender_id uuid,
  p_audience  public.sms_broadcast_audience,
  p_message   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id uuid;
  v_count        int;
  v_sms_remaining int;
  v_snapshot     jsonb;
BEGIN
  IF p_sender_id IS NULL THEN
    RAISE EXCEPTION 'sender_id required' USING ERRCODE = '22023';
  END IF;
  IF p_message IS NULL OR char_length(p_message) < 1 OR char_length(p_message) > 320 THEN
    RAISE EXCEPTION 'invalid message length' USING ERRCODE = '22023';
  END IF;

  -- Build snapshot rows: [{ recipient_id, phone, display_name }, ...]
  CASE p_audience
    WHEN 'renter_past_guests' THEN
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'recipient_id', b.guest_id,
        'phone', p.phone,
        'display_name', p.display_name
      ))
      INTO v_snapshot
      FROM public.bookings b
      JOIN public.profiles p ON p.id = b.guest_id
      WHERE b.owner_id = p_sender_id
        AND b.status = 'completed'
        AND b.check_out < now()
        AND p.phone IS NOT NULL AND p.phone <> '';

    WHEN 'renter_upcoming_guests' THEN
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'recipient_id', b.guest_id,
        'phone', p.phone,
        'display_name', p.display_name
      ))
      INTO v_snapshot
      FROM public.bookings b
      JOIN public.profiles p ON p.id = b.guest_id
      WHERE b.owner_id = p_sender_id
        AND b.status IN ('pending', 'confirmed')
        AND b.check_in >= current_date
        AND p.phone IS NOT NULL AND p.phone <> '';

    WHEN 'renter_all_contacts',
         'food_all_contacts',
         'service_all_contacts' THEN
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'recipient_id', ce.visitor_id,
        'phone', p.phone,
        'display_name', p.display_name
      ))
      INTO v_snapshot
      FROM public.contact_events ce
      JOIN public.profiles p ON p.id = ce.visitor_id
      WHERE ce.owner_id = p_sender_id
        AND ce.expires_at > now()
        AND p.phone IS NOT NULL AND p.phone <> '';

    WHEN 'food_recent_customers',
         'service_recent_clients' THEN
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'recipient_id', ce.visitor_id,
        'phone', p.phone,
        'display_name', p.display_name
      ))
      INTO v_snapshot
      FROM public.contact_events ce
      JOIN public.profiles p ON p.id = ce.visitor_id
      WHERE ce.owner_id = p_sender_id
        AND ce.created_at > now() - interval '30 days'
        AND p.phone IS NOT NULL AND p.phone <> '';

    WHEN 'seller_active_leads' THEN
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'recipient_id', NULL,
        'phone', l.client_phone,
        'display_name', l.client_name
      ))
      INTO v_snapshot
      FROM public.leads l
      WHERE l.owner_id = p_sender_id
        AND l.stage IN ('contacted', 'shown', 'negotiating')
        AND l.client_phone IS NOT NULL AND l.client_phone <> '';

    WHEN 'seller_new_leads' THEN
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'recipient_id', NULL,
        'phone', l.client_phone,
        'display_name', l.client_name
      ))
      INTO v_snapshot
      FROM public.leads l
      WHERE l.owner_id = p_sender_id
        AND l.stage = 'new'
        AND l.client_phone IS NOT NULL AND l.client_phone <> '';
  END CASE;

  v_snapshot := COALESCE(v_snapshot, '[]'::jsonb);
  v_count := jsonb_array_length(v_snapshot);

  IF v_count = 0 THEN
    RAISE EXCEPTION 'empty audience' USING ERRCODE = '22023';
  END IF;

  -- Credit preflight (reserve, not deduct — deduction happens at admin approve)
  SELECT sms_remaining INTO v_sms_remaining
  FROM public.balances
  WHERE user_id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_sms_remaining, 0) < v_count THEN
    RAISE EXCEPTION 'insufficient credit' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sms_broadcasts (
    sender_id, audience, audience_snapshot, recipient_count, message, status
  ) VALUES (
    p_sender_id, p_audience, v_snapshot, v_count, p_message, 'pending'
  )
  RETURNING id INTO v_broadcast_id;

  -- Fan out into sms_outbound. recipient_id may be NULL for leads (lead has no
  -- profile yet) — we still capture the phone for moderation/dispatch.
  -- Use a synthetic profile-less recipient: store the sender as recipient_id
  -- to satisfy the FK (profile reference), but admin reviewer sees the real
  -- phone and broadcast context.
  INSERT INTO public.sms_outbound (
    sender_id, recipient_id, recipient_phone, contact_event_id,
    broadcast_id, message, status
  )
  SELECT
    p_sender_id,
    COALESCE((rec->>'recipient_id')::uuid, p_sender_id),
    rec->>'phone',
    NULL,
    v_broadcast_id,
    p_message,
    'pending'
  FROM jsonb_array_elements(v_snapshot) AS rec
  WHERE rec->>'phone' IS NOT NULL AND rec->>'phone' <> '';

  RETURN jsonb_build_object(
    'broadcast_id', v_broadcast_id,
    'recipient_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sms_send_broadcast(uuid, public.sms_broadcast_audience, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_send_broadcast(uuid, public.sms_broadcast_audience, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. RPC: sms_consume_credits_bulk — deduct N credits in one transaction
-- ---------------------------------------------------------------------------
-- Called by admin moderation endpoint when bulk-approving a broadcast.
-- Receives the list of sms_outbound IDs (all from the same broadcast),
-- locks the sender's balance row, deducts one credit per row, logs N
-- transaction rows. Atomic — if any row fails, the whole batch rolls back.
CREATE OR REPLACE FUNCTION public.sms_consume_credits_bulk(
  p_sender_id uuid,
  p_sms_ids   uuid[]
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_sms_remaining int;
BEGIN
  IF p_sender_id IS NULL OR p_sms_ids IS NULL OR array_length(p_sms_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'sender_id and sms_ids required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.sms_outbound
  WHERE id = ANY(p_sms_ids) AND sender_id = p_sender_id AND status = 'pending';

  IF v_n = 0 THEN
    RAISE EXCEPTION 'no pending rows' USING ERRCODE = 'P0002';
  END IF;

  SELECT sms_remaining INTO v_sms_remaining
  FROM public.balances
  WHERE user_id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_sms_remaining, 0) < v_n THEN
    RAISE EXCEPTION 'insufficient credit' USING ERRCODE = '22023';
  END IF;

  UPDATE public.balances
  SET sms_remaining = v_sms_remaining - v_n,
      updated_at = now()
  WHERE user_id = p_sender_id;

  INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
  SELECT
    p_sender_id, 0, 'sms_send'::public.transaction_type,
    format('SMS გაგზავნილია (broadcast): %s', s.recipient_phone), s.id
  FROM public.sms_outbound s
  WHERE s.id = ANY(p_sms_ids) AND s.sender_id = p_sender_id;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_consume_credits_bulk(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_consume_credits_bulk(uuid, uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Optional pg_cron schedule for sms-automation-run
-- ---------------------------------------------------------------------------
-- Gated on pg_cron being installed. Runs hourly. The edge function URL is
-- configured separately; this just provides the schedule hook. Comment out if
-- pg_cron is not available — automation can be triggered manually via
-- `supabase functions invoke sms-automation-run`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sms-automation-hourly')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'sms-automation-hourly'
    );
    PERFORM cron.schedule(
      'sms-automation-hourly',
      '15 * * * *',
      $cron$ SELECT public.sms_automation_run_cron(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may not be available in some environments; ignore.
  NULL;
END$$;

-- Placeholder cron entrypoint. The actual queueing logic lives in the
-- `sms-automation-run` edge function (called by an external scheduler).
-- This SQL function is a no-op that exists only so the cron.schedule above
-- has something to call when running in environments where the edge function
-- can't be reached from inside Postgres.
CREATE OR REPLACE FUNCTION public.sms_automation_run_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- intentionally empty; real work happens in supabase/functions/sms-automation-run
  RETURN;
END;
$$;

-- SMS outreach: contact-gated, admin-moderated SMS from listing owners
-- to users who clicked Call/WhatsApp on their listings.
--
-- Adds:
--   * contact_events  — one row per Call/WhatsApp click by a logged-in user
--   * sms_outbound    — queue of SMS drafts awaiting admin approval
--   * record_contact_event RPC (SECURITY DEFINER, called from /api/contact/track)
--   * sms_consume_credit RPC   (SECURITY DEFINER, called on admin approve)
--   * transaction_type += 'sms_send'
--
-- Non-destructive. No existing tables modified.

-- ---------------------------------------------------------------------------
-- 0. Enum updates
-- ---------------------------------------------------------------------------
-- Adds 'sms_send' to the existing transaction_type enum. Wrapped so re-runs
-- don't error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'transaction_type' AND e.enumlabel = 'sms_send'
  ) THEN
    ALTER TYPE public.transaction_type ADD VALUE 'sms_send';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_channel') THEN
    CREATE TYPE public.contact_channel AS ENUM ('call', 'whatsapp');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sms_outbound_status') THEN
    CREATE TYPE public.sms_outbound_status AS ENUM (
      'pending', 'approved', 'rejected', 'sent', 'failed'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 1. contact_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id     uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  service_id      uuid REFERENCES public.services(id) ON DELETE SET NULL,
  channel         public.contact_channel NOT NULL,
  visitor_phone   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  sms_sent_count  int NOT NULL DEFAULT 0,
  CONSTRAINT contact_events_target_check CHECK (
    property_id IS NOT NULL OR service_id IS NOT NULL
  ),
  CONSTRAINT contact_events_not_self CHECK (visitor_id <> owner_id)
);

-- Composite index for the owner's "who contacted me, sorted by recency"
-- query. We don't use a partial WHERE (e.g. expires_at > now()) because the
-- predicate has to be IMMUTABLE for a partial index; queries instead filter
-- `expires_at > now()` at runtime.
CREATE INDEX IF NOT EXISTS idx_contact_events_owner_expires
  ON public.contact_events (owner_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_events_visitor
  ON public.contact_events (visitor_id, created_at DESC);

ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_events_owner_select" ON public.contact_events;
CREATE POLICY "contact_events_owner_select"
  ON public.contact_events FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "contact_events_visitor_select" ON public.contact_events;
CREATE POLICY "contact_events_visitor_select"
  ON public.contact_events FOR SELECT
  USING (auth.uid() = visitor_id);

DROP POLICY IF EXISTS "contact_events_admin_all" ON public.contact_events;
CREATE POLICY "contact_events_admin_all"
  ON public.contact_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
-- Note: no INSERT/UPDATE policy for regular users — writes go through the
-- record_contact_event SECURITY DEFINER RPC (called by service-role from
-- /api/contact/track) and sms_consume_credit RPC.

-- ---------------------------------------------------------------------------
-- 2. sms_outbound
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_outbound (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_phone     text NOT NULL,
  contact_event_id    uuid NOT NULL REFERENCES public.contact_events(id) ON DELETE RESTRICT,
  message             text NOT NULL,
  status              public.sms_outbound_status NOT NULL DEFAULT 'pending',
  admin_notes         text,
  reviewed_by         uuid REFERENCES public.profiles(id),
  reviewed_at         timestamptz,
  sent_at             timestamptz,
  provider_response   jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_outbound_message_len CHECK (char_length(message) BETWEEN 1 AND 320)
);

CREATE INDEX IF NOT EXISTS idx_sms_outbound_sender
  ON public.sms_outbound (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_outbound_pending
  ON public.sms_outbound (status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.sms_outbound ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_outbound_sender_select" ON public.sms_outbound;
CREATE POLICY "sms_outbound_sender_select"
  ON public.sms_outbound FOR SELECT
  USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "sms_outbound_admin_all" ON public.sms_outbound;
CREATE POLICY "sms_outbound_admin_all"
  ON public.sms_outbound FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
-- INSERT happens via service role from /api/sms/draft only.
-- UPDATE (moderation) happens via service role from /api/admin/sms/moderate.

-- ---------------------------------------------------------------------------
-- 3. record_contact_event RPC
-- ---------------------------------------------------------------------------
-- Records a Call/WhatsApp click. Returns the event id, or NULL if:
--   * visitor has no phone on profile (can't be SMS'd later, so skip)
--   * a fresh event already exists for the same visitor/owner/listing/channel
--     within the last 5 minutes (dedupe rapid double-clicks).
CREATE OR REPLACE FUNCTION public.record_contact_event(
  p_visitor_id   uuid,
  p_owner_id     uuid,
  p_property_id  uuid,
  p_service_id   uuid,
  p_channel      text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_phone text;
  v_existing_id   uuid;
  v_new_id        uuid;
BEGIN
  IF p_visitor_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'visitor_id and owner_id required' USING ERRCODE = '22023';
  END IF;

  IF p_visitor_id = p_owner_id THEN
    RAISE EXCEPTION 'visitor and owner cannot be the same user' USING ERRCODE = '22023';
  END IF;

  IF p_property_id IS NULL AND p_service_id IS NULL THEN
    RAISE EXCEPTION 'property_id or service_id required' USING ERRCODE = '22023';
  END IF;

  IF p_channel NOT IN ('call', 'whatsapp') THEN
    RAISE EXCEPTION 'invalid channel' USING ERRCODE = '22023';
  END IF;

  -- Verify the listing belongs to the claimed owner. This blocks a malicious
  -- client from pinning a click against an unrelated owner.
  IF p_property_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = p_property_id AND owner_id = p_owner_id
    ) THEN
      RAISE EXCEPTION 'property does not belong to owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_service_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.services
      WHERE id = p_service_id AND owner_id = p_owner_id
    ) THEN
      RAISE EXCEPTION 'service does not belong to owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Snapshot visitor's phone now. If they have none, skip silently — the SMS
  -- flow cannot reach them anyway.
  SELECT phone INTO v_visitor_phone
  FROM public.profiles
  WHERE id = p_visitor_id;

  IF v_visitor_phone IS NULL OR v_visitor_phone = '' THEN
    RETURN NULL;
  END IF;

  -- Dedupe: collapse repeated clicks within the last 5 min on the same
  -- visitor/owner/listing/channel.
  SELECT id INTO v_existing_id
  FROM public.contact_events
  WHERE visitor_id = p_visitor_id
    AND owner_id = p_owner_id
    AND channel = p_channel::public.contact_channel
    AND (
      (p_property_id IS NOT NULL AND property_id = p_property_id)
      OR (p_service_id IS NOT NULL AND service_id = p_service_id)
    )
    AND created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.contact_events (
    visitor_id, owner_id, property_id, service_id, channel, visitor_phone
  ) VALUES (
    p_visitor_id, p_owner_id, p_property_id, p_service_id,
    p_channel::public.contact_channel, v_visitor_phone
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_contact_event(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_contact_event(uuid, uuid, uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. sms_consume_credit RPC
-- ---------------------------------------------------------------------------
-- Called inside /api/admin/sms/moderate when status flips to 'approved'.
-- Locks balances row, decrements sms_remaining by 1, bumps contact_event
-- counter, logs transaction. Raises if no credits left.
CREATE OR REPLACE FUNCTION public.sms_consume_credit(
  p_sender_id uuid,
  p_sms_id    uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sms_remaining   int;
  v_contact_event_id uuid;
  v_recipient_phone  text;
BEGIN
  SELECT contact_event_id, recipient_phone
    INTO v_contact_event_id, v_recipient_phone
  FROM public.sms_outbound
  WHERE id = p_sms_id AND sender_id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sms not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT sms_remaining INTO v_sms_remaining
  FROM public.balances
  WHERE user_id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'balance not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_sms_remaining, 0) < 1 THEN
    RAISE EXCEPTION 'არასაკმარისი SMS კრედიტი' USING ERRCODE = '22023';
  END IF;

  UPDATE public.balances
  SET sms_remaining = v_sms_remaining - 1,
      updated_at = now()
  WHERE user_id = p_sender_id;

  UPDATE public.contact_events
  SET sms_sent_count = sms_sent_count + 1
  WHERE id = v_contact_event_id;

  INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
  VALUES (
    p_sender_id,
    0,
    'sms_send'::public.transaction_type,
    format('SMS გაგზავნილია: %s', v_recipient_phone),
    p_sms_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sms_consume_credit(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_consume_credit(uuid, uuid) TO service_role;

-- contact_events: listing owners no longer read the visitor's phone (2026-10-14, C25 / C34).
--
-- record_contact_event (service role, /api/contact/track) copies a signed-in visitor's
-- private profiles.phone (C25: not readable by other users) into
-- contact_events.visitor_phone when they press Call or WhatsApp on a listing, and the
-- table-wide SELECT grant plus contact_events_owner_select let the listing's owner read
-- it through the API, whether or not the visitor then called. Nothing in the app reads
-- the column with a user session: the guest's reviews page selects id, channel,
-- property_id, service_id and created_at of the visitor's own rows, and the owner's SMS
-- outreach reads profiles.phone inside its DEFINER function. authenticated keeps SELECT
-- on every other column; anon (no policy, so no row) loses its table-wide SELECT; service
-- role and DEFINER functions are unaffected.
--
-- public.ticket_number_seq is an orphan sequence (no column default, no reader) that
-- still carried Supabase's default anon/authenticated USAGE, SELECT and UPDATE.

REVOKE SELECT ON public.contact_events FROM anon, authenticated;
GRANT SELECT (id, visitor_id, owner_id, property_id, service_id, channel, created_at, expires_at, sms_sent_count)
  ON public.contact_events TO authenticated;

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.contact_events', 'visitor_phone', 'SELECT')
     OR has_column_privilege('anon', 'public.contact_events', 'visitor_phone', 'SELECT') THEN
    RAISE EXCEPTION 'contact_events.visitor_phone is still readable by a client role (a PUBLIC or role grant)'
      USING ERRCODE = '55000';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ticket_number_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE public.ticket_number_seq FROM anon, authenticated;
  END IF;
END $$;

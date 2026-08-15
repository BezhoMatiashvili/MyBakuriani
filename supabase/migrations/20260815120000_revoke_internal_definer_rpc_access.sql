-- SECURITY: Supabase's default function privileges grant EXECUTE directly to
-- anon/authenticated.  REVOKE ... FROM PUBLIC alone therefore does not make an
-- internal SECURITY DEFINER helper private.
--
-- In particular, ensure_renter_guest accepts an owner id because it is called
-- from trusted booking functions and triggers.  Direct RPC access let an
-- anonymous caller insert CRM guest rows for an arbitrary public listing owner.

-- Internal trigger/helper functions are never client RPCs.  Their owning
-- SECURITY DEFINER functions and triggers can continue to invoke them after
-- client roles lose EXECUTE.
REVOKE ALL ON FUNCTION public.ensure_renter_guest(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_manual_booking_calendar_blocks()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_booking_sms_consent_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_booking_sms_consent_phone_invalidation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renter_guests_resolve_profile()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_platform_booking_guest()
  FROM PUBLIC, anon, authenticated;

-- Advertising metrics are written only by the rate-limited Next.js API route,
-- which uses service_role.  Removing direct REST RPC access prevents bypassing
-- that abuse-control boundary while preserving the public UI behavior.
REVOKE ALL ON FUNCTION public.increment_ad_metric(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- These are intentional authenticated client RPCs.  Remove the accidental
-- anonymous grant explicitly, while retaining the existing signed-in flows.
REVOKE ALL ON FUNCTION public.create_manual_booking(
  uuid, date, date, text, text, text, integer, numeric, text, text, text,
  uuid, boolean, numeric, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(
  uuid, date, date, text, text, text, integer, numeric, text, text, text,
  uuid, boolean, numeric, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.update_manual_booking(
  uuid, date, date, text, text, text, integer, numeric, text, text, text,
  uuid, boolean, numeric, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_manual_booking(
  uuid, date, date, text, text, text, integer, numeric, text, text, text,
  uuid, boolean, numeric, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_guest_manual_booking(
  uuid, date, date, text, text, text, boolean, numeric, numeric, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_guest_manual_booking(
  uuid, date, date, text, text, text, boolean, numeric, numeric, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_cleaning_task_contact(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cleaning_task_contact(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.transition_cleaning_task(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_cleaning_task(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

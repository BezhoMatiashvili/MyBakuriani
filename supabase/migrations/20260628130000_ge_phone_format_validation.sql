-- Georgian phone-format validation — server-side backstop for the client-side
-- PhoneInput / isValidGePhone validation added to the renter & seller forms.
--
-- Implemented as BEFORE INSERT OR UPDATE OF <col> triggers (NOT CHECK constraints)
-- on purpose:
--   * UPDATE OF <col> fires ONLY when the phone column is part of the write, so
--     unrelated updates (blacklist / stage / status / availability toggles) to
--     rows that still hold legacy invalid phone values are never rejected.
--   * Existing rows are never re-validated, rewritten, or deleted — a CHECK ...
--     NOT VALID would instead re-fire on every later UPDATE of those rows.
--
-- Accepted: NULL, '' (treated as empty), or an optional +995 prefix followed by a
-- 9-digit Georgian mobile number (leading 5). Garbage like '5555555555555' is
-- rejected on write. The lenient prefix tolerates both stored conventions
-- (+995-prefixed and bare 9-digit) that the app's validated forms already write.
--
-- DEPLOY ORDERING: apply this together with the new frontend. Applying it before
-- the updated client code is live would reject saves from the current forms,
-- which still store raw user input.

CREATE OR REPLACE FUNCTION public.validate_ge_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col text := TG_ARGV[0];
  val text := row_to_json(NEW) ->> col;
BEGIN
  IF val IS NOT NULL AND val <> '' AND val !~ '^(\+995)?5\d{8}$' THEN
    RAISE EXCEPTION 'Invalid Georgian phone format for %.%: %', TG_TABLE_NAME, col, val
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions are invoked by the trigger system, not called directly; revoke
-- direct EXECUTE to match the project's trigger-function hardening.
REVOKE EXECUTE ON FUNCTION public.validate_ge_phone() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ge_phone ON public.renter_guests;
CREATE TRIGGER trg_ge_phone
  BEFORE INSERT OR UPDATE OF phone ON public.renter_guests
  FOR EACH ROW EXECUTE FUNCTION public.validate_ge_phone('phone');

DROP TRIGGER IF EXISTS trg_ge_phone ON public.renter_cleaners;
CREATE TRIGGER trg_ge_phone
  BEFORE INSERT OR UPDATE OF phone ON public.renter_cleaners
  FOR EACH ROW EXECUTE FUNCTION public.validate_ge_phone('phone');

DROP TRIGGER IF EXISTS trg_ge_phone ON public.manual_bookings;
CREATE TRIGGER trg_ge_phone
  BEFORE INSERT OR UPDATE OF guest_phone ON public.manual_bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_ge_phone('guest_phone');

DROP TRIGGER IF EXISTS trg_ge_phone ON public.leads;
CREATE TRIGGER trg_ge_phone
  BEFORE INSERT OR UPDATE OF client_phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_ge_phone('client_phone');

DROP TRIGGER IF EXISTS trg_ge_phone_phone ON public.cleaner_profiles;
CREATE TRIGGER trg_ge_phone_phone
  BEFORE INSERT OR UPDATE OF phone ON public.cleaner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_ge_phone('phone');

DROP TRIGGER IF EXISTS trg_ge_phone_whatsapp ON public.cleaner_profiles;
CREATE TRIGGER trg_ge_phone_whatsapp
  BEFORE INSERT OR UPDATE OF whatsapp ON public.cleaner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_ge_phone('whatsapp');

-- DOWN (manual rollback):
--   DROP TRIGGER IF EXISTS trg_ge_phone ON public.renter_guests;
--   DROP TRIGGER IF EXISTS trg_ge_phone ON public.renter_cleaners;
--   DROP TRIGGER IF EXISTS trg_ge_phone ON public.manual_bookings;
--   DROP TRIGGER IF EXISTS trg_ge_phone ON public.leads;
--   DROP TRIGGER IF EXISTS trg_ge_phone_phone ON public.cleaner_profiles;
--   DROP TRIGGER IF EXISTS trg_ge_phone_whatsapp ON public.cleaner_profiles;
--   DROP FUNCTION IF EXISTS public.validate_ge_phone();

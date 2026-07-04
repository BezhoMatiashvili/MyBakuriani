-- Guest <-> booking links so the renter guests page can show real stay history.
-- Additive only: two nullable FK columns, a phone normalizer, a profile-resolver
-- trigger on renter_guests, and a phone-only backfill. No data is deleted; the
-- backfill only sets NULL -> value.
--
-- Why: renter_guests is a loose CRM list with no link to a guest's actual stays
-- (manual_bookings / bookings). These links let the guests page assemble an exact
-- per-guest stay history (property, dates, amount) without fragile render-time
-- phone matching.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_renter_guests_resolve_profile ON renter_guests;
--   DROP FUNCTION IF EXISTS public.renter_guests_resolve_profile();
--   DROP INDEX IF EXISTS idx_manual_bookings_renter_guest;
--   DROP INDEX IF EXISTS idx_renter_guests_profile;
--   ALTER TABLE manual_bookings DROP COLUMN IF EXISTS renter_guest_id;
--   ALTER TABLE renter_guests   DROP COLUMN IF EXISTS profile_id;
--   DROP FUNCTION IF EXISTS public.normalize_ge_phone(TEXT);

-- 1. Phone normalizer — digits only, drop the +995 country code, compare last 9.
--    Mirrors the client-side phoneKey() used by the guests page. Returns NULL for
--    anything too short to be a usable key (so garbage/dummy data never merges).
CREATE OR REPLACE FUNCTION public.normalize_ge_phone(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) < 9 THEN NULL
    ELSE right(
      regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^995', ''),
      9
    )
  END;
$$;

-- 2. manual_bookings.renter_guest_id -> renter_guests(id). ON DELETE SET NULL so
--    deleting a CRM contact never erases booking history (it just unlinks it).
ALTER TABLE manual_bookings
  ADD COLUMN IF NOT EXISTS renter_guest_id UUID
    REFERENCES renter_guests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_manual_bookings_renter_guest
  ON manual_bookings(renter_guest_id);

-- 3. renter_guests.profile_id -> profiles(id). Bridges a CRM contact to a platform
--    account so platform bookings (keyed on guest_id) attach to the right guest.
ALTER TABLE renter_guests
  ADD COLUMN IF NOT EXISTS profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_renter_guests_profile
  ON renter_guests(profile_id);

-- 4. Auto-resolve profile_id from the contact's phone on insert / phone change.
--    SECURITY DEFINER so it can read profiles past RLS. No new data exposure: the
--    renter still only ever sees bookings where owner_id = auth.uid().
CREATE OR REPLACE FUNCTION public.renter_guests_resolve_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF normalize_ge_phone(NEW.phone) IS NULL THEN
    NEW.profile_id := NULL;
  ELSE
    SELECT id INTO NEW.profile_id
    FROM profiles
    WHERE normalize_ge_phone(phone) = normalize_ge_phone(NEW.phone)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renter_guests_resolve_profile ON renter_guests;
CREATE TRIGGER trg_renter_guests_resolve_profile
  BEFORE INSERT OR UPDATE OF phone ON renter_guests
  FOR EACH ROW
  EXECUTE FUNCTION public.renter_guests_resolve_profile();

-- 5. Backfill (phone-only; no fabricated name matches).
-- 5a. profile_id for existing contacts whose phone matches one platform profile.
UPDATE renter_guests rg
SET profile_id = (
  SELECT p.id FROM profiles p
  WHERE normalize_ge_phone(p.phone) = normalize_ge_phone(rg.phone)
  LIMIT 1
)
WHERE rg.profile_id IS NULL
  AND normalize_ge_phone(rg.phone) IS NOT NULL;

-- 5b. renter_guest_id for existing manual bookings whose guest phone matches a
--     contact owned by the same renter.
UPDATE manual_bookings mb
SET renter_guest_id = rg.id
FROM renter_guests rg
WHERE mb.renter_guest_id IS NULL
  AND mb.owner_id = rg.owner_id
  AND normalize_ge_phone(mb.guest_phone) IS NOT NULL
  AND normalize_ge_phone(mb.guest_phone) = normalize_ge_phone(rg.phone);

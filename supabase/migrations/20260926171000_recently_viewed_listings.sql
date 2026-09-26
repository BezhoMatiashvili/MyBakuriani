-- Per-user "recently viewed" history for the guest dashboard section
-- "ბოლოს ნანახი განცხადებები" (contract C34). Written ONLY by the view beacon
-- route (POST /api/listings/[kind]/[id]/view) through the service role, for
-- signed-in viewers who do not own the listing; read ONLY by the viewer's own
-- dashboard under RLS. Not a metric source: views_count / listing_view_events
-- stay the analytics truth (C22). Starts empty - there is no per-user view data
-- to backfill from.

CREATE TABLE public.recently_viewed_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  -- C9: exactly one listing reference (there is no listings table).
  CONSTRAINT recently_viewed_listings_exactly_one_ref CHECK (
    (property_id IS NOT NULL)::int + (service_id IS NOT NULL)::int = 1
  ),
  -- Non-partial on purpose: PostgREST's upsert (on_conflict=user_id,property_id)
  -- cannot target a partial unique index. NULLs are distinct, so service rows
  -- never collide on the property constraint and vice versa.
  CONSTRAINT recently_viewed_listings_user_property_key UNIQUE (user_id, property_id),
  CONSTRAINT recently_viewed_listings_user_service_key UNIQUE (user_id, service_id)
);

-- Dashboard read: WHERE user_id = ? ORDER BY viewed_at DESC LIMIT n.
CREATE INDEX recently_viewed_listings_user_viewed_idx
  ON public.recently_viewed_listings (user_id, viewed_at DESC);
-- FK-side indexes so deleting a listing cascades without a sequential scan.
CREATE INDEX recently_viewed_listings_property_idx
  ON public.recently_viewed_listings (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX recently_viewed_listings_service_idx
  ON public.recently_viewed_listings (service_id) WHERE service_id IS NOT NULL;

ALTER TABLE public.recently_viewed_listings ENABLE ROW LEVEL SECURITY;

-- Explicit posture instead of inherited default ACLs (hardened on staging by
-- 20260926170000). TRUNCATE is not governed by RLS, so client-facing roles
-- must never hold it; browsers only ever read their own rows.
REVOKE ALL ON public.recently_viewed_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recently_viewed_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_viewed_listings TO service_role;

CREATE POLICY "users read own recently viewed"
  ON public.recently_viewed_listings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

NOTIFY pgrst, 'reload schema';

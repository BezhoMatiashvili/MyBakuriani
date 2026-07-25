-- Postgres-backed shared rate limiter, replacing the Upstash dependency.
--
-- WHY THIS EXISTS. `src/lib/rateLimit.ts:checkRateLimit` was written to talk to
-- Upstash and to return FALSE whenever no shared store was configured in
-- production ("fail closed"). Upstash was never provisioned, so from the
-- security release (9828eba, 2026-07-24) until this migration EVERY rate-limited
-- Next.js route returned 429 in production:
--
--   /api/listings/[kind]/[id]/contact   phone reveal            429 (verified live)
--   /api/geocode                        address lookup          429 (verified live)
--   /api/listings/[kind]/[id]/view      view beacon    {counted:false} (verified live)
--   /api/media/intents (+ /finalize)    photo upload            429
--   /api/job-applications               CV submission           429
--   /api/menu/track, /api/contact/track analytics beacons       429
--   src/app/actions/revalidateListing   cache bust        silent no-op
--
-- Only /api/banner-slots/track escaped, via the explicit `limiterConfigured`
-- guard documented in contract C12 — which is exactly the workaround this
-- migration makes unnecessary.
--
-- The app already owns a Postgres. A fixed-window counter is one upsert, so the
-- shared store lives here instead of behind a third-party account that has to be
-- provisioned before the site works. `checkRateLimit` still prefers Upstash when
-- its two env vars are present, so adding it later needs no code change.

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key        text        PRIMARY KEY,
  count      integer     NOT NULL DEFAULT 0,
  reset_at   timestamptz NOT NULL
);

-- Server-only, exactly like the Upstash store it replaces. No policies are
-- defined: RLS is enabled so a stray anon/authenticated grant can never expose
-- the table, and every legitimate reader goes through the SECURITY DEFINER
-- function below (called with the service-role client).
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;

-- Supports the GC sweep only; the hot path is a primary-key upsert.
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_reset_at
  ON public.rate_limit_counters (reset_at);

-- Atomic INCR-and-test. Mirrors the Upstash pipeline it replaces
-- (INCR key; PEXPIRE key windowMs NX): the window is stamped when the bucket is
-- created and is NOT extended by later hits inside it, so a caller cannot push
-- its own reset time forward by hammering the endpoint.
--
-- Returns TRUE when the call is allowed. The comparison is `<= p_limit` after
-- the increment, so p_limit = 8 permits exactly 8 calls per window.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Reject nonsense rather than silently allowing it: a null/blank key would
  -- collapse every caller into one shared bucket.
  IF p_key IS NULL OR length(p_key) = 0 OR length(p_key) > 512
     OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_counters AS c (key, count, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE
    SET count    = CASE WHEN c.reset_at <= now() THEN 1
                        ELSE c.count + 1 END,
        reset_at = CASE WHEN c.reset_at <= now()
                        THEN now() + make_interval(secs => p_window_seconds)
                        ELSE c.reset_at END
  RETURNING c.count INTO v_count;

  RETURN v_count <= p_limit;
END;
$function$;

-- Called exclusively with the service-role client from Node route handlers.
-- No browser session may reach it.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

-- Expired buckets are dead rows: nothing reads them, and the upsert resets any
-- key it touches again regardless. Without a sweep the table grows once per
-- distinct (ip, endpoint, listing) tuple forever.
--
-- HOURLY, not daily, and deleting as soon as the window closes. Part of the key
-- is caller-supplied — /api/listings/[kind]/[id]/view spends its token before
-- checking the listing exists, so any well-formed UUID mints a row — and the
-- limiter is on the hot path of anonymous endpoints. Sweeping hourly bounds
-- that growth to roughly one hour of traffic for the minute-window routes.
-- It does NOT bound the view beacon, whose window is 24h by design; that key's
-- cardinality is a pre-existing property of the key shape, not of this store.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rate-limit-gc';
    PERFORM cron.schedule(
      'rate-limit-gc',
      '23 * * * *',
      $cron$
      DELETE FROM public.rate_limit_counters WHERE reset_at < now()
      $cron$
    );
  END IF;
END
$$;

-- PostgREST caches the function catalogue; a brand-new RPC is a 404 until reload.
notify pgrst, 'reload schema';

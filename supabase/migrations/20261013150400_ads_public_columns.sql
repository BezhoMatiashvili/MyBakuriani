-- ads: the public read covers the creative only (2026-10-13).
--
-- 'ads public read active' (roles PUBLIC) let anyone read live campaigns' advertiser,
-- share of voice, priority, frequency cap, counters and created_by through PostgREST.
-- Every reader of ads is server-side with the service role (banner-slots-server.ts,
-- the admin ads routes, the analytics RPCs), so the client roles keep only the
-- creative's own columns; the policy and the service role are unchanged.

REVOKE SELECT ON public.ads FROM anon, authenticated;
GRANT SELECT (id, placement, position, title, url, banner_url, start_at, end_at, status, created_at)
  ON public.ads TO anon, authenticated;

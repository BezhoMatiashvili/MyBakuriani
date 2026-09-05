-- Security fix (S3, SECURITY_AUDIT.md 2026-09-05 fourth-pass): live production
-- is safe today for `authenticated`'s read access to `profiles` (its only
-- applicable SELECT policy is "own row" + admin), but that safety comes from
-- an untracked, out-of-band ledger entry (20260705111547 /
-- fix_profiles_rls_perf_regression) with no corresponding file anywhere in
-- supabase/migrations/. That untracked entry renamed and re-scoped a policy
-- that the TRACKED migration 20260705120000_security_audit_critical_fixes.sql
-- creates as "Public can view active-listing owners and reviewers", scoped
-- `TO anon, authenticated`, to "Anon can view active-listing owners and
-- reviewers", scoped `TO anon` only. No tracked migration ever performs that
-- rename/re-scope. A disaster-recovery restore, a fresh CI/staging
-- environment, or `supabase db reset` built from tracked files alone would
-- keep the original broad `anon, authenticated` policy under its original
-- name and silently reopen a real PII leak (phone, Georgian national ID,
-- role) to every signed-in user for every active-listing owner, past
-- reviewer, and published blog author — `authenticated` retains an
-- unrestricted table-level SELECT grant on `profiles`, so only the RLS row
-- predicate stands between it and those columns.
--
-- Drop BOTH possible policy names — the tracked-chain name ("Public can
-- view...") and the live/renamed one ("Anon can view...") — so this
-- migration is correct whether applied to the current live database (where
-- only the second name exists; the first DROP no-ops) or to a fresh rebuild
-- from tracked files alone (where only the first name exists). Recreate
-- under one canonical, anon-only name going forward.
DROP POLICY IF EXISTS "Public can view active-listing owners and reviewers" ON public.profiles;
DROP POLICY IF EXISTS "Anon can view active-listing owners and reviewers" ON public.profiles;

CREATE POLICY "Anon can view active-listing owners and reviewers"
ON public.profiles
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.properties pr
    WHERE pr.owner_id = profiles.id AND pr.status = 'active'::listing_status
  )
  OR EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.owner_id = profiles.id AND s.status = 'active'::listing_status
  )
  OR EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.guest_id = profiles.id
  )
  OR EXISTS (
    SELECT 1 FROM public.blog_posts b
    WHERE b.author_id = profiles.id AND b.published = true
  )
);

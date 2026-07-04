-- cleaner_id -> distinct renters this cleaner has actually served.
--
-- RLS on cleaning_tasks (002_rls_policies.sql "Cleaning task participants":
-- owner_id = auth.uid() OR cleaner_id = auth.uid()) limits a renter to their own
-- rows, so a client-side COUNT(DISTINCT owner_id) per cleaner is always <= 1.
-- This SECURITY DEFINER function exposes ONLY the aggregate count, never any
-- row-level data.
--
-- "Served" = accepted / in_progress / completed (pending/declined/cancelled are
-- mere offers, not a served relationship). Uses idx_cleaning_tasks_cleaner_status
-- (cleaner_id, status). Additive; does NOT touch get_platform_cleaners().
--
-- Rollback: DROP FUNCTION IF EXISTS public.get_cleaner_renter_counts();

CREATE OR REPLACE FUNCTION public.get_cleaner_renter_counts()
RETURNS TABLE (cleaner_id uuid, renters_served bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ct.cleaner_id,
         COUNT(DISTINCT ct.owner_id) AS renters_served
  FROM public.cleaning_tasks ct
  WHERE ct.cleaner_id IS NOT NULL
    AND ct.status IN ('accepted', 'in_progress', 'completed')
  GROUP BY ct.cleaner_id;
$$;

REVOKE ALL ON FUNCTION public.get_cleaner_renter_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cleaner_renter_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cleaner_renter_counts() TO authenticated;

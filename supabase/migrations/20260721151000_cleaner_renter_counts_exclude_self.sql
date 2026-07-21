-- Follow-up to 20260721150000_platform_cleaners_include_own.sql: now that a
-- user's own cleaning service appears in the add-cleaner modal, they can save
-- themselves and send themselves a call-out, creating cleaning_tasks rows with
-- owner_id == cleaner_id. Keep such self-tasks out of the publicly displayed
-- "renters served" trust stat. Same body as
-- 20260628120000_cleaner_renter_counts.sql plus the owner <> cleaner predicate.
-- Rollback: re-apply 20260628120000_cleaner_renter_counts.sql.

CREATE OR REPLACE FUNCTION public.get_cleaner_renter_counts()
RETURNS TABLE (cleaner_id uuid, renters_served bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ct.cleaner_id,
         COUNT(DISTINCT ct.owner_id) AS renters_served
  FROM public.cleaning_tasks ct
  WHERE ct.cleaner_id IS NOT NULL
    AND ct.owner_id <> ct.cleaner_id
    AND ct.status IN ('accepted', 'in_progress', 'completed')
  GROUP BY ct.cleaner_id;
$$;
REVOKE ALL ON FUNCTION public.get_cleaner_renter_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cleaner_renter_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cleaner_renter_counts() TO authenticated;

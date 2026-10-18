-- Drift-detection safety net for the C14 editorial review gate (see
-- memory-bank/contracts.md "C14 -- Editorial review gate for public content").
--
-- There is no unified "listings" table: `properties` and `services` are two
-- separate tables, and which of their columns require admin review before an
-- edit takes effect is enumerated as a hand-written text[] literal, duplicated
-- in two SQL functions --
--   B: prevent_unreviewed_public_content_update()  (20260905142000, the BEFORE
--      UPDATE trigger -- a column missing here means a non-admin CAN write it
--      directly, unreviewed)
--   C: approve_content_change_request()             (20260905122000, applies an
--      approved request -- a column missing here means an approved change to
--      it is silently dropped)
-- Nothing ties either list to the tables' real columns, or checks that B and C
-- agree. That exact shape has already caused two production incidents:
-- 20260718124217_fix_prevent_listing_org_field_reference.sql (a stale column
-- reference broke moderation for every `services` row) and
-- 20260905142000_fix_service_review_gate_status_toggle_bypass.sql (a review
-- bypass). The risk is not fixed, only patched twice -- the next schema change
-- (new column, rename, drop) can silently fall outside both lists with no
-- error from either function.
--
-- This migration adds ONLY a read-only diagnostic function. It does not
-- change what is reviewed, gated, or auto-approved today, and nothing in the
-- app calls it -- it exists for a human (or CI) to run by hand after touching
-- `properties`/`services` DDL or either function above:
--
--   select * from public.content_review_gate_column_drift();
--
-- It reads the two reviewable-column arrays straight out of the LIVE
-- functions' source via pg_get_functiondef(), rather than hard-coding a third
-- copy of them here -- a third copy would itself be exactly the kind of
-- hand-maintained list this migration exists to stop trusting, and would need
-- its own upkeep every time B or C changes. Instead this always re-reads
-- whatever B and C currently say and compares that against:
--   1. each other (they must name the same columns per table), and
--   2. information_schema.columns for public.properties / public.services.
CREATE OR REPLACE FUNCTION public.content_review_gate_column_drift()
RETURNS TABLE (target_table text, column_name text, issue text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_trigger_src text;
  v_approve_src text;
  v_trigger_properties text[];
  v_trigger_services text[];
  v_approve_properties text[];
  v_approve_services text[];
  v_reviewable_properties text[];
  v_reviewable_services text[];
  v_flagged_count int;
BEGIN
  v_trigger_src := pg_get_functiondef('public.prevent_unreviewed_public_content_update'::regproc);
  v_approve_src := pg_get_functiondef('public.approve_content_change_request'::regproc);

  SELECT array_agg(DISTINCT m[1]) INTO v_trigger_properties
  FROM regexp_matches(
    substring(v_trigger_src from $r$WHEN\s+'properties'\s+THEN\s+ARRAY\[([^\]]*)\]$r$),
    $r$'([^']*)'$r$, 'g'
  ) AS m;
  SELECT array_agg(DISTINCT m[1]) INTO v_trigger_services
  FROM regexp_matches(
    substring(v_trigger_src from $r$WHEN\s+'services'\s+THEN\s+ARRAY\[([^\]]*)\]$r$),
    $r$'([^']*)'$r$, 'g'
  ) AS m;
  SELECT array_agg(DISTINCT m[1]) INTO v_approve_properties
  FROM regexp_matches(
    substring(v_approve_src from $r$WHEN\s+'property'\s+THEN\s+ARRAY\[([^\]]*)\]$r$),
    $r$'([^']*)'$r$, 'g'
  ) AS m;
  SELECT array_agg(DISTINCT m[1]) INTO v_approve_services
  FROM regexp_matches(
    substring(v_approve_src from $r$WHEN\s+'service'\s+THEN\s+ARRAY\[([^\]]*)\]$r$),
    $r$'([^']*)'$r$, 'g'
  ) AS m;

  -- Fail loud, not silent-empty: if either function's source no longer
  -- matches this shape (CASE/WHEN/ARRAY[...] of quoted literals), an empty
  -- result set from this function would look identical to "no drift found"
  -- and defeat the point of running it.
  IF v_trigger_properties IS NULL OR v_trigger_services IS NULL
     OR v_approve_properties IS NULL OR v_approve_services IS NULL THEN
    RAISE EXCEPTION
      'content_review_gate_column_drift: could not parse the reviewable-column arrays out of prevent_unreviewed_public_content_update()/approve_content_change_request() -- their source shape changed; update this function''s regexes to match'
      USING ERRCODE = 'P0001';
  END IF;

  -- Direction A: the two hand-maintained copies (trigger vs approve function)
  -- must name the same columns per table. Should always be empty.
  RETURN QUERY
  SELECT 'properties'::text, c, 'reviewable_list_mismatch_between_trigger_and_approve_function'::text
  FROM unnest(v_trigger_properties) c WHERE NOT (c = ANY (v_approve_properties))
  UNION ALL
  SELECT 'properties'::text, c, 'reviewable_list_mismatch_between_trigger_and_approve_function'::text
  FROM unnest(v_approve_properties) c WHERE NOT (c = ANY (v_trigger_properties))
  UNION ALL
  SELECT 'services'::text, c, 'reviewable_list_mismatch_between_trigger_and_approve_function'::text
  FROM unnest(v_trigger_services) c WHERE NOT (c = ANY (v_approve_services))
  UNION ALL
  SELECT 'services'::text, c, 'reviewable_list_mismatch_between_trigger_and_approve_function'::text
  FROM unnest(v_approve_services) c WHERE NOT (c = ANY (v_trigger_services));

  -- The rest of the check uses the union of both copies as "currently
  -- classified reviewable", so a one-sided mismatch (already reported above)
  -- doesn't also drown direction B/C below in duplicate noise.
  SELECT array_agg(DISTINCT x) INTO v_reviewable_properties
  FROM unnest(v_trigger_properties || v_approve_properties) x;
  SELECT array_agg(DISTINCT x) INTO v_reviewable_services
  FROM unnest(v_trigger_services || v_approve_services) x;

  -- Direction B: a live column that isn't in the reviewable set. Expected to
  -- include this table's structural/system columns (id, owner_id, status,
  -- timestamps, VIP/admin/discount bookkeeping, etc.) on every run -- those
  -- are legitimately outside the review gate's scope. This is informational,
  -- not an error: diff it against the previous run and look only at columns
  -- that are new since then.
  RETURN QUERY
  SELECT 'properties'::text, col.column_name::text, 'not_in_reviewable_list'::text
  FROM information_schema.columns col
  WHERE col.table_schema = 'public' AND col.table_name = 'properties'
    AND NOT (col.column_name = ANY (v_reviewable_properties))
  UNION ALL
  SELECT 'services'::text, col.column_name::text, 'not_in_reviewable_list'::text
  FROM information_schema.columns col
  WHERE col.table_schema = 'public' AND col.table_name = 'services'
    AND NOT (col.column_name = ANY (v_reviewable_services));

  -- Direction C ("vice versa"): a column named in either copy no longer
  -- exists on the live table (dropped or renamed). Should always be empty --
  -- a row here means the review gate silently stopped protecting a column it
  -- believes it still covers.
  RETURN QUERY
  SELECT 'properties'::text, r.col::text, 'reviewable_column_missing_from_table'::text
  FROM unnest(v_reviewable_properties) AS r(col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public' AND col.table_name = 'properties' AND col.column_name = r.col
  )
  UNION ALL
  SELECT 'services'::text, r.col::text, 'reviewable_column_missing_from_table'::text
  FROM unnest(v_reviewable_services) AS r(col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public' AND col.table_name = 'services' AND col.column_name = r.col
  );

  -- Surface the two directions that should always be empty as a WARNING (the
  -- "not_in_reviewable_list" direction is expected noise and deliberately not
  -- warned on -- see comment above). Recomputed rather than counted off the
  -- result set above since RETURN QUERY doesn't let this function read back
  -- what it already emitted.
  SELECT count(*) INTO v_flagged_count
  FROM (
    SELECT c FROM unnest(v_trigger_properties) c WHERE NOT (c = ANY (v_approve_properties))
    UNION ALL SELECT c FROM unnest(v_approve_properties) c WHERE NOT (c = ANY (v_trigger_properties))
    UNION ALL SELECT c FROM unnest(v_trigger_services) c WHERE NOT (c = ANY (v_approve_services))
    UNION ALL SELECT c FROM unnest(v_approve_services) c WHERE NOT (c = ANY (v_trigger_services))
    UNION ALL
    SELECT r.col FROM unnest(v_reviewable_properties) AS r(col)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = 'properties' AND col.column_name = r.col)
    UNION ALL
    SELECT r.col FROM unnest(v_reviewable_services) AS r(col)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = 'services' AND col.column_name = r.col)
  ) flagged;
  IF v_flagged_count > 0 THEN
    RAISE WARNING 'content_review_gate_column_drift: % issue(s) found (trigger/approve-function mismatch or a reviewable column missing from its table) -- see issue <> ''not_in_reviewable_list'' rows from public.content_review_gate_column_drift()', v_flagged_count;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.content_review_gate_column_drift() IS
  'C14 diagnostic only -- run manually or from CI after any properties/services '
  'DDL change or edit to prevent_unreviewed_public_content_update()/'
  'approve_content_change_request(). Does not affect what is reviewed, gated, '
  'or auto-approved. issue=reviewable_list_mismatch_between_trigger_and_approve_function '
  'or reviewable_column_missing_from_table should always be empty; '
  'issue=not_in_reviewable_list is expected (structural/system columns) -- diff '
  'against the previous run to spot a genuinely new, unclassified column.';

REVOKE ALL ON FUNCTION public.content_review_gate_column_drift() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

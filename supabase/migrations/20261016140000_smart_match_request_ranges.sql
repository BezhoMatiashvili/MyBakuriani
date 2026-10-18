-- Smart Match request dates and budgets: range checks (2026-10-16, gate round 9
-- F-V5-R9-01).
--
-- smart_match_requests.check_in / check_out (date) and budget_min / budget_max
-- (numeric(10,2)) had no range check, and a guest inserts their own requests
-- (C34, C15). A date can be 'infinity' or years past 5 million, and a numeric can
-- be NaN. Every rental owner sees such a request (bell notice, the inbox), and
-- the renter who answers it then loads the offer's request on their sent-offers
-- list: JSON carries "infinity" / "5874897-12-31", `new Date()` of either is an
-- Invalid Date, date-fns `format` throws, and the whole page falls to the
-- dashboard error screen until the guest cancels the request (the renter cannot).
-- The database now refuses them: dates 2020-01-01 .. 2100-12-31 (NULL stays
-- allowed; NaN sorts above every number, so the budget BETWEEN refuses it too).
-- Real requests are within the next 18 months and budgets are in lari.
--
-- Refuses (55000) while an existing row is outside the ranges, so a project that
-- holds one is fixed by hand first (staging: 13 rows, none).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.smart_match_requests
    WHERE (check_in IS NOT NULL AND NOT (check_in BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'))
       OR (check_out IS NOT NULL AND NOT (check_out BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'))
       OR (budget_min IS NOT NULL AND NOT (budget_min BETWEEN 0 AND 99999999.99))
       OR (budget_max IS NOT NULL AND NOT (budget_max BETWEEN 0 AND 99999999.99))
  ) THEN
    RAISE EXCEPTION 'a smart_match_requests row has a date outside 2020..2100 or a budget outside 0..99999999.99; fix it first'
      USING ERRCODE = '55000';
  END IF;
END
$$;

ALTER TABLE public.smart_match_requests
  ADD CONSTRAINT smart_match_requests_dates_range CHECK (
    (check_in IS NULL OR check_in BETWEEN DATE '2020-01-01' AND DATE '2100-12-31')
    AND (check_out IS NULL OR check_out BETWEEN DATE '2020-01-01' AND DATE '2100-12-31')
  ),
  ADD CONSTRAINT smart_match_requests_budget_range CHECK (
    (budget_min IS NULL OR budget_min BETWEEN 0 AND 99999999.99)
    AND (budget_max IS NULL OR budget_max BETWEEN 0 AND 99999999.99)
  );

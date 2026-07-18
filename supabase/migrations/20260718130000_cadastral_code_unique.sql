-- Enforce global uniqueness of a property's cadastral code (საკადასტრო კოდი).
--
-- A cadastral code identifies a single physical property, so no two listings may
-- share one. The column was previously free-form (nullable TEXT, only plain +
-- trigram indexes), which allowed duplicates. This adds a partial UNIQUE index
-- and first resolves the pre-existing duplicates that would block its creation.
--
-- NULL / empty codes are intentionally excluded from the constraint: rentals may
-- omit a cadastral code entirely, so many rows can legitimately have none.

-- 1) Resolve existing duplicates. Keep the earliest-created row's code and blank
--    out the code on the rest (non-destructive: the listings themselves remain,
--    they just lose the shared code). Generic so it clears any dup group, not
--    only today's known '12.12.12.12' x6 test rows.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY cadastral_code
      ORDER BY created_at, id
    ) AS rn
  FROM public.properties
  WHERE cadastral_code IS NOT NULL
    AND btrim(cadastral_code) <> ''
)
UPDATE public.properties p
SET cadastral_code = NULL
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2) Enforce uniqueness on non-blank codes. Partial predicate keeps unlimited
--    NULL/blank codes allowed while guaranteeing each real code appears once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_cadastral_unique
  ON public.properties (cadastral_code)
  WHERE cadastral_code IS NOT NULL AND btrim(cadastral_code) <> '';

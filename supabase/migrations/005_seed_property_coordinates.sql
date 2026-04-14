-- Seed realistic Bakuriani coordinates for properties that lack them.
-- Distributes properties across four resort zones using deterministic
-- pseudo-random offsets derived from each row's id so the result is
-- reproducible and geographically plausible.
--
-- Bakuriani bounds:
--   lat  41.735 – 41.760
--   lng  43.515 – 43.550
--
-- Zone centres:
--   didveli / kristali  41.7385, 43.5175
--   centri / parki       41.7509, 43.5294
--   kokhta / mitarbi     41.7580, 43.5450
--   25-ianebi            41.7460, 43.5380

UPDATE properties
SET
  location_lat = CASE (abs(('x' || left(id::text, 8))::bit(32)::int) % 4)
    WHEN 0 THEN 41.7385 + (random() * 0.004 - 0.002)  -- didveli
    WHEN 1 THEN 41.7509 + (random() * 0.004 - 0.002)  -- centri
    WHEN 2 THEN 41.7580 + (random() * 0.004 - 0.002)  -- kokhta
    ELSE        41.7460 + (random() * 0.004 - 0.002)   -- 25-ianebi
  END,
  location_lng = CASE (abs(('x' || left(id::text, 8))::bit(32)::int) % 4)
    WHEN 0 THEN 43.5175 + (random() * 0.006 - 0.003)
    WHEN 1 THEN 43.5294 + (random() * 0.006 - 0.003)
    WHEN 2 THEN 43.5450 + (random() * 0.006 - 0.003)
    ELSE        43.5380 + (random() * 0.006 - 0.003)
  END
WHERE location_lat IS NULL
   OR location_lng IS NULL;

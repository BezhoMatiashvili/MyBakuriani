-- Backfill sample equipment + languages on seeded demo transport listings so the
-- redesigned "აღჭურვილობა და უსაფრთხოება" section is visible on the demo detail page.
-- Non-destructive: only fills rows where the data is currently missing/empty.

UPDATE public.services
SET
  equipment = ARRAY[
    'ზამთრის საბურავები',
    'მოცურების ჯაჭვები',
    'თხილამურის საბარგული',
    'ბავშვის სავარძელი'
  ],
  languages = COALESCE(NULLIF(languages, '{}'), ARRAY['ქართული', 'English'])
WHERE category = 'transport'
  AND (equipment IS NULL OR equipment = '{}');

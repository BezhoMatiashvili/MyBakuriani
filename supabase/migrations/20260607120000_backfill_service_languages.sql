-- Backfill spoken-languages for seeded service providers so the
-- "ენები" (languages) card renders on the service detail page.
-- Idempotent: only fills rows that currently have no languages set,
-- so existing language data (employment/transport) is never overwritten.
update public.services
set languages = array['ქართული', 'English', 'Русский']
where languages is null
  and category in ('cleaning', 'handyman', 'entertainment', 'food');

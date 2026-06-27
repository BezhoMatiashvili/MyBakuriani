-- Block base64 / oversized photo strings from ever being stored in photo arrays.
--
-- Context: a few listings stored multi-MB base64 `data:` URLs in
-- properties.photos / services.photos. The detail page embeds them in the SSR
-- HTML + RSC payload + og:image, which pushed the serverless response past
-- Vercel's ~4.5 MB limit and 500'd the route. The legacy data was first moved to
-- the property-photos Storage bucket (scripts/migrate-base64-photos.ts); this
-- constraint backstops the (already Storage-based) app upload path so the bad
-- state can never recur, regardless of which client writes.

create or replace function public.photos_are_storage_urls(p text[])
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p is null or not exists (
    select 1 from unnest(p) as x
    where x like 'data:%' or x like 'blob:%' or length(x) > 2048
  );
$$;

alter table public.properties
  add constraint properties_photos_no_base64
  check (public.photos_are_storage_urls(photos));

alter table public.services
  add constraint services_photos_no_base64
  check (public.photos_are_storage_urls(photos));

-- Rollback:
--   alter table public.properties drop constraint properties_photos_no_base64;
--   alter table public.services   drop constraint services_photos_no_base64;
--   drop function public.photos_are_storage_urls(text[]);

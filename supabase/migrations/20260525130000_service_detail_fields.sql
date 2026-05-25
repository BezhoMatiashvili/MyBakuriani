-- Additive, non-destructive: structured fields for entertainment + food listings.
-- These are captured by the create forms but previously had no columns
-- (entertainment attributes were mashed into `description`; food restaurant
-- type was dropped). Detail pages read these to show what the seller entered.

alter table public.services
  add column if not exists activity_type text,       -- გართობის ტიპი (label)
  add column if not exists activity_category text,   -- კატეგორია (label)
  add column if not exists duration text,            -- ხანგრძლივობა (label)
  add column if not exists age_min text,             -- ასაკი (label)
  add column if not exists good_for text,            -- ვისთვის (label)
  add column if not exists coords jsonb,             -- {lat,lng} from map picker
  add column if not exists restaurant_type text;     -- რესტორნის ტიპი (label)

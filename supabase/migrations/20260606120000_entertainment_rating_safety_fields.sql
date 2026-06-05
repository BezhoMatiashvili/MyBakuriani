-- Additive, non-destructive: rating, review count, and safety/conditions for
-- entertainment listings. `rating` + `reviews_count` power the ⭐ block on the
-- detail page (no service review system exists yet — these are seeded/admin-set
-- and hidden when null). `safety_notes` is captured by the create form's new
-- "უსაფრთხოება და პირობები" field and shown in the safety info box.

alter table public.services
  add column if not exists rating numeric(2,1),     -- ★ rating, e.g. 5.0
  add column if not exists reviews_count integer,   -- შეფასებების რაოდენობა
  add column if not exists safety_notes text;        -- უსაფრთხოება და პირობები

-- Reviews were retired on 2026-10-24 (20261024130000). Close the last client write path: a signed-in
-- user could still INSERT a review through PostgREST and an admin session could UPDATE one (the
-- lifecycle trigger exempts admins). Data stays as it is, hidden; nothing in the app writes reviews.

revoke insert, update on table public.reviews from authenticated;
revoke select on table public.reviews from anon;
drop policy if exists "Guests can write reviews" on public.reviews;
drop policy if exists "reviews admin update" on public.reviews;

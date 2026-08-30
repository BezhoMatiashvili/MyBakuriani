-- The prior migration (revoke_anon_pii_columns_on_profiles) revoked column-level
-- SELECT for anon on the sensitive columns, but anon also held a broad TABLE-level
-- SELECT grant (relacl showed anon=arwdDxtm) predating this fix. In Postgres, a
-- table-level SELECT grant permits every column regardless of column-level REVOKEs
-- targeting the same role — column grants only ADD narrow access for roles that
-- lack table-level SELECT, they cannot carve out an exception from it. Replace the
-- blanket table-level SELECT with an explicit column allow-list for anon.
--
-- See memory-bank/contracts.md C25 for the full writeup and verification trail.
revoke select on public.profiles from anon;

grant select (
  id, display_name, avatar_url, is_verified, bio, rating,
  response_time_minutes, verified_at, created_at, updated_at, profile_type
) on public.profiles to anon;

notify pgrst, 'reload schema';

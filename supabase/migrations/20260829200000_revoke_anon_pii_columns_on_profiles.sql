-- Close PII leak: the "Anon can view active-listing owners and reviewers" RLS
-- policy on public.profiles grants anon SELECT on rows for blog-post authors
-- (the only currently-live branch, since properties/services/reviews have no
-- anon SELECT policy of their own). Column grants were never narrowed, so anon
-- could read phone/personal_id/role/etc. Scope the fix to anon only so a
-- user's own "Users can view own profile" access is untouched.
--
-- NOTE: this column-level REVOKE alone turned out to be ineffective — see the
-- follow-up migration 20260829200100_fix_anon_profiles_grant_table_level_revoke.sql
-- for why, and memory-bank/contracts.md C25 for the full writeup. Kept as-is for
-- an honest history rather than rewritten.
revoke select (phone, personal_id, notification_prefs, marketing_opt_out, role)
  on public.profiles from anon;

notify pgrst, 'reload schema';

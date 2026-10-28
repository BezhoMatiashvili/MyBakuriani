-- A listing's cadastral code is private unless its owner shows it (owner, 2026-10-28, C57).
--
-- properties.cadastral_code_public already decides whether the code reaches the public:
-- public_properties masks it when false (20260919120000) and global_search matches only
-- public codes (20260925121000). The column defaulted to true and the rental form never set
-- it, so every rental's code showed on its page. Now it defaults to false and every existing
-- listing is hidden; the owner shows it with the switch in the rental or sale form. Admin
-- panels read the base table, so admins keep seeing every code.
--
-- The UPDATE fires only the row triggers without a column list (review gate, protected
-- fields, updated_at, audit); none of them gates this column. Safe before or after the app:
-- the old sale form loads the stored value into its switch and saves it back.

ALTER TABLE public.properties ALTER COLUMN cadastral_code_public SET DEFAULT false;

UPDATE public.properties SET cadastral_code_public = false WHERE cadastral_code_public;

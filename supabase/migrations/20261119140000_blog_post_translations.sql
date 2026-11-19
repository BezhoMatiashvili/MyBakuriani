-- Blog posts in English and Russian (CEO, 2026-11-19, C60).
--
-- A post was Georgian only: /en/blog/<slug> and /ru/blog/<slug> printed the Georgian text.
-- The admin now types a translation per language. A translation is its title AND its body
-- (the excerpt is optional); the CHECKs refuse half of one, so a page never mixes languages
-- (src/lib/blog/translations.ts:localizeBlogPost). The slug, media and publish state stay
-- shared by every language.
--
-- No GRANT change: anon/authenticated read blog_posts through a table-level SELECT (RLS:
-- published rows only), which covers new columns; client writes stay revoked (C34), the
-- admin routes write with the service role. Safe before the app (the old app never names
-- these columns); the new app needs it first (its selects name them).

ALTER TABLE public.blog_posts
  ADD COLUMN title_en text,
  ADD COLUMN excerpt_en text,
  ADD COLUMN content_en text,
  ADD COLUMN title_ru text,
  ADD COLUMN excerpt_ru text,
  ADD COLUMN content_ru text;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_en_complete CHECK ((title_en IS NULL) = (content_en IS NULL)),
  ADD CONSTRAINT blog_posts_ru_complete CHECK ((title_ru IS NULL) = (content_ru IS NULL));

-- Global keyword search across properties, services, and blog_posts.
-- pg_trgm is already enabled; add GIN indexes where they don't already exist,
-- then define a single RPC that returns a unified, fuzzy-ranked result set.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_properties_title_trgm
  ON public.properties USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_description_trgm
  ON public.properties USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_cadastral_trgm
  ON public.properties USING gin (cadastral_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_services_title_trgm
  ON public.services USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_services_description_trgm
  ON public.services USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_services_location_trgm
  ON public.services USING gin (location gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_blog_posts_title_trgm
  ON public.blog_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_blog_posts_excerpt_trgm
  ON public.blog_posts USING gin (excerpt gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_blog_posts_content_trgm
  ON public.blog_posts USING gin (content gin_trgm_ops);

-- Unified search function
CREATE OR REPLACE FUNCTION public.global_search(
  q text,
  entity_types text[] DEFAULT ARRAY['properties','services','blog_posts'],
  result_limit int DEFAULT 80
)
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  title text,
  snippet text,
  slug text,
  photo text,
  sim real,
  payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q_norm AS (
    SELECT lower(trim(coalesce(q, ''))) AS qn
  )
  SELECT * FROM (
    SELECT
      'properties'::text AS entity_type,
      p.id AS entity_id,
      p.title,
      COALESCE(p.location, p.description, '')::text AS snippet,
      p.id::text AS slug,
      COALESCE(p.photos[1], '')::text AS photo,
      GREATEST(
        similarity(lower(p.title), qn),
        similarity(lower(COALESCE(p.description, '')), qn),
        similarity(lower(COALESCE(p.location, '')), qn),
        CASE
          WHEN p.cadastral_code IS NOT NULL
          THEN similarity(lower(p.cadastral_code), qn) * 1.5
          ELSE 0
        END
      )::real AS sim,
      to_jsonb(p) AS payload
    FROM public.properties p, q_norm
    WHERE p.status = 'active'
      AND 'properties' = ANY(entity_types)
      AND qn <> ''
      AND (
        lower(p.title) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.description, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.location, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.cadastral_code, '')) ILIKE '%' || qn || '%'
        OR similarity(lower(p.title), qn) > 0.15
        OR similarity(lower(COALESCE(p.description, '')), qn) > 0.15
        OR similarity(lower(COALESCE(p.location, '')), qn) > 0.15
      )

    UNION ALL

    SELECT
      'services'::text,
      s.id,
      s.title,
      COALESCE(s.location, s.description, '')::text,
      s.id::text,
      COALESCE(s.photos[1], '')::text,
      GREATEST(
        similarity(lower(s.title), qn),
        similarity(lower(COALESCE(s.description, '')), qn),
        similarity(lower(COALESCE(s.location, '')), qn),
        similarity(lower(COALESCE(s.cuisine_type, '')), qn),
        similarity(lower(COALESCE(s.position, '')), qn)
      )::real,
      to_jsonb(s)
    FROM public.services s, q_norm
    WHERE s.status = 'active'
      AND 'services' = ANY(entity_types)
      AND qn <> ''
      AND (
        lower(s.title) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.description, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.location, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.cuisine_type, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.position, '')) ILIKE '%' || qn || '%'
        OR similarity(lower(s.title), qn) > 0.15
        OR similarity(lower(COALESCE(s.description, '')), qn) > 0.15
        OR similarity(lower(COALESCE(s.location, '')), qn) > 0.15
      )

    UNION ALL

    SELECT
      'blog_posts'::text,
      b.id,
      b.title,
      COALESCE(b.excerpt, left(b.content, 200), '')::text,
      b.slug,
      COALESCE(b.image_url, '')::text,
      GREATEST(
        similarity(lower(b.title), qn),
        similarity(lower(COALESCE(b.excerpt, '')), qn),
        similarity(lower(COALESCE(b.content, '')), qn)
      )::real,
      to_jsonb(b)
    FROM public.blog_posts b, q_norm
    WHERE b.published = true
      AND 'blog_posts' = ANY(entity_types)
      AND qn <> ''
      AND (
        lower(b.title) ILIKE '%' || qn || '%'
        OR lower(COALESCE(b.excerpt, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(b.content, '')) ILIKE '%' || qn || '%'
        OR similarity(lower(b.title), qn) > 0.15
      )
  ) hits
  ORDER BY sim DESC NULLS LAST
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text, text[], int) TO anon, authenticated;

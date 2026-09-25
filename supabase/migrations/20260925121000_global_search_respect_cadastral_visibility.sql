-- global_search must not match on a cadastral code the seller chose to hide.
--
-- Security audit 2026-09-25: 20260919120000 masked cadastral_code in the
-- public_properties view when cadastral_code_public = false, but global_search
-- (SECURITY DEFINER, reads the raw properties table, reached anonymously via the
-- `search` edge function) still matched `q` against the raw code with ILIKE and
-- boosted ranking by similarity to it. Whether a listing appeared in the results
-- (and where) therefore revealed a hidden code one prefix at a time.
--
-- Body is verbatim from the live pg_get_functiondef except the two cadastral
-- terms, which are now gated on p.cadastral_code_public. Hidden codes no longer
-- participate in matching or ranking; public codes behave exactly as before.

CREATE OR REPLACE FUNCTION public.global_search(q text, entity_types text[] DEFAULT ARRAY['properties'::text, 'services'::text, 'blog_posts'::text], result_limit integer DEFAULT 80)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, snippet text, slug text, photo text, sim real, payload jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
          WHEN p.cadastral_code IS NOT NULL AND p.cadastral_code_public
          THEN similarity(lower(p.cadastral_code), qn) * 1.5
          ELSE 0
        END
      )::real AS sim,
      to_jsonb(p) - 'admin_notes' AS payload
    FROM public.properties p, q_norm
    WHERE p.status = 'active'
      AND (
        p.organization_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.organizations o
          WHERE o.id = p.organization_id AND o.status = 'active'
        )
      )
      AND 'properties' = ANY(entity_types)
      AND qn <> ''
      AND (
        lower(p.title) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.description, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.location, '')) ILIKE '%' || qn || '%'
        OR (p.cadastral_code_public AND lower(COALESCE(p.cadastral_code, '')) ILIKE '%' || qn || '%')
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
      to_jsonb(s) - 'admin_notes'
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
$function$;

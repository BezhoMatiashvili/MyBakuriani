-- Keep extension-owned functions/operators out of the API-facing public
-- schema. Existing trigram indexes retain their operator-class OIDs.

create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- global_search is the only application function that resolves similarity()
-- at execution time.
alter function public.global_search(text, text[], integer)
  set search_path = public, extensions;

-- storage.objects type trigger: client writes only (2026-10-14, C5).
--
-- 20261013151100 checked every row, so storage-api's signed-upload test insert, which runs as
-- the service role and carries the sign request's own application/json type, was refused:
-- createSignedUploadUrl failed for /api/admin/media/sign-upload (admin media uploads) and
-- /api/media/intents. The trigger now checks only rows written for anon or authenticated
-- (the role storage-api sets from the caller's JWT, or the JWT claims): a client's copy,
-- move or metadata update with a type outside the bucket's list is still refused (its
-- test insert runs under the client's role and carries the destination metadata), while the
-- service role, which only server code holds, writes as before.
--
-- Body = the live staging definition plus the role test; the guard refuses (55000) where
-- the live body differs. CREATE OR REPLACE keeps the function's ACL.

do $guard$
declare
  v_live text;
begin
  select md5(p.prosrc) into v_live
    from pg_proc p where p.oid = to_regprocedure('public.enforce_storage_object_mime()');
  if v_live is distinct from '9b8c953be105f4cb3ce1f23eb99a500c' then
    raise exception 'storage_object_mime_client_writes: enforce_storage_object_mime() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.enforce_storage_object_mime()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_allowed text[];
  v_mime text;
BEGIN
  -- Only rows written for a client (anon/authenticated) are checked. The service role is
  -- server code holding the secret key, and storage-api already checks the bucket's list
  -- on every upload; its signed-upload test insert carries the sign request's own JSON type.
  IF coalesce(current_setting('role', true), '') NOT IN ('anon', 'authenticated')
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.metadata IS NULL OR NOT (NEW.metadata ? 'mimetype') OR jsonb_typeof(NEW.metadata -> 'mimetype') = 'null' THEN
    RETURN NEW;
  END IF;

  SELECT b.allowed_mime_types INTO v_allowed
    FROM storage.buckets b
   WHERE b.id = NEW.bucket_id;
  IF v_allowed IS NULL OR cardinality(v_allowed) = 0 THEN
    RETURN NEW;
  END IF;

  v_mime := lower(btrim(split_part(NEW.metadata ->> 'mimetype', ';', 1)));
  IF v_mime <> '' AND EXISTS (
    SELECT 1
      FROM unnest(v_allowed) AS a(m)
     WHERE lower(btrim(a.m)) = v_mime
        OR (right(btrim(a.m), 2) = '/*'
            AND split_part(lower(btrim(a.m)), '/', 1) = split_part(v_mime, '/', 1))
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'new row violates row-level security policy for table "objects"'
    USING ERRCODE = '42501',
          DETAIL = 'Storage object type is not allowed in this bucket.';
END;
$function$;

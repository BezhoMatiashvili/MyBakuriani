-- Ownership-document clean-up schedule (C39). Every hour pg_cron POSTs to
-- /api/ownership-verifications/purge, which deletes the ID cards and registry
-- extracts no pending request needs any more (decided, discarded, failed,
-- unsubmitted for 24 h, or ownerless) through the Storage API: SQL cannot
-- delete storage objects (storage.protect_delete), so the deletion is HTTP.
-- The route authenticates the Bearer by comparing its SHA-256 with
-- OWNERSHIP_PURGE_SECRET_SHA256 (timing-safe).
--
-- The API routes already purge right after every decision, submit and upload;
-- this job is what bounds abandoned uploads (within 25 h) and retries a purge
-- that failed.
--
-- Refuses to apply unless both Vault entries exist:
--   app.ownership_purge_url     https://<site>/api/ownership-verifications/purge
--   app.ownership_purge_secret  random secret that never leaves the database
--
-- Provision the secret INSIDE the database, so only its hash is ever copied:
--   select vault.create_secret(
--     encode(extensions.gen_random_bytes(32), 'hex'), 'app.ownership_purge_secret');
--   select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
--   from vault.decrypted_secrets where name = 'app.ownership_purge_secret';
--   -- → set as OWNERSHIP_PURGE_SECRET_SHA256 on the app (DO, SECRET, RUN_TIME)
--
-- Deploy the app with the route BEFORE applying this, or every run 404s. In
-- the same change add 'ownership-document-purge-hourly' to the C4 expected
-- list in scripts/check-db-contracts.mjs (a missing expected job FAILS there).
-- /api/* is outside the prod site lock (C27), and the route is exempt from
-- the middleware Origin check by exact path (src/lib/ownership/server-paths.ts).
--
-- Emergency stop:
--   select cron.unschedule(jobid) from cron.job where jobname = 'ownership-document-purge-hourly';

do $$
declare
  v_key text;
begin
  foreach v_key in array array['app.ownership_purge_url', 'app.ownership_purge_secret'] loop
    if coalesce((
      select decrypted_secret
      from vault.decrypted_secrets
      where name = v_key
      limit 1
    ), '') = '' then
      raise exception 'Refusing to schedule the ownership-document purge: % is unset', v_key
        using errcode = '22023';
    end if;
  end loop;

  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Refusing to schedule the ownership-document purge: pg_cron and pg_net are required'
      using errcode = '55000';
  end if;
end $$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'ownership-document-purge-hourly';

  perform cron.schedule(
    'ownership-document-purge-hourly',
    '17 * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app.ownership_purge_url' limit 1),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app.ownership_purge_secret' limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cron$
  );
end $$;

-- Expected job:
-- ownership-document-purge-hourly  17 * * * *

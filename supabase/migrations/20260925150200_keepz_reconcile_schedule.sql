-- Keepz reconcile sweeper schedule (C32). Every 10 minutes pg_cron POSTs to
-- /api/payments/keepz/reconcile, which settles Keepz orders whose callback
-- never arrived and whose payer never came back, and follows up refunds Keepz
-- acknowledged but has not finished. The route authenticates the Bearer by
-- comparing its SHA-256 with KEEPZ_RECONCILE_SECRET_SHA256 (timing-safe).
--
-- Refuses to apply unless both Vault entries exist:
--   app.keepz_reconcile_url     https://<site>/api/payments/keepz/reconcile
--   app.keepz_reconcile_secret  random secret that never leaves the database
--
-- Provision the secret INSIDE the database, so it never appears in a
-- transcript, a terminal or the app env — only its hash does:
--   select vault.create_secret(
--     encode(extensions.gen_random_bytes(32), 'hex'), 'app.keepz_reconcile_secret');
--   select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
--   from vault.decrypted_secrets where name = 'app.keepz_reconcile_secret';
--   -- → set as KEEPZ_RECONCILE_SECRET_SHA256 on the app (DO, SECRET, RUN_TIME)
--
-- Deploy the app with the route BEFORE applying this, or every run 404s.
-- /api/* is outside the prod site lock (C27), and the route is exempt from
-- the middleware Origin check by exact path (server-paths.ts).
--
-- Emergency stop:
--   select cron.unschedule(jobid) from cron.job where jobname = 'keepz-reconcile-10min';

do $$
declare
  v_key text;
begin
  foreach v_key in array array['app.keepz_reconcile_url', 'app.keepz_reconcile_secret'] loop
    if coalesce((
      select decrypted_secret
      from vault.decrypted_secrets
      where name = v_key
      limit 1
    ), '') = '' then
      raise exception 'Refusing to schedule the Keepz sweeper: % is unset', v_key
        using errcode = '22023';
    end if;
  end loop;

  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Refusing to schedule the Keepz sweeper: pg_cron and pg_net are required'
      using errcode = '55000';
  end if;
end $$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'keepz-reconcile-10min';

  perform cron.schedule(
    'keepz-reconcile-10min',
    '*/10 * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app.keepz_reconcile_url' limit 1),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app.keepz_reconcile_secret' limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cron$
  );
end $$;

-- Expected job:
-- keepz-reconcile-10min  */10 * * * *

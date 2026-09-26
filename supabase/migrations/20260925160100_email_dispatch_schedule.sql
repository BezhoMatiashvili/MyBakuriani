-- Email dispatcher schedule (C33). Every 5 minutes pg_cron POSTs to
-- /api/email/dispatch, which sends queued notification emails through Resend
-- and syncs Resend marketing contacts. The route authenticates the Bearer by
-- comparing its SHA-256 with EMAIL_DISPATCH_SECRET_SHA256 (timing-safe).
--
-- Refuses to apply unless both Vault entries exist:
--   app.email_dispatch_url     https://<site>/api/email/dispatch
--   app.email_dispatch_secret  random secret that never leaves the database
--
-- Provision the secret INSIDE the database, so only its hash is ever copied:
--   select vault.create_secret(
--     encode(extensions.gen_random_bytes(32), 'hex'), 'app.email_dispatch_secret');
--   select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
--   from vault.decrypted_secrets where name = 'app.email_dispatch_secret';
--   -- → set as EMAIL_DISPATCH_SECRET_SHA256 on the app (DO, SECRET, RUN_TIME)
--
-- Deploy the app with the route BEFORE applying this, or every run 404s.
-- Nothing is sent until EMAIL_DELIVERY_ENABLED=true on the app.
--
-- Emergency stop:
--   select cron.unschedule(jobid) from cron.job where jobname = 'email-dispatch-5min';

do $$
declare
  v_key text;
begin
  foreach v_key in array array['app.email_dispatch_url', 'app.email_dispatch_secret'] loop
    if coalesce((
      select decrypted_secret
      from vault.decrypted_secrets
      where name = v_key
      limit 1
    ), '') = '' then
      raise exception 'Refusing to schedule the email dispatcher: % is unset', v_key
        using errcode = '22023';
    end if;
  end loop;

  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Refusing to schedule the email dispatcher: pg_cron and pg_net are required'
      using errcode = '55000';
  end if;
end $$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'email-dispatch-5min';

  perform cron.schedule(
    'email-dispatch-5min',
    '*/5 * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app.email_dispatch_url' limit 1),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app.email_dispatch_secret' limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cron$
  );
end $$;

-- Expected job:
-- email-dispatch-5min  */5 * * * *

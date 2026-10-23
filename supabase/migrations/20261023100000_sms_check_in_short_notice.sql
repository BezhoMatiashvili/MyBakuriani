-- Check-in text for a booking the daily run cannot reach (C4, C18).
--
-- `sms-automation-daily` (06:00 UTC = 10:00 in Tbilisi) texts the stays that begin
-- tomorrow. A booking made after that run for its check-in, or for today, was never
-- texted. This job posts {"mode":"short_notice"} to the same function every five
-- minutes; the function then texts such a booking once it is an hour old, and does
-- nothing else (tomorrow's check-ins, review requests and win-backs stay with the
-- daily run, which keeps its time of day).
--
-- DEPLOY ORDER: redeploy sms-automation-run BEFORE applying this. The previous
-- version ignores the body and would run the full daily pass every five minutes,
-- texting tomorrow's check-ins and yesterday's reviews around the clock.
--
-- Reuses the Vault entries of the daily job. Refuses (55000) where they are missing,
-- so the change is never recorded as done on a project that cannot run it.
--
-- Roll back:
--   select cron.unschedule('sms-check-in-short-notice');

do $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'app.sms_automation_run_url'
   limit 1;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'app.sms_automation_run_secret'
   limit 1;

  if nullif(v_url, '') is null or nullif(v_secret, '') is null then
    raise exception 'Refusing to schedule the short-notice check-in job: Vault app.sms_automation_run_url / app.sms_automation_run_secret are missing'
      using errcode = '55000';
  end if;

  perform cron.unschedule(jobid)
    from cron.job
   where jobname = 'sms-check-in-short-notice';

  perform cron.schedule(
    'sms-check-in-short-notice',
    '*/5 * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app.sms_automation_run_url' limit 1),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app.sms_automation_run_secret' limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{"mode":"short_notice"}'::jsonb,
      timeout_milliseconds := 60000
    );
    $cron$
  );
end $$;

-- Expected job:
-- sms-check-in-short-notice  */5 * * * *

-- Go-live switch for the booking-finalize -> SMS automation -> dispatch pipeline.
-- This migration intentionally fails unless every URL and matching shared secret
-- is present. Queue generation may be enabled while delivery remains fail-closed
-- through the SMS_DELIVERY_ENABLED=false Edge Function secret.
--
-- Edge Function secrets required before applying:
--   BOOKING_FINALIZE_SECRET, SMS_AUTOMATION_RUN_SECRET, SMS_DISPATCH_SECRET,
--   SITE_URL=https://my-bakuriani.vercel.app, SMS_DELIVERY_ENABLED=false
--
-- Database settings required (ALTER DATABASE postgres SET ..., then reconnect):
--   app.booking_finalize_url / app.booking_finalize_secret
--   app.sms_automation_run_url / app.sms_automation_run_secret
--   app.sms_dispatch_url / app.sms_dispatch_secret
--
-- Emergency stop:
--   select cron.unschedule(jobid) from cron.job
--   where jobname in ('booking-finalize-daily','sms-automation-daily','sms-dispatch-frequent');

do $$
declare
  v_key text;
begin
  foreach v_key in array array[
    'app.booking_finalize_url',
    'app.booking_finalize_secret',
    'app.sms_automation_run_url',
    'app.sms_automation_run_secret',
    'app.sms_dispatch_url',
    'app.sms_dispatch_secret'
  ] loop
    if coalesce(current_setting(v_key, true), '') = '' then
      raise exception 'Refusing to schedule SMS pipeline: % is unset', v_key
        using errcode = '22023';
    end if;
  end loop;

  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Refusing to schedule SMS pipeline: pg_cron and pg_net are required'
      using errcode = '55000';
  end if;
end $$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job
  where jobname in (
    'booking-finalize-daily', 'sms-automation-hourly',
    'sms-automation-daily', 'sms-dispatch-frequent'
  );

  -- Complete stays before the 10:00 Tbilisi automation scan so yesterday's
  -- checkout rows are eligible for the review request.
  perform cron.schedule(
    'booking-finalize-daily',
    '50 5 * * *',
    $cron$
    select net.http_post(
      url := current_setting('app.booking_finalize_url', true),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.booking_finalize_secret', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );

  -- 06:00 UTC is exactly 10:00 in Georgia (UTC+4, no DST).
  perform cron.schedule(
    'sms-automation-daily',
    '0 6 * * *',
    $cron$
    select net.http_post(
      url := current_setting('app.sms_automation_run_url', true),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.sms_automation_run_secret', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );

  perform cron.schedule(
    'sms-dispatch-frequent',
    '*/10 * * * *',
    $cron$
    select net.http_post(
      url := current_setting('app.sms_dispatch_url', true),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.sms_dispatch_secret', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
end $$;

drop function if exists public.sms_automation_run_cron();

-- Expected jobs:
-- booking-finalize-daily  50 5 * * *
-- sms-automation-daily    0 6 * * *
-- sms-dispatch-frequent   */10 * * * *

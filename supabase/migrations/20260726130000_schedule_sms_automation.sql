-- SMS automation module, migration D of D: TURN THE CRON ON. See sms.md P10.
--
-- ############################################################################
-- #  NOT YET APPLIED.  This is the go-live switch.                           #
-- #  Do NOT apply until (a) the SEVEN prerequisites below are set, and        #
-- #  (b) sms.md P6-P9 have shipped (the owner-facing controls and the         #
-- #  rental-only nav gate). Nothing fires until this lands.                   #
-- ############################################################################
--
-- ABORT (stops all automation immediately, no deploy needed):
--   select cron.unschedule('sms-automation-daily');
--   select cron.unschedule('sms-dispatch-frequent');
--
-- ---------------------------------------------------------------------------
-- MANUAL PREREQUISITES - seven values, ALL verified unset on 2026-07-25.
-- The migration REFUSES TO APPLY until the four GUCs exist (see the guard
-- below); that is deliberate. The older road-condition job was scheduled with
-- its GUC unset, so every run posted to a NULL url and it failed 41/41 times
-- while looking healthy in cron.job. This will not repeat that.
--
-- 1. Extensions (already present: pg_cron 1.6.4, pg_net 0.20.0):
--      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
--      CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
--
-- 2. Edge-function secrets (Supabase dashboard -> Edge Functions -> Secrets):
--      SMS_AUTOMATION_RUN_SECRET = <random>
--      SMS_DISPATCH_SECRET       = <random>
--      SITE_URL                  = https://my-bakuriani.vercel.app
--    NOTE: sms.md P5 claims SMS_DISPATCH_SECRET is already set. It is NOT -
--    the deployed function returns 500 ENV_MISSING for it (probed 2026-07-25).
--    SITE_URL is required by sms-automation-run or it refuses to run rather
--    than emit relative links into an SMS.
--
-- 3. Postgres GUCs (SQL editor, once). Each MUST equal its edge secret exactly;
--    a mismatch makes the job report success while the function 401s and
--    sms_outbound never gains a row - the hardest failure mode to notice.
--      ALTER DATABASE postgres SET app.sms_automation_run_url =
--        'https://yuwyrmxccrpfjvidwhhg.supabase.co/functions/v1/sms-automation-run';
--      ALTER DATABASE postgres SET app.sms_automation_run_secret = '<same as edge secret>';
--      ALTER DATABASE postgres SET app.sms_dispatch_url =
--        'https://yuwyrmxccrpfjvidwhhg.supabase.co/functions/v1/sms-dispatch';
--      ALTER DATABASE postgres SET app.sms_dispatch_secret = '<same as edge secret>';
--    (A GUC set via ALTER DATABASE only applies to NEW sessions - reconnect before
--    applying this migration, or current_setting will still read NULL.)
-- ---------------------------------------------------------------------------

-- 1. Retire the broken hourly job and its empty stub.
--    sms_automation_run_cron() has been a no-op RETURN-only function for months:
--    it never called the edge function, so `sms-automation-hourly` "succeeded"
--    forever while doing nothing. That stub IS the bug - do not keep it.
--    (Verified 2026-07-25: the job does not currently exist in cron.job either,
--    because the original DO block swallowed its own failure with
--    `EXCEPTION WHEN OTHERS THEN NULL`. Both statements below are no-op-safe.)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sms-automation-hourly';
  end if;
end $$;

drop function if exists public.sms_automation_run_cron();

-- 2. Refuse to schedule anything that would post to a NULL url.
do $$
begin
  if coalesce(current_setting('app.sms_automation_run_url',    true), '') = ''
  or coalesce(current_setting('app.sms_automation_run_secret', true), '') = ''
  or coalesce(current_setting('app.sms_dispatch_url',          true), '') = ''
  or coalesce(current_setting('app.sms_dispatch_secret',       true), '') = '' then
    raise exception
      'Refusing to schedule: one or more of app.sms_automation_run_url/_secret, app.sms_dispatch_url/_secret is unset. Set all four (see the header of this migration), reconnect, then re-apply.'
      using errcode = '22023';
  end if;
end $$;

-- 3. Schedule both jobs. NOTE there is no `EXCEPTION WHEN OTHERS THEN NULL`
--    here on purpose - that is what hid the original failure.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
 and exists (select 1 from pg_extension where extname = 'pg_net') then

    -- 3a. The automation scan. Spec section 4 asks for 10:00 local; the database
    --     timezone is UTC (verified) and Georgia is UTC+4, so 06:10 UTC = 10:10
    --     Tbilisi. The :10 offset leaves room beside `booking-finalize-daily`
    --     ('0 6 * * *') and `vip-lifecycle-daily` ('30 6 * * *') - note BOTH of
    --     those are currently unscheduled and have never run, so the collision
    --     rationale is precautionary rather than actual.
    perform cron.unschedule(jobid) from cron.job where jobname = 'sms-automation-daily';
    perform cron.schedule(
      'sms-automation-daily',
      '10 6 * * *',
      $cron$
      select net.http_post(
        url := current_setting('app.sms_automation_run_url', true),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || current_setting('app.sms_automation_run_secret', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );

    -- 3b. The dispatch drain. sms.md P5 assumes `sms-dispatch-frequent` is
    --     already live at '*/10 * * * *'; it is NOT - it has never existed in
    --     cron.job and never appears in cron.job_run_details (verified
    --     2026-07-25). Without this job, approved rows queue forever with
    --     nothing draining them, so scheduling it is part of go-live, not an
    --     extra. It is inert until B1 implements sendSms(): every row is
    --     'skipped' and left 'approved'.
    perform cron.unschedule(jobid) from cron.job where jobname = 'sms-dispatch-frequent';
    perform cron.schedule(
      'sms-dispatch-frequent',
      '*/10 * * * *',
      $cron$
      select net.http_post(
        url := current_setting('app.sms_dispatch_url', true),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || current_setting('app.sms_dispatch_secret', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );

  else
    raise notice 'pg_cron / pg_net not installed - SMS automation NOT scheduled. Install both extensions and re-apply, or drive the two functions from an external scheduler.';
  end if;
end $$;

-- Verify after applying:
--   select jobname, schedule, active from cron.job where jobname like 'sms%';
--     -> sms-automation-daily '10 6 * * *', sms-dispatch-frequent '*/10 * * * *'
--   select proname from pg_proc where proname = 'sms_automation_run_cron';
--     -> zero rows
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 5;

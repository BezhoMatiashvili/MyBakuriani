-- The original VIP schedule migration predated the production Vault-backed
-- cron setup and therefore never created a live job. Reuse the already
-- provisioned SMS automation URL/secret for this sibling daily automation.
-- The Edge handler accepts SMS_AUTOMATION_RUN_SECRET as a fallback while still
-- preferring a dedicated VIP_LIFECYCLE_SECRET when one is configured later.

do $$
declare
  v_automation_url text;
  v_automation_secret text;
begin
  select decrypted_secret
    into v_automation_url
    from vault.decrypted_secrets
   where name = 'app.sms_automation_run_url'
   limit 1;

  select decrypted_secret
    into v_automation_secret
    from vault.decrypted_secrets
   where name = 'app.sms_automation_run_secret'
   limit 1;

  if nullif(v_automation_url, '') is null
     or nullif(v_automation_secret, '') is null then
    raise exception 'VIP lifecycle schedule requires SMS automation Vault configuration';
  end if;

  perform cron.unschedule(jobid)
    from cron.job
   where jobname = 'vip-lifecycle-daily';

  perform cron.schedule(
    'vip-lifecycle-daily',
    '30 6 * * *',
    $cron$
    select net.http_post(
      url := regexp_replace(
        (select decrypted_secret
           from vault.decrypted_secrets
          where name = 'app.sms_automation_run_url'
          limit 1),
        '/sms-automation-run$',
        '/vip-lifecycle'
      ),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret
                       from vault.decrypted_secrets
                      where name = 'app.sms_automation_run_secret'
                      limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
end
$$;

-- vip-lifecycle runs hourly instead of once a day (2026-09-26, s-vip-purchase-0926).
--
-- Every VIP package lasts 24 h since the 2026 price list, and the job warned
-- 48 h ahead from a once-daily run, so almost every purchase was followed by a
-- "VIP expires soon" notification + SMS within hours of buying. The function
-- now warns 6 h ahead (WARN_WINDOW_HOURS) and this job runs every hour, which
-- also clears expired flags within an hour instead of up to a day.
--
-- The job's command (Vault-backed URL + shared secret, see 20260816122000) is
-- reused verbatim; only the name and schedule change. A project where the job
-- was never scheduled is left alone.
DO $$
DECLARE
  v_command text;
BEGIN
  SELECT command INTO v_command FROM cron.job WHERE jobname = 'vip-lifecycle-daily';
  IF v_command IS NULL THEN
    RAISE NOTICE 'vip-lifecycle-daily is not scheduled here; nothing to change';
    RETURN;
  END IF;
  PERFORM cron.unschedule('vip-lifecycle-daily');
  PERFORM cron.schedule('vip-lifecycle-hourly', '30 * * * *', v_command);
END
$$;

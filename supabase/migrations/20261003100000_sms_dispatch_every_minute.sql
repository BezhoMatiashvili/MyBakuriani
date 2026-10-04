-- SMS dispatch every minute (C4, C18). `sms-dispatch-frequent` only POLLS: nothing
-- calls sms-dispatch when a row is queued, so its schedule IS the queue-to-provider
-- latency. At */10 a user-triggered SMS (notification mirror, consent link,
-- purchase) went out 2-10 minutes after the action: on staging the eight rows of
-- 2026-10-01/02 waited 2-599 s from created_at to submitted_at, and available_at
-- equalled created_at on every one (no deliberate hold). A row another job queued
-- in the same tick (sms-automation-daily at 06:00:02, the Keepz sweeper crediting
-- a top-up at :00:02) could land just after that tick's dispatch claim and wait
-- the full ten minutes (599 s, twice).
--
-- Only the schedule changes. cron.alter_job leaves the command exactly as it is
-- live (Vault lookups, 60 s timeout from 20260927090300). Overlapping runs stay
-- safe: sms_claim_dispatch_batch takes an advisory lock and a 15-minute lease,
-- and sms_mark_provider_delivered locks the row (FOR UPDATE) and answers a repeat
-- as a duplicate, so a slow run cannot double-send or double-charge. A run costs
-- the same few queries as before plus one brand lookup at uBill, and
-- reconcileSubmitted re-polls only rows 'submitted' for over 15 minutes (none
-- stuck on staging). check-db-contracts C4 matches job names, not schedules, so
-- it needs no change.
--
-- Refuses to apply where the job does not exist (apply 20260801132000 first), so
-- the change is never recorded as done on a project that would later get */10
-- back. Going below a minute needs pg_cron's 'N seconds' syntax and a look at the
-- per-run provider calls above; sending on enqueue would be a statement-level
-- AFTER INSERT trigger on sms_outbound.
--
-- Roll back:
--   select cron.alter_job(jobid, schedule := '*/10 * * * *')
--   from cron.job where jobname = 'sms-dispatch-frequent';

do $$
begin
  perform cron.alter_job(jobid, schedule := '* * * * *')
  from cron.job
  where jobname = 'sms-dispatch-frequent';

  if not found then
    raise exception 'Refusing to change the SMS dispatch schedule: sms-dispatch-frequent is not scheduled (apply 20260801132000 first)'
      using errcode = '55000';
  end if;
end $$;

-- Expected job:
-- sms-dispatch-frequent  * * * * *

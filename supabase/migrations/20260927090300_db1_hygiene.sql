-- DB production hygiene (security hardening S2-D, 2026-09-27). Integrity, replay and
-- observability fixes that change no legitimate flow: drop a stale purchase_package overload
-- that only a replay recreates (R12), index six hot foreign keys (R32), add a unique key behind
-- the Keepz credit path (R36, C32), give four HTTP cron jobs an explicit pg_net timeout (R15),
-- time out idle transactions (R44), validate the cleaning-task status CHECK (R35) and keep
-- wallet balances non-NULL and non-negative (R18). Creates no function or table (no C34 grants).

-- R12: 20260719120000 re-creates the 4-argument overload that 20260719095704 dropped, so only a
-- replayed database (branch, rebuild) has it. No-op on staging and prod.
DROP FUNCTION IF EXISTS public.purchase_package(uuid, uuid, uuid, integer);

-- R32: listing, profile and broadcast deletes and the owner/seller stats RPCs look these foreign
-- keys up by the referencing column, which no index led with. The favorites indexes carry
-- created_at for the ranged stats counts. Plain CREATE INDEX: a migration runs as one
-- transaction, and these tables are small.
CREATE INDEX IF NOT EXISTS favorites_property_idx
  ON public.favorites (property_id, created_at) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS favorites_service_idx
  ON public.favorites (service_id, created_at) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS page_views_user_idx
  ON public.page_views (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_broadcast_idx
  ON public.notifications (broadcast_id) WHERE broadcast_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_events_property_idx
  ON public.contact_events (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_events_service_idx
  ON public.contact_events (service_id) WHERE service_id IS NOT NULL;

-- R36 (C32): keepz_apply_payment_status credits a payment once, under its row lock. This key
-- turns a second credit for the same payment into a 23505 instead of a silent double credit.
-- Admin and sandbox top-ups carry no reference and are unaffected. No unique key on
-- payments.provider_transaction_id: Keepz also returns ids for declined orders (possibly a
-- shared "0"), and a 23505 there would abort the status update and leave the order unresolved.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_topup_reference_uidx
  ON public.transactions (reference_id) WHERE type = 'topup' AND reference_id IS NOT NULL;

-- R15: booking-finalize, sms-automation, sms-dispatch and vip-lifecycle used pg_net's 5 s
-- default, so a slow run was recorded as timed out and its real status lost. Each command is
-- rebuilt from the live one (URL, Vault lookups and body untouched) with an explicit timeout;
-- sms-dispatch sends up to 25 SMS per run, so it gets 60 s.
DO $$
DECLARE
  v_job record;
  v_command text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  FOR v_job IN
    SELECT t.jobname, t.timeout_ms, j.jobid, j.command
    FROM (VALUES
      ('booking-finalize-daily', 30000),
      ('sms-automation-daily', 30000),
      ('sms-dispatch-frequent', 60000),
      ('vip-lifecycle-hourly', 30000)
    ) AS t (jobname, timeout_ms)
    LEFT JOIN cron.job j ON j.jobname = t.jobname
  LOOP
    IF v_job.jobid IS NULL THEN
      RAISE NOTICE '% is not scheduled here; skipped', v_job.jobname;
      CONTINUE;
    END IF;
    IF v_job.command ~ 'timeout_milliseconds' THEN
      CONTINUE;
    END IF;

    -- Add the argument after `body := '{}'::jsonb`, on its own line at the same indent.
    v_command := regexp_replace(
      v_job.command,
      '(\n([[:blank:]]*)body\s*:=\s*''\{\}''::jsonb)(\s*\)\s*;)',
      '\1,' || chr(10) || '\2timeout_milliseconds := ' || v_job.timeout_ms || '\3'
    );
    IF v_command = v_job.command THEN
      RAISE NOTICE '% has an unexpected command shape; timeout left unchanged', v_job.jobname;
      CONTINUE;
    END IF;

    PERFORM cron.alter_job(v_job.jobid, command := v_command);
  END LOOP;
END
$$;

-- R44: a session left idle inside a transaction keeps its locks until someone kills it. Only
-- new connections pick this up (PostgREST as its pool reconnects).
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE postgres SET idle_in_transaction_session_timeout = '5min';

-- R35: the status CHECK was added NOT VALID. Every row passes it, and no writer sets a NULL
-- status (create_cleaning_task relies on the default, transition_cleaning_task on a listed value).
ALTER TABLE public.cleaning_tasks VALIDATE CONSTRAINT cleaning_tasks_status_check;
ALTER TABLE public.cleaning_tasks ALTER COLUMN status SET NOT NULL;

-- R18: nothing stopped a NULL or negative wallet value being stored, and a NULL balance would
-- pass the debit RPCs' `balance < cost` checks. Every live writer adds, or checks the balance
-- (SMS credit) under a row lock before subtracting, so these never fire on a legitimate flow.
-- Last in the file, so the ACCESS EXCLUSIVE lock on balances is held only briefly before commit.
ALTER TABLE public.balances
  ALTER COLUMN amount SET DEFAULT 0,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN sms_remaining SET DEFAULT 0,
  ALTER COLUMN sms_remaining SET NOT NULL,
  ADD CONSTRAINT balances_amount_check CHECK (amount >= 0),
  ADD CONSTRAINT balances_sms_remaining_check CHECK (sms_remaining >= 0);

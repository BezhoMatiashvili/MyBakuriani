-- Baku's question log (C43, owner request 2026-10-25): one anonymous row per
-- answered question, so the owner can see what users ask most often.
--
-- Written only by POST /api/support with the service role, after the answer
-- has gone out. No user id, no IP and no answer text are stored. The question
-- is already masked when it arrives (plan.ts:cleanPrivate replaces e-mails and
-- long digit runs) and apply_pii_retention erases it after 90 days (C37);
-- intent, topic and counts stay for statistics. The 👍/👎 of an answer is
-- matched by its random ref.
--
-- apply_pii_retention below is the live body (pg_get_functiondef on staging,
-- 2026-10-25) plus the support_questions block; nothing else changed.
--
-- Top intents of the last 30 days, for example:
--   SELECT intent, sum(asked) AS asked, sum(rated_down) AS rated_down
--   FROM public.support_question_summary_v
--   WHERE week >= current_date - 30
--   GROUP BY intent ORDER BY asked DESC LIMIT 25;

CREATE TABLE public.support_questions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  locale text NOT NULL CHECK (locale IN ('ka', 'en', 'ru')),
  cabinet text NOT NULL CHECK (char_length(cabinet) BETWEEN 1 AND 20),
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 200),
  question text CHECK (char_length(question) <= 500),
  intent text NOT NULL DEFAULT '' CHECK (char_length(intent) <= 80),
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 20),
  source text NOT NULL CHECK (source IN ('model', 'cache')),
  signed_in boolean NOT NULL,
  guide boolean NOT NULL DEFAULT false,
  problems smallint NOT NULL DEFAULT 0 CHECK (problems BETWEEN 0 AND 20),
  repaired boolean NOT NULL DEFAULT false,
  ref text NOT NULL UNIQUE CHECK (ref ~ '^[a-z0-9]{10}$'),
  rating text CHECK (rating IN ('up', 'down'))
);

CREATE INDEX support_questions_created_at_idx
  ON public.support_questions (created_at);

ALTER TABLE public.support_questions ENABLE ROW LEVEL SECURITY;
-- No policy: only the service role reads and writes it (C34).
REVOKE ALL ON TABLE public.support_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_questions TO service_role;
REVOKE ALL ON SEQUENCE public.support_questions_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.support_questions_id_seq TO service_role;

CREATE VIEW public.support_question_summary_v
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', created_at AT TIME ZONE 'Asia/Tbilisi')::date AS week,
  cabinet,
  locale,
  topic,
  intent,
  count(*) AS asked,
  count(*) FILTER (WHERE rating = 'down') AS rated_down,
  count(*) FILTER (WHERE rating = 'up') AS rated_up,
  count(*) FILTER (WHERE guide) AS walkthroughs_offered,
  count(*) FILTER (WHERE problems > 0) AS with_problems,
  count(*) FILTER (WHERE repaired) AS repaired
FROM public.support_questions
GROUP BY 1, 2, 3, 4, 5;

REVOKE ALL ON TABLE public.support_question_summary_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.support_question_summary_v TO service_role;

CREATE OR REPLACE FUNCTION public.apply_pii_retention(p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cutoff timestamptz;
  v_views bigint;
  v_reveals bigint;
  v_pages bigint;
  v_audit bigint;
  v_email bigint;
  v_questions bigint;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'invalid_retention_days' USING ERRCODE = '22023';
  END IF;
  v_cutoff := now() - make_interval(days => p_days);

  -- C22: each row is one counted view; only the IP goes. The 24 h view dedup
  -- lives in rate_limit_counters, not here.
  UPDATE public.listing_view_events
  SET client_ip = NULL
  WHERE created_at < v_cutoff AND client_ip IS NOT NULL;
  GET DIAGNOSTICS v_views = ROW_COUNT;

  -- listing_analytics counts every reveal row, lifetime.
  UPDATE public.contact_reveal_events
  SET client_ip = NULL, device_id = NULL, account_id = NULL
  WHERE created_at < v_cutoff
    AND (client_ip IS NOT NULL OR device_id IS NOT NULL OR account_id IS NOT NULL);
  GET DIAGNOSTICS v_reveals = ROW_COUNT;

  -- C26: admin_overview_stats counts rows and distinct visitor_id (a random
  -- first-party cookie id); only the account link goes.
  UPDATE public.page_views
  SET user_id = NULL
  WHERE created_at < v_cutoff AND user_id IS NOT NULL;
  GET DIAGNOSTICS v_pages = ROW_COUNT;

  -- C49: analytics actions keep their rows; only the account link goes.
  UPDATE public.analytics_events
  SET user_id = NULL
  WHERE created_at < v_cutoff AND user_id IS NOT NULL;

  -- C43: Baku's question log keeps its rows (intent, topic and counts);
  -- only the user's own words go.
  UPDATE public.support_questions
  SET question = NULL
  WHERE created_at < v_cutoff AND question IS NOT NULL;
  GET DIAGNOSTICS v_questions = ROW_COUNT;

  -- Keep who/what/when/which fields, drop the row snapshots; UPDATE diffs keep
  -- their field names as "[omitted]" (audit_row_change's own marker). Exempt:
  -- manual_bookings (the renter's booking history reads them, C20) and the
  -- money and pricing trail, which holds no contact data.
  UPDATE public.audit_logs
  SET old_values = CASE WHEN operation = 'UPDATE' THEN (
        SELECT jsonb_object_agg(f, '"[omitted]"'::jsonb) FROM unnest(changed_fields) AS f
      ) END,
      new_values = CASE WHEN operation = 'UPDATE' THEN (
        SELECT jsonb_object_agg(f, '"[omitted]"'::jsonb) FROM unnest(changed_fields) AS f
      ) END
  WHERE occurred_at < v_cutoff
    AND old_values IS DISTINCT FROM new_values
    AND table_name <> ALL (ARRAY['manual_bookings', 'balances', 'transactions',
                                 'payment_refunds', 'pricing_packages', 'promocodes']);
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  -- C33: only finished deliveries; queued/sending rows are never touched.
  DELETE FROM public.email_outbound
  WHERE created_at < v_cutoff
    AND status IN ('sent', 'failed', 'suppressed', 'cancelled');
  GET DIAGNOSTICS v_email = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'listing_view_events_scrubbed', v_views,
    'contact_reveal_events_scrubbed', v_reveals,
    'page_views_scrubbed', v_pages,
    'audit_logs_scrubbed', v_audit,
    'email_outbound_deleted', v_email,
    'support_questions_scrubbed', v_questions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_pii_retention(integer) FROM PUBLIC, anon, authenticated;

-- Trim the supabase_realtime publication to cut logical-replication load.
--
-- Context: on the small burstable instance, Realtime's WAL decode + per-change
-- RLS checks for a broad 13-table publication were a top consumer of DB CPU/IO
-- (pg_stat_statements over ~32 days: the WAL-poll + publication-rebuild queries
-- dominated total time; the replication slot was re-created ~91x). Under that
-- contention, app queries intermittently crossed the anon-3s / auth-8s
-- statement_timeout and were canceled.
--
-- These four are the highest-churn *passive* tables — no feature depends on
-- their live cross-client updates for correctness: properties/services change
-- on admin/owner actions, balances/transactions on every top-up/booking.
-- Dropping them stops Realtime from decoding their WAL for every subscriber.
--
-- Reversible: ALTER PUBLICATION supabase_realtime ADD TABLE <table>;
-- Further drop candidates if their live updates aren't needed: calendar_blocks,
-- price_overrides, cleaning_tasks, job_applications, smart_match_offers,
-- smart_match_requests, sms_messages. Kept in the publication for now.

alter publication supabase_realtime drop table properties;
alter publication supabase_realtime drop table services;
alter publication supabase_realtime drop table balances;
alter publication supabase_realtime drop table transactions;

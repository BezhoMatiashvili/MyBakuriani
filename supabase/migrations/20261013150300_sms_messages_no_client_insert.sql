-- sms_messages: no client inserts (2026-10-13).
--
-- "Users can send messages" let any signed-in user write a row to any to_user_id
-- (and any property_id), which appeared live in that provider's orders inbox
-- (ServiceOrdersView) and, through NO ACTION foreign keys, blocked deleting the
-- referenced listing or account. Nothing in the app, the edge functions or the
-- database writes this table (staging holds 0 rows); e2e uses the service role.
-- The participants' SELECT policy and the UPDATE/DELETE grants are unchanged.

DROP POLICY IF EXISTS "Users can send messages" ON public.sms_messages;
REVOKE INSERT ON public.sms_messages FROM anon, authenticated;

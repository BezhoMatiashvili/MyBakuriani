-- Tighten the smart-match notifications INSERT policy.
--
-- Previously (20260516120000_smart_match_flow_fix.sql), the policy only
-- required that the recipient be a "plausible" landlord (for request notifs)
-- or a guest who had ever filed a request (for offer notifs). That let any
-- authenticated user spam any landlord with fake "you got a request"
-- notifications, since the policy didn't tie the insert to the inserter
-- actually doing the underlying action.
--
-- New policy: notification insertion is tied to a real action the caller
-- just performed. For smart_match_request, the caller must have created
-- a smart_match_requests row within the last 10 minutes. For
-- smart_match_offer, the caller must have a smart_match_offers row they own
-- (renter_id = auth.uid()) that targets a request belonging to the
-- recipient, created within the last 10 minutes.
--
-- This doesn't fully eliminate abuse (a determined actor can spam by
-- creating many real requests/offers), but it makes notifications a
-- side-effect of real work rather than a free-standing write primitive.
-- Rate limiting on smart_match_requests/offers themselves is the right
-- next layer and is tracked separately.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS "Smart match notifications insert" ON public.notifications;
--   -- then re-apply the policy from 20260516120000_smart_match_flow_fix.sql

DROP POLICY IF EXISTS "Smart match notifications insert" ON public.notifications;
CREATE POLICY "Smart match notifications insert" ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (
        type = 'smart_match_request'
        AND EXISTS (
          SELECT 1 FROM public.smart_match_requests r
          WHERE r.guest_id = auth.uid()
            AND r.created_at > now() - interval '10 minutes'
        )
        AND EXISTS (
          SELECT 1 FROM public.properties p
          WHERE p.owner_id = notifications.user_id
            AND p.status = 'active'
            AND p.is_for_sale = false
        )
      )
      OR
      (
        type = 'smart_match_offer'
        AND EXISTS (
          SELECT 1 FROM public.smart_match_offers o
          JOIN public.smart_match_requests r ON r.id = o.request_id
          WHERE o.renter_id = auth.uid()
            AND r.guest_id = notifications.user_id
            AND o.created_at > now() - interval '10 minutes'
        )
      )
    )
  );

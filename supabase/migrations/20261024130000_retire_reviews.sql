-- Reviews and ratings are retired from the site (2026-10-24, owner request; C18, C34).
--
-- The data stays: reviews, manual_booking_review_tokens and the rating columns are kept, unused.
-- This only stops what still produced or exposed reviews once the app and sms-automation-run no
-- longer have a review pass:
-- - the review-request SMS rule is switched off for every owner, and texts already queued are
--   cancelled (sms_cancel_ineligible_automation would also fail them on the next dispatch tick);
-- - review links already texted to guests stop working (the /review page now redirects home);
-- - "rate your stay" bell notices (type review_request, written only by booking-finalize) go;
-- - public_reviews is no longer readable by the API roles.
--
-- Prod: AFTER sms-automation-run, auth-send-sms (it bundles domain.ts) and booking-finalize
-- without the review pass are deployed, and AFTER the app that no longer reads public_reviews is
-- live: the old detail pages threw when that read failed.

select public.sms_cancel_queued_automation(q.sender_id, 'review_request', 'reviews_retired')
from (
  select distinct s.sender_id
  from public.sms_outbound s
  where s.automation_kind = 'review_request'
    and s.status = 'approved'
    and s.charged_at is null
) q;

update public.sms_automation_rules
set review_request_enabled = false
where review_request_enabled;

update public.manual_booking_review_tokens
set expires_at = now()
where used_at is null
  and expires_at > now();

delete from public.notifications
where type = 'review_request';

revoke all on public.public_reviews from anon, authenticated;

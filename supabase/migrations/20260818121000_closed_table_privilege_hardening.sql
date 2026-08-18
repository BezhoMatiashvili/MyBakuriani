-- Internal tables with RLS enabled and no policies are intentionally reachable
-- only through audited service-role or SECURITY DEFINER paths. Revoke the
-- default API-role grants as a second boundary. In particular, TRUNCATE is not
-- governed by RLS and must never remain available to client-facing roles.

revoke all privileges on table
  public.contact_reveal_events,
  public.listing_view_events,
  public.manual_booking_review_tokens,
  public.manual_booking_sms_consents,
  public.media_upload_intents,
  public.organization_admin_notes,
  public.page_views,
  public.profile_admin_notes,
  public.properties_photos_backup,
  public.property_admin_notes,
  public.rate_limit_counters,
  public.service_admin_notes,
  public.services_photos_backup
from anon, authenticated;

notify pgrst, 'reload schema';

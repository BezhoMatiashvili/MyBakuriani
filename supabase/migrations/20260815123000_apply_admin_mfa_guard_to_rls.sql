-- All direct admin access through PostgREST/Storage must satisfy the same AAL2
-- requirement as the application admin API.  Service-role server operations
-- bypass RLS and are unaffected.

alter policy "contact_events_admin_all"
  on public.contact_events
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "job_applications_admin_all"
  on public.job_applications
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "landing_banners admin read all"
  on public.landing_banners
  to authenticated
  using ((select public.is_admin_user()));

alter policy "landing_banners admin write"
  on public.landing_banners
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "leads_admin_all"
  on public.leads
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "project_updates_admin_all"
  on public.project_updates
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "price alert admin all rules"
  on public.sale_price_alert_rules
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "price alert admin all subscriptions"
  on public.sale_price_alert_subscriptions
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "price alert admin all events"
  on public.sale_price_drop_events
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "site_settings_admin_write"
  on public.site_settings
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "sms_automation_admin_all"
  on public.sms_automation_rules
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "sms_broadcasts_admin_all"
  on public.sms_broadcasts
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "sms_outbound_admin_all"
  on public.sms_outbound
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "zones_admin_write"
  on public.zones
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

alter policy "landing-media admin delete"
  on storage.objects
  to authenticated
  using (
    bucket_id = 'landing-media'
    and (select public.is_admin_user())
  );

alter policy "landing-media admin insert"
  on storage.objects
  to authenticated
  with check (
    bucket_id = 'landing-media'
    and (select public.is_admin_user())
  );

alter policy "landing-media admin update"
  on storage.objects
  to authenticated
  using (
    bucket_id = 'landing-media'
    and (select public.is_admin_user())
  )
  with check (
    bucket_id = 'landing-media'
    and (select public.is_admin_user())
  );

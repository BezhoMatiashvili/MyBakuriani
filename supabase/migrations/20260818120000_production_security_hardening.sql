-- Production security hardening, 2026-08-18.
--
-- 1. Policies that depend on auth.uid()/admin membership were historically
--    created TO public. Anonymous requests could not satisfy them, but still
--    evaluated privileged helper functions and forced those helpers to remain
--    executable through the anonymous RPC API. Narrow every non-public policy
--    to authenticated while preserving the explicit public-read allow-list.
-- 2. Remove anonymous EXECUTE from the two definer helpers once no anonymous
--    policy needs them.
-- 3. Enforce the same image-only/10 MiB boundary on content-change staging at
--    the Storage bucket layer, not only at application call sites.
-- 4. Cache the two remaining auth.uid() policy calls as initplans.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select p.schemaname, p.tablename, p.policyname
    from pg_policies p
    where p.schemaname in ('public', 'storage')
      and p.roles = array['public']::name[]
      and (p.schemaname, p.tablename, p.policyname) not in (
        values
          ('public', 'ads', 'ads public read active'),
          ('public', 'blog_posts', 'Published posts are viewable'),
          ('public', 'calendar_blocks', 'Calendar is viewable'),
          ('public', 'landing_banners', 'landing_banners read active'),
          ('public', 'price_overrides', 'price_overrides_public_read'),
          ('public', 'pricing_packages', 'pricing_packages public read enabled'),
          ('public', 'promocodes', 'promocodes public read active'),
          ('public', 'site_settings', 'site_settings_read_all'),
          ('public', 'zones', 'zones_read_all'),
          ('storage', 'objects', 'Property photos are publicly viewable'),
          ('storage', 'objects', 'Public read access for logos'),
          ('storage', 'objects', 'avatars public read'),
          ('storage', 'objects', 'landing-media public read'),
          ('storage', 'objects', 'restaurant_menus_public_select')
      )
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

revoke all on function public.is_admin_user() from public, anon;
revoke all on function public.is_approved_org_member(uuid) from public, anon;
grant execute on function public.is_admin_user() to authenticated, service_role;
grant execute on function public.is_approved_org_member(uuid)
  to authenticated, service_role;

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'content-change-media';

alter policy "price alert subscriber reads own"
  on public.sale_price_alert_subscriptions
  to authenticated
  using ((select auth.uid()) = subscriber_id);

alter policy "sms_automation_owner_select"
  on public.sms_automation_rules
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.properties p
      where p.owner_id = (select auth.uid())
        and coalesce(p.is_for_sale, false) = false
    )
  );

notify pgrst, 'reload schema';

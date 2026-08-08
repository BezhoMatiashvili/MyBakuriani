-- Restore privacy-safe transport fields that the create form already stores
-- and the public card/detail components already expect. New view columns must
-- be appended so CREATE OR REPLACE VIEW preserves the existing column order.
create or replace view public.public_services
with (security_invoker = false) as
select s.id, s.category, s.title, s.description, s.price, s.price_unit, s.currency, s.photos,
       s.location, s.schedule, s.discount_percent, s.is_vip, s.views_count, s.driver_name,
       s.vehicle_capacity, s.route, s.cuisine_type, s.has_delivery, s.operating_hours, s.menu,
       s.position, s.salary_range, s.experience_required, s.employment_schedule, s.created_at,
       s.updated_at, s.is_new, s.avg_check, s.menu_url, s.has_kids_area, s.has_lounge,
       s.has_live_music, s.employment_type, s.work_schedule, s.salary_type, s.salary_min,
       s.salary_max, s.salary_daily, s.accommodation, s.meals, s.requirements, s.languages,
       s.service_field, s.provider_name, s.rating, s.reviews_count, s.safety_notes, s.activity_type,
       s.activity_category, s.duration, s.age_min, s.good_for, s.coords, s.restaurant_type,
       s.is_super_vip, s.vip_expires_at, s.menu_views_count, s.vehicle_color, s.features,
       s.route_pricing, s.discount_expires_at,
       p.display_name as profile_display_name, p.avatar_url as profile_avatar_url,
       p.is_verified as profile_is_verified,
       regexp_replace(coalesce(s.whatsapp, ''), '[^0-9]', '', 'g') ~ '^(995)?5[0-9]{8}$' as has_whatsapp,
       coalesce(s.discount_percent, 0) > 0
         and (s.discount_expires_at is null or s.discount_expires_at > now()) as has_active_discount,
       s.vehicle_make, s.transport_type, s.routes, s.equipment
from public.services s
left join public.profiles p on p.id = s.owner_id
where s.status = 'active';

revoke all on public.public_services from public;
grant select on public.public_services to anon, authenticated;

notify pgrst, 'reload schema';

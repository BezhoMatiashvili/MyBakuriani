-- Backfill vehicle_color + features on the seeded demo transport listings
-- (owner 3b04055a..., the a0000001-... set) so the richer transport cards have
-- sample data to display. Idempotent: the `vehicle_color is null` guard means
-- re-running never overwrites values a real owner has since set.
update public.services as s
set
  vehicle_color = v.color,
  features = v.features
from (
  values
    ('a0000001-0000-4000-8000-000000000001'::uuid, 'თეთრი', array['კონდიციონერი', 'USB დამტენი']),
    ('a0000001-0000-4000-8000-000000000002'::uuid, 'ვერცხლისფერი', array['კონდიციონერი', 'Wi-Fi', 'USB დამტენი']),
    ('a0000001-0000-4000-8000-000000000003'::uuid, 'მწვანე', array['კონდიციონერი', 'მუსიკა']),
    ('a0000001-0000-4000-8000-000000000004'::uuid, 'შავი', array['კონდიციონერი', 'Wi-Fi']),
    ('a0000001-0000-4000-8000-000000000005'::uuid, 'მწვანე', array['კონდიციონერი', 'Wi-Fi', 'წყალი', 'მუსიკა']),
    ('a0000001-0000-4000-8000-000000000006'::uuid, 'ლურჯი', array['კონდიციონერი', 'მუსიკა']),
    ('a0000001-0000-4000-8000-000000000007'::uuid, 'ნაცრისფერი', array['კონდიციონერი']),
    ('a0000001-0000-4000-8000-000000000008'::uuid, 'წითელი', array['კონდიციონერი', 'USB დამტენი']),
    ('a0000001-0000-4000-8000-000000000009'::uuid, 'თეთრი', array['კონდიციონერი', 'Wi-Fi']),
    ('a0000001-0000-4000-8000-000000000010'::uuid, 'ვერცხლისფერი', array['კონდიციონერი', 'მუსიკა']),
    ('a0000001-0000-4000-8000-000000000011'::uuid, 'მწვანე', array['მუსიკა']),
    ('a0000001-0000-4000-8000-000000000012'::uuid, 'შავი', array['კონდიციონერი', 'Wi-Fi', 'USB დამტენი', 'წყალი'])
) as v(id, color, features)
where s.id = v.id
  and s.vehicle_color is null;

-- Backfill structured detail fields for demo entertainment listings.
-- These rows were seeded before activity_type/duration/age_min/good_for columns
-- existed. Values use the same Georgian labels as the create form dropdowns.

UPDATE services SET
  activity_type = 'ექსტრემალური',
  activity_category = 'კვადროციკლები',
  duration = '1 საათი',
  age_min = '16+',
  good_for = 'ექსტრემის მოყვარულთა',
  operating_hours = '10:00 - 18:00',
  schedule = '10:00 - 18:00'
WHERE id = 'a0000004-0000-4000-8000-000000000001' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'სპორტული',
  activity_category = 'ინვენტარი',
  duration = '1+ საათი',
  age_min = 'ნებისმიერი',
  good_for = 'ყველასთვის',
  operating_hours = '09:00 - 18:00',
  schedule = '09:00 - 18:00'
WHERE id = 'a0000004-0000-4000-8000-000000000002' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'ოჯახისთვის',
  activity_category = 'ცხენები',
  duration = '1 საათი',
  age_min = 'ნებისმიერი',
  good_for = 'ყველასთვის',
  operating_hours = '10:00 - 17:00',
  schedule = '10:00 - 17:00'
WHERE id = 'a0000004-0000-4000-8000-000000000003' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'ბავშვებისთვის',
  activity_category = 'სხვა',
  duration = '1+ საათი',
  age_min = 'ნებისმიერი',
  good_for = 'ყველასთვის',
  operating_hours = '10:00 - 19:00',
  schedule = '10:00 - 19:00'
WHERE id = 'a0000004-0000-4000-8000-000000000004' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'სპორტული',
  activity_category = 'ინვენტარი',
  duration = '1 საათი',
  age_min = '12+',
  good_for = 'ყველასთვის',
  operating_hours = '09:00 - 17:00',
  schedule = '09:00 - 17:00'
WHERE id = 'a0000004-0000-4000-8000-000000000005' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'ექსტრემალური',
  activity_category = 'ბურანები',
  duration = '1 საათი',
  age_min = '16+',
  good_for = 'ექსტრემის მოყვარულთა',
  operating_hours = '10:00 - 18:00',
  schedule = '10:00 - 18:00'
WHERE id = 'a0000004-0000-4000-8000-000000000006' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'ოჯახისთვის',
  activity_category = 'სხვა',
  duration = '1+ საათი',
  age_min = 'ნებისმიერი',
  good_for = 'ყველასთვის',
  operating_hours = '10:00 - 22:00',
  schedule = '10:00 - 22:00'
WHERE id = 'a0000004-0000-4000-8000-000000000007' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'ექსტრემალური',
  activity_category = 'ბურანები',
  duration = '1+ საათი',
  age_min = '16+',
  good_for = 'ექსტრემის მოყვარულთა',
  operating_hours = '09:00 - 17:00',
  schedule = '09:00 - 17:00'
WHERE id = 'a0000004-0000-4000-8000-000000000008' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'ოჯახისთვის',
  activity_category = 'სხვა',
  duration = '30 წუთი',
  age_min = '12+',
  good_for = 'ყველასთვის',
  operating_hours = '10:00 - 18:00',
  schedule = '10:00 - 18:00'
WHERE id = 'a0000004-0000-4000-8000-000000000009' AND category = 'entertainment';

UPDATE services SET
  activity_type = 'ექსტრემალური',
  activity_category = 'სხვა',
  duration = '30 წუთი',
  age_min = '16+',
  good_for = 'ექსტრემის მოყვარულთა',
  operating_hours = '10:00 - 17:00',
  schedule = '10:00 - 17:00'
WHERE id = 'a0000004-0000-4000-8000-000000000010' AND category = 'entertainment';

-- Additive fields for /create/food redesign.
-- Keep existing has_delivery and menu jsonb columns intact.

alter table public.services
  add column if not exists avg_check text,
  add column if not exists menu_url text,
  add column if not exists has_kids_area boolean not null default false,
  add column if not exists has_lounge boolean not null default false,
  add column if not exists has_live_music boolean not null default false;

alter table public.services
  add constraint services_avg_check_check
  check (avg_check is null or avg_check in ('10-30','30-60','60-100','100+'));

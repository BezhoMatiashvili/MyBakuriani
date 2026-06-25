-- Security: pin search_path on functions flagged by `function_search_path_mutable`.
-- A mutable search_path lets a caller's session search_path influence name
-- resolution inside the function (a privilege-escalation vector, especially for
-- SECURITY DEFINER functions). Each function below is recreated identically
-- except: (1) `SET search_path = ''` is added, and (2) the 4 SECURITY DEFINER
-- bodies have their table references schema-qualified so empty search_path is safe.
-- Behavior is unchanged. CREATE OR REPLACE preserves existing grants/ownership.
--
-- Rollback: re-run each function's original definition without the SET clause
-- (originals are recorded in their source migrations).

-- ── trigger touch functions (no table refs; only NEW.updated_at = now()) ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.leads_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sms_automation_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_landing_banners_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_price_overrides_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_zones_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── reporting function (already schema-qualified internally) ──
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS TABLE(active_listings bigint, total_properties bigint, total_bookings bigint, completed_bookings bigint, active_or_completed_bookings bigint, total_revenue numeric, average_response_minutes numeric, average_booking_price numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  with property_stats as (
    select
      count(*) filter (where status = 'active') as active_listings,
      count(*) as total_properties
    from public.properties
  ),
  booking_stats as (
    select
      count(*) as total_bookings,
      count(*) filter (where status = 'completed') as completed_bookings,
      count(*) filter (where status in ('confirmed', 'completed')) as active_or_completed_bookings,
      coalesce(sum(total_price) filter (where status = 'completed'), 0)::numeric as total_revenue,
      coalesce(avg(total_price), 0)::numeric as average_booking_price
    from public.bookings
  ),
  profile_stats as (
    select
      coalesce(avg(response_time_minutes), 0)::numeric as average_response_minutes
    from public.profiles
    where response_time_minutes is not null
  )
  select
    property_stats.active_listings,
    property_stats.total_properties,
    booking_stats.total_bookings,
    booking_stats.completed_bookings,
    booking_stats.active_or_completed_bookings,
    booking_stats.total_revenue,
    profile_stats.average_response_minutes,
    booking_stats.average_booking_price
  from property_stats, booking_stats, profile_stats;
$$;

-- ── SECURITY DEFINER functions (table refs schema-qualified for empty search_path) ──
CREATE OR REPLACE FUNCTION public.create_booking_calendar_blocks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.calendar_blocks (property_id, date, status, booking_id)
  SELECT NEW.property_id, d::date, 'booked', NEW.id
  FROM generate_series(NEW.check_in, NEW.check_out - INTERVAL '1 day', INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_user_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.balances (user_id, amount, sms_remaining)
  VALUES (NEW.id, 0, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_views(prop_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.properties SET views_count = views_count + 1 WHERE id = prop_id;
$$;

CREATE OR REPLACE FUNCTION public.update_property_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles SET rating = (
    SELECT COALESCE(AVG(r.rating), 0)
    FROM public.reviews r
    JOIN public.properties p ON r.property_id = p.id
    WHERE p.owner_id = (SELECT owner_id FROM public.properties WHERE id = NEW.property_id)
  )
  WHERE id = (SELECT owner_id FROM public.properties WHERE id = NEW.property_id);
  RETURN NEW;
END;
$$;

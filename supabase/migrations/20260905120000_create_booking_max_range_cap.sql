-- Security fix: create_booking had no upper bound on (check_out - check_in),
-- so any authenticated user could lock an arbitrary property's availability
-- for decades in a single call (calendar_blocks is populated eagerly, before
-- owner acceptance or payment). Add a sane max range; the existing
-- min_booking_days lower bound is untouched.
CREATE OR REPLACE FUNCTION public.create_booking(
  p_guest_id uuid,
  p_property_id uuid,
  p_check_in date,
  p_check_out date,
  p_guests_count integer DEFAULT 1,
  p_guest_message text DEFAULT NULL::text,
  p_marketing_consent boolean DEFAULT false
)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_property public.properties%rowtype;
  v_booking public.bookings%rowtype;
  v_days int;
  v_conflict_count int;
  v_total_price numeric(12,2);
begin
  if p_check_out <= p_check_in then
    raise exception 'არასწორი თარიღები' using errcode = '22023';
  end if;
  if p_check_in < current_date then
    raise exception 'ჯავშნის თარიღი უნდა იყოს მომავალში' using errcode = '22023';
  end if;
  if p_guests_count is null or p_guests_count <= 0 then
    p_guests_count := 1;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));
  select * into v_property
  from public.properties
  where id = p_property_id and status = 'active';
  if not found then
    raise exception 'ობიექტი ვერ მოიძებნა' using errcode = 'P0002';
  end if;
  if v_property.owner_id = p_guest_id then
    raise exception 'საკუთარ ობიექტზე ჯავშნის გაკეთება შეუძლებელია'
      using errcode = '42501';
  end if;

  v_days := (p_check_out - p_check_in) + 1;
  if v_days < coalesce(v_property.min_booking_days, 1) then
    raise exception 'მინიმალური ჯავშანი: % დღე', v_property.min_booking_days
      using errcode = '22023';
  end if;
  if v_days > 365 then
    raise exception 'ჯავშნის მაქსიმალური ხანგრძლივობაა 365 დღე' using errcode = '22023';
  end if;

  select count(*) into v_conflict_count
  from public.calendar_blocks
  where property_id = p_property_id
    and date between p_check_in and p_check_out
    and status in ('booked', 'blocked');
  if v_conflict_count > 0 then
    raise exception 'არჩეული თარიღები დაკავებულია' using errcode = '22023';
  end if;

  select coalesce(sum(coalesce(po.price, v_property.price_per_night)), 0)
  into v_total_price
  from generate_series(p_check_in, p_check_out, interval '1 day') d
  left join public.price_overrides po
    on po.property_id = p_property_id and po.date = d::date;

  if v_property.discount_percent > 0
    and (v_property.discount_expires_at is null
      or v_property.discount_expires_at > now())
  then
    v_total_price := round(
      v_total_price * (100 - v_property.discount_percent) / 100.0,
      2
    );
  end if;

  insert into public.bookings (
    property_id, guest_id, owner_id, check_in, check_out, guests_count,
    total_price, guest_message, marketing_consent, marketing_consent_at
  ) values (
    p_property_id, p_guest_id, v_property.owner_id, p_check_in, p_check_out,
    p_guests_count, v_total_price, p_guest_message,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then now() else null end
  ) returning * into v_booking;

  insert into public.calendar_blocks (property_id, date, status, booking_id)
  select p_property_id, d::date, 'booked', v_booking.id
  from generate_series(p_check_in, p_check_out, interval '1 day') d
  on conflict (property_id, date) do update
    set status = 'booked', booking_id = v_booking.id
    where public.calendar_blocks.status = 'available';

  return v_booking;
end;
$function$;

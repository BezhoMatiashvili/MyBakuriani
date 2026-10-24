-- Same-day check-in SMS are no longer cancelled before they go out (2026-10-24, C18 "Short notice").
--
-- The short-notice run (sms-automation-run {"mode":"short_notice"}, 20261023100000) texts a manual
-- booking an hour after it was made when the daily 10:00 run could not reach it: a booking for today,
-- or one for tomorrow made after 10:00. When the check-in day has already begun as the run queues the
-- text, the text says "დღეს" (today). sms-dispatch calls sms_cancel_ineligible_automation every minute
-- (and sms_claim_dispatch_batch calls it before every claim), and that check kept a check_in row only
-- while the check-in was tomorrow, so every "დღეს" row was failed 'eligibility_changed' within a
-- minute: the host saw ვერ გაიგზავნა and the booking + kind dedup stopped any retry. That hit every
-- same-day booking and every booking for tomorrow saved after about 22:55.
--
-- Now a check_in row also stays while the check-in is today if it was queued on that day, which is
-- exactly when the run wrote "დღეს". A row queued the day before says "ხვალ" (tomorrow) and is still
-- dropped at midnight, as before: a daily-run text not sent that evening (no credit yet, delivery
-- paused) must not go out on the day itself saying "tomorrow". Platform bookings (public.bookings has
-- no writer, C26) are unchanged. Rows already failed this way stay failed; nothing is re-queued.
--
-- The body is the live 20260804130000 definition with that one clause changed; the guard refuses
-- (55000) where the live body differs. Prod: any time (no app or edge function change).

do $guard$
declare
  v_live text := (select md5(p.prosrc) from pg_proc p
                  where p.oid = to_regprocedure('public.sms_cancel_ineligible_automation()'));
begin
  if v_live is distinct from '3d01f317993515f7c510bf9f2d8e5cda' then
    raise exception 'sms_keep_same_day_check_in: public.sms_cancel_ineligible_automation() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.sms_cancel_ineligible_automation()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_n integer;
begin
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('cancelled','eligibility_changed')
  where s.status='approved' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and s.automation_kind in ('check_in','review_request','win_back')
    and not (
      exists(select 1 from public.sms_automation_rules r where r.user_id=s.sender_id and
        case s.automation_kind when 'check_in' then r.check_in_reminder_enabled when 'review_request' then r.review_request_enabled when 'win_back' then r.win_back_enabled else false end)
      and (
        exists(
          select 1 from public.bookings b join public.properties p on p.id=b.property_id
          join public.profiles g on g.id=b.guest_id
          where b.id=s.source_booking_id and b.owner_id=s.sender_id and coalesce(p.is_for_sale,false)=false
            and public.sms_canonical_ge_phone(g.phone)=public.sms_canonical_ge_phone(s.recipient_phone)
            and (
              (s.automation_kind='check_in' and b.status='confirmed' and b.check_in=(now() at time zone 'Asia/Tbilisi')::date+1)
              or (s.automation_kind='review_request' and b.status='completed' and b.marketing_consent
                and b.check_out=(now() at time zone 'Asia/Tbilisi')::date-1
                and not exists(select 1 from public.reviews rv where rv.booking_id=b.id)
                and not g.marketing_opt_out)
              or (s.automation_kind='win_back' and b.status='completed' and b.marketing_consent
                and b.check_out=(now() at time zone 'Asia/Tbilisi')::date-90 and not g.marketing_opt_out
                and not exists(select 1 from public.bookings later where later.owner_id=b.owner_id and later.guest_id=b.guest_id and later.status<>'cancelled' and later.check_in>b.check_out))
            )
        )
        or exists(
          select 1 from public.manual_bookings mb join public.properties p on p.id=mb.property_id
          where mb.id=s.source_manual_booking_id and mb.owner_id=s.sender_id and mb.status<>'cancelled'
            and coalesce(p.is_for_sale,false)=false
            and public.sms_canonical_ge_phone(mb.guest_phone)=public.sms_canonical_ge_phone(s.recipient_phone)
            and (
              -- check_in: a "ხვალ" text goes out the day before; a "დღეს" text, queued on the
              -- check-in day itself by the short-notice run, goes out that day.
              (s.automation_kind='check_in' and (mb.check_in=(now() at time zone 'Asia/Tbilisi')::date+1
                or (mb.check_in=(now() at time zone 'Asia/Tbilisi')::date
                  and (s.created_at at time zone 'Asia/Tbilisi')::date=mb.check_in)))
              or (s.automation_kind='review_request' and mb.marketing_consent
                and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-1
                and not exists(select 1 from public.reviews rv where rv.manual_booking_id=mb.id)
                and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone)))
              or (s.automation_kind='win_back' and mb.marketing_consent
                and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-90
                and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone))
                and not exists(select 1 from public.manual_bookings later where later.owner_id=mb.owner_id and later.status<>'cancelled' and public.sms_canonical_ge_phone(later.guest_phone)=public.sms_canonical_ge_phone(mb.guest_phone) and later.check_in>mb.check_out))
            )
        )
      )
    );
  get diagnostics v_n=row_count; return v_n;
end;
$function$;

-- C34: service_role only (CREATE OR REPLACE keeps the ACL; restated).
REVOKE ALL ON FUNCTION public.sms_cancel_ineligible_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_cancel_ineligible_automation() TO service_role;

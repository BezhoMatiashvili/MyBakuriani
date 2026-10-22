-- C18/C24: a cleaner who registered by e-mail never got the call-out text (2026-10-22).
--
-- The notification mirror (notifications_enqueue_sms) takes the number from profiles.phone only,
-- and only a phone sign-up fills that column. A cleaner who signed up by e-mail and listed a
-- cleaning service has no profile number, yet the listing wizard makes them enter one
-- (services.phone). On prod the call-outs to such cleaners got the bell notice and no SMS row at
-- all; every call-out to a cleaner with a profile number was delivered.
--
-- For cleaning_task_new only, a missing profile number now falls back to the number on the
-- cleaner's newest active cleaning listing (created_at, then id). The profile number still wins.
-- cleaning_task_new is written for the cleaner alone (notify_cleaner_of_new_task); the other
-- cleaning_task_* notices go to the renter, who is not texted on a listing's number. The e2e skip
-- and every cap follow the lookup and key on the number chosen, so a fallback number is capped
-- like any other (per recipient, per type and cabinet, and per number).
--
-- Body = the live definition with one block inserted before the "no number = no SMS" return; the
-- guard refuses (55000) where the live body differs from the reviewed one.

do $migration$
declare
  v_def text := pg_get_functiondef('public.notifications_enqueue_sms()'::regprocedure);
  v_anchor text := $anchor$    if v_phone is null then
      return null;
    end if;
$anchor$;
  v_block text := $block$    -- A call-out text goes to the cleaner. An e-mail sign-up has no profile number, but the
    -- listing they were called out through requires one: use their newest active cleaning listing's.
    if v_phone is null and new.type = 'cleaning_task_new' then
      select public.sms_canonical_ge_phone(s.phone) into v_phone
        from public.services s
       where s.owner_id = new.user_id
         and s.category = 'cleaning'
         and s.status = 'active'
         and public.sms_canonical_ge_phone(s.phone) is not null
       order by s.created_at desc, s.id desc
       limit 1;
    end if;
$block$;
begin
  if position('sms_canonical_ge_phone(s.phone)' in v_def) > 0 then
    return; -- already applied
  end if;
  if md5((select p.prosrc from pg_proc p where p.oid = 'public.notifications_enqueue_sms()'::regprocedure))
       is distinct from '236c6eb6045559745cd6c23a939b36f7' then
    raise exception 'cleaner_call_out_sms_listing_phone: notifications_enqueue_sms() differs from the reviewed body; regenerate this migration from the live definition'
      using errcode = '55000';
  end if;
  if length(v_def) - length(replace(v_def, v_anchor, '')) <> length(v_anchor) then
    raise exception 'cleaner_call_out_sms_listing_phone: the no-number return anchor was not found exactly once'
      using errcode = '55000';
  end if;
  execute replace(v_def, v_anchor, v_block || v_anchor);
end
$migration$;

revoke all on function public.notifications_enqueue_sms() from public, anon, authenticated;
grant execute on function public.notifications_enqueue_sms() to service_role;

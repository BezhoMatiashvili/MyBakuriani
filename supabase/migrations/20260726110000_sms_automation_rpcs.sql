-- SMS automation module, migration B of D: the RPC family. See sms.md P2.
-- Moves dedup, the 0-credit preflight, the charge, and expiry into SQL so the edge
-- functions cannot get them wrong.
--
-- ARCHITECTURE: charge-AFTER-send in one RPC, NOT reserve-then-confirm. Reserve-then-confirm
-- contradicts spec section 6 ("1 credit deducted ONLY AFTER Status: Success"), needs a refund
-- path for every failure mode, and is unjustifiable while D3 keeps sendSms() a stub with zero
-- real failure data. Residual risk: if the gateway succeeds and the function dies before
-- sms_mark_sent, the row stays 'approved' and the next run re-sends, uncharged. That is the
-- irreducible at-least-once property of a non-transactional gateway; the fix is a provider
-- idempotency key, which belongs to B1 (follow-up sms-f2).

-- ---------------------------------------------------------------------------
-- (a) sms_outbound: offline guests, the charge guard, the second index
-- ---------------------------------------------------------------------------

-- ON DELETE SET NULL mirrors source_booking_id, and matters more here: cancelling a
-- manual booking IS a hard DELETE (see delete_manual_booking_calendar_blocks in
-- 20260721160000). CASCADE would erase the record of an SMS the owner was already charged for.
alter table public.sms_outbound
  add column if not exists source_manual_booking_id uuid
    references public.manual_bookings(id) on delete set null,
  add column if not exists charged_at timestamptz;

comment on column public.sms_outbound.charged_at is
  'Set by sms_mark_sent when 1 credit was actually deducted. The durable double-charge guard. Broadcast/contact rows charged at admin-approve time leave this NULL, so the automation_kind filter in sms_mark_sent is an independent second guard, not a duplicate.';

-- An offline guest has no profiles row, so there is no valid uuid for recipient_id.
-- Every consumer already null-guards: /api/admin/sms/pending, /api/sms/outbox; moderate
-- only selects it; /api/sms/history does not select it. Neither RLS policy references it.
-- Side benefit: fixes a latent bug - the column was NOT NULL with ON DELETE SET NULL, so
-- deleting a profile with any sms_outbound row raised 23502 and blocked the delete.
alter table public.sms_outbound alter column recipient_id drop not null;

-- AT-MOST-ONE, not exactly-one. Do NOT copy the favorites XOR (contract C9): broadcast
-- fan-out rows and system rows legitimately have NEITHER source. sms_outbound_origin_check
-- stays satisfied via automation_kind IS NOT NULL, so it needs no change.
alter table public.sms_outbound drop constraint if exists sms_outbound_one_booking_source;
alter table public.sms_outbound add  constraint sms_outbound_one_booking_source
  check (source_booking_id is null or source_manual_booking_id is null);

-- Structural twin of uniq_sms_outbound_automation. Plain CREATE INDEX: CONCURRENTLY
-- cannot run inside the transaction apply_migration wraps this in.
create unique index if not exists uniq_sms_outbound_automation_manual
  on public.sms_outbound (sender_id, source_manual_booking_id, automation_kind)
  where automation_kind is not null and source_manual_booking_id is not null;

-- Supports the dispatch scan: today the only status index is partial on 'pending', and
-- D1 routes every automation row straight to 'approved'.
create index if not exists idx_sms_outbound_approved
  on public.sms_outbound (created_at) where status = 'approved';

-- ---------------------------------------------------------------------------
-- (b) sms_enqueue_automation - the DB owns dedup
-- ---------------------------------------------------------------------------

-- WHY AN RPC AND NOT A PostgREST UPSERT: both uniqueness guarantees live in PARTIAL
-- indexes, and ON CONFLICT will not infer a partial index as arbiter unless the statement
-- REPEATS the index predicate - which PostgREST's on_conflict= param cannot supply. The
-- pre-rewrite `.upsert({onConflict:'...'})` in sms-automation-run therefore raises 42P10,
-- and enqueue() swallows it (console.error; return 0) while still reporting ok:true with
-- queued all-zeros. Inside plpgsql we CAN supply the predicate.
-- NOTE (P0, 2026-07-25): 42P10 is UNTESTED, not confirmed - sms_outbound is empty of ALL
-- origins, including broadcast rows that never touched this upsert, so the emptiness is
-- explained by "nobody ever used the feature". Treat the theory as unproven until P4b.
--
-- The body BRANCHES per source so each ON CONFLICT names its own partial index; a single
-- OR-ed form cannot name two arbiters.
create or replace function public.sms_enqueue_automation(
  p_sender_id         uuid,
  p_recipient_id      uuid,   -- NULL for an offline (manual-booking) guest
  p_recipient_phone   text,
  p_kind              text,
  p_message           text,
  p_booking_id        uuid default null,
  p_manual_booking_id uuid default null
) returns uuid                -- NULL = already queued (or unreachable guest)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_kind is null or p_kind not in ('check_in','review_request','win_back') then
    raise exception 'invalid automation kind: %', p_kind using errcode = '22023';
  end if;
  -- exactly one source (the table CHECK only enforces at-most-one)
  if (p_booking_id is null) = (p_manual_booking_id is null) then
    raise exception 'exactly one of p_booking_id / p_manual_booking_id is required'
      using errcode = '22023';
  end if;
  if p_sender_id is null or p_message is null then
    raise exception 'sender_id and message are required' using errcode = '22023';
  end if;
  if p_recipient_phone is null or btrim(p_recipient_phone) = '' then
    return null;  -- unreachable guest: not an error, nothing to queue
  end if;

  if p_booking_id is not null then
    insert into public.sms_outbound (
      sender_id, recipient_id, recipient_phone, contact_event_id, broadcast_id,
      automation_kind, source_booking_id, message, status
    ) values (
      p_sender_id, p_recipient_id, btrim(p_recipient_phone), null, null,
      p_kind, p_booking_id, left(p_message, 320), 'approved'   -- D1: auto-approve
    )
    on conflict (sender_id, source_booking_id, automation_kind)
      where automation_kind is not null and source_booking_id is not null
      do nothing
    returning id into v_id;
  else
    insert into public.sms_outbound (
      sender_id, recipient_id, recipient_phone, contact_event_id, broadcast_id,
      automation_kind, source_manual_booking_id, message, status
    ) values (
      p_sender_id, p_recipient_id, btrim(p_recipient_phone), null, null,
      p_kind, p_manual_booking_id, left(p_message, 320), 'approved'
    )
    on conflict (sender_id, source_manual_booking_id, automation_kind)
      where automation_kind is not null and source_manual_booking_id is not null
      do nothing
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.sms_enqueue_automation(uuid,uuid,text,text,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.sms_enqueue_automation(uuid,uuid,text,text,text,uuid,uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- (c) sms_dispatch_batch - the 0-credit preflight
-- ---------------------------------------------------------------------------

-- A 0-balance owner's rows are never handed to the gateway, so no send is attempted
-- (spec section 6).
--
-- THE SUBTLE PART: the filter is PER-SENDER-RANKED, not a flat sms_remaining >= 1. An
-- owner holding 1 credit and 5 approved rows would otherwise get all 5 delivered, with 4
-- failing the charge AFTER delivery. Ranking also means a broke owner's rows do not
-- occupy the LIMIT window and starve solvent owners.
--
-- THE THREE-VALUED-LOGIC TRAP - do not "simplify" either expression. automation_kind is
-- NULL for every broadcast and contact row, and `NULL IN (...)` is NULL, so a bare
-- `s.automation_kind in (...)` makes `chargeable` NULL and `WHERE NOT chargeable OR ...`
-- filters those rows OUT - silently killing the entire user-initiated broadcast and 1:1
-- contact pipeline AFTER the credit was already deducted at admin-approve. Hence IS TRUE
-- and IS NOT TRUE. (System kinds escape only by luck: 'vip_activation' IN (...) is FALSE.)
--
-- There is NO time predicate here on purpose: sms-dispatch calls
-- sms_expire_stale_automation() FIRST, so stale rows are already retired. One window
-- definition, one place.
create or replace function public.sms_dispatch_batch(p_limit int default 25)
returns table (id uuid, recipient_phone text, message text)
language sql stable security definer set search_path = public, pg_temp as $$
  with candidates as (
    select s.id, s.recipient_phone, s.message, s.sender_id, s.created_at,
           (s.automation_kind in ('check_in','review_request','win_back')) is true as chargeable
    from public.sms_outbound s
    where s.status = 'approved'
      and s.charged_at is null      -- belt and braces; sms_mark_sent sets both together
  ),
  ranked as (
    select c.*,
           row_number() over (partition by c.sender_id, c.chargeable
                              order by c.created_at) as rn
    from candidates c
  )
  select r.id, r.recipient_phone, r.message
  from ranked r
  -- LEFT JOIN so a sender with no balances row gets coalesce(NULL,0)=0 and is correctly
  -- excluded, rather than silently dropped by an inner join. balances rows are created
  -- LAZILY by the purchase/topup RPCs, so "no row" is a real, common state.
  left join public.balances b on b.user_id = r.sender_id
  where r.chargeable is not true
     or r.rn <= coalesce(b.sms_remaining, 0)
  order by r.created_at
  limit greatest(coalesce(p_limit, 25), 0);
$$;

revoke all on function public.sms_dispatch_batch(int) from public, anon, authenticated;
grant execute on function public.sms_dispatch_batch(int) to service_role;

-- ---------------------------------------------------------------------------
-- (d) sms_mark_sent / sms_mark_failed
-- ---------------------------------------------------------------------------

-- Status flip AND conditional charge in ONE transaction, so they cannot diverge.
--
-- THE CRITICAL INVARIANT: this MUST NOT RAISE on insufficient credit. The batch read of
-- sms_remaining and the per-row charge are separated by a gateway round trip; a concurrent
-- admin approve or an overlapping dispatch run can drain the balance in between - and by
-- then the SMS HAS ALREADY BEEN DELIVERED. If we raised, the row would stay 'approved' and
-- the next run would RE-SEND to the guest. One uncharged credit beats a duplicate message.
--
-- Double-charge guard is charged_at (durable), so a retry re-enters and does nothing. The
-- automation_kind filter is an INDEPENDENT second guard, not a duplicate: broadcast rows
-- were charged by sms_consume_credits_bulk and still have charged_at IS NULL.
-- NOTE: `v_row.automation_kind in (...)` inside plpgsql IF is safe - NULL is not TRUE, so
-- a broadcast row takes the else path. Do not "fix" it into a bare SQL WHERE.
create or replace function public.sms_mark_sent(
  p_sms_id uuid, p_provider_response jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row       public.sms_outbound%rowtype;
  v_remaining int;
  v_charged   boolean := false;
  v_reason    text    := null;
begin
  select * into v_row from public.sms_outbound where id = p_sms_id for update;
  if not found then
    raise exception 'sms not found' using errcode = 'P0002';
  end if;

  if v_row.automation_kind in ('check_in','review_request','win_back')
     and v_row.charged_at is null then
    select sms_remaining into v_remaining
      from public.balances where user_id = v_row.sender_id for update;

    if found and coalesce(v_remaining, 0) >= 1 then
      update public.balances
         set sms_remaining = v_remaining - 1, updated_at = now()
       where user_id = v_row.sender_id;

      insert into public.transactions (user_id, amount, type, description, reference_id)
      values (v_row.sender_id, 0, 'sms_send'::public.transaction_type,
              format('SMS გაგზავნილია (%s): %s', v_row.automation_kind, v_row.recipient_phone),
              p_sms_id);
      v_charged := true;
    else
      v_reason := 'insufficient_credit';   -- includes "no balances row at all"
    end if;
  end if;

  update public.sms_outbound
     set status     = 'sent',
         sent_at    = now(),
         charged_at = case when v_charged then now() else charged_at end,
         provider_response = coalesce(p_provider_response, '{}'::jsonb)
           || case when v_reason is null then '{}'::jsonb
                   else jsonb_build_object('uncharged', v_reason) end
   where id = p_sms_id;

  return jsonb_build_object('charged', v_charged, 'uncharged_reason', v_reason);
end;
$$;

-- A failed send is never charged (spec section 6). Exists so sms-dispatch stops doing raw
-- UPDATEs and the charge rule has exactly one home.
create or replace function public.sms_mark_failed(
  p_sms_id uuid, p_provider_response jsonb default null
) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.sms_outbound
     set status = 'failed', provider_response = coalesce(p_provider_response, '{}'::jsonb)
   where id = p_sms_id and status = 'approved';
$$;

revoke all on function public.sms_mark_sent(uuid,jsonb)   from public, anon, authenticated;
grant execute on function public.sms_mark_sent(uuid,jsonb)   to service_role;
revoke all on function public.sms_mark_failed(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.sms_mark_failed(uuid,jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- (e) sms_expire_stale_automation
-- ---------------------------------------------------------------------------

-- REQUIRED, not an optimisation. Two independent reasons:
--  1. The 0-credit preflight leaves a broke owner's rows sitting 'approved' indefinitely.
--  2. Correctness. T1 says "გელოდებით ხვალ" - delivered five days late it is actively
--     WRONG, not merely stale. T3 embeds the owner's own time-bounded promo text
--     ("ნოემბრის ბოლომდე"): delivered in March it is a FALSE OFFER the owner must either
--     honour or refuse.
--
-- Windows are per-kind and measured from created_at. This is only sound because P4a pins
-- T1 to exactly check_in = tomorrow (the template hardcodes "ხვალ"), so a check_in row is
-- always created ~24h before the stay. If a future change ever honours
-- check_in_reminder_hours_before (1..168), this 36h window MUST become source-date-based.
--
-- No new enum value: ALTER TYPE ... ADD VALUE cannot be USED in the transaction that adds
-- it (55P04), and 'rejected' would be semantically wrong (it implies admin action while
-- reviewed_by stays null).
create or replace function public.sms_expire_stale_automation()
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  update public.sms_outbound s
     set status = 'failed',
         provider_response = coalesce(s.provider_response, '{}'::jsonb)
           || jsonb_build_object('expired', 'window_passed', 'kind', s.automation_kind)
   where s.status          = 'approved'
     and s.charged_at      is null
     and s.automation_kind in ('check_in','review_request','win_back')
     and s.created_at < now() - (case s.automation_kind
           when 'check_in'       then interval '36 hours'
           when 'review_request' then interval '7 days'
           when 'win_back'       then interval '30 days'
           else interval '3650 days' end);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.sms_expire_stale_automation() from public, anon, authenticated;
grant execute on function public.sms_expire_stale_automation() to service_role;

notify pgrst, 'reload schema';

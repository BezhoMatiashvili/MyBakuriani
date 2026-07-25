-- SMS automation module, migration A of D: schema only.
-- See sms.md P1. Applied via MCP apply_migration (never `supabase db push` - the ledger
-- versions do not correspond to these filenames).
--
-- DOWN (manual, for reference):
--   alter table bookings drop column if exists marketing_consent, drop column if exists marketing_consent_at;
--   alter table manual_bookings drop column if exists marketing_consent, drop column if exists marketing_consent_at;
--   alter table profiles drop column if exists marketing_opt_out;
--   alter table properties drop column if exists check_in_time;
--   alter table sms_automation_rules drop column if exists win_back_discount_value,
--                                    drop column if exists win_back_discount_period;

-- 1. Consent. Per-booking, captured at booking time (spec section 2).
--    bookings: NO WRITER TODAY (no online booking flow exists) - forward compatibility only.
--    manual_bookings: written by the host, owner-attested (D5).
alter table public.bookings
  add column if not exists marketing_consent    boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;
alter table public.manual_bookings
  add column if not exists marketing_consent    boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;

comment on column public.manual_bookings.marketing_consent is
  'Owner-attested: the host ticked "the guest agreed to receive offers" when entering this offline booking. Gates T2/T3 marketing SMS. NOT guest-given - see sms.md D5 and follow-up sms-f3.';

-- 2. Guest-side opt-out. Deliberately NOT added to any C14 reviewable allow-list, so the
--    guest can set it themselves without an admin approving it. Honours the already-published
--    promise in src/content/legal/privacy.en.ts ("Withdraw consent to marketing.").
alter table public.profiles
  add column if not exists marketing_opt_out boolean not null default false;

-- 3. Check-in time (spec section 7: default 14:00). Stored as `time` so it cannot hold
--    garbage; rendered with to_char(...,'HH24:MI') / a 5-char slice on the edge side.
--    Editable from /dashboard/sms per D7 - NOT from the listing forms, which sit behind
--    the C14 review gate.
alter table public.properties
  add column if not exists check_in_time time not null default '14:00';

-- 4. The two owner-controlled win-back parameters (spec section 3: max 10 / max 30 chars).
--    Nullable: NULL means "not set", which is what the T3 fallback sentence branches on.
--    NOT enforced non-null when win_back_enabled - the UI's autosave PUT always sends the
--    whole object and the toggle flips before the fields can be filled, so a table-level
--    CHECK would make the toggle itself unsettable. Required-ness is a UI concern (P6) plus
--    a server-side fallback (P4a). Both, per spec sections 3 and 4.
alter table public.sms_automation_rules
  add column if not exists win_back_discount_value  text,
  add column if not exists win_back_discount_period text;
alter table public.sms_automation_rules
  drop constraint if exists sms_automation_discount_value_len;
alter table public.sms_automation_rules
  add  constraint sms_automation_discount_value_len
  check (win_back_discount_value is null or char_length(win_back_discount_value) <= 10);
alter table public.sms_automation_rules
  drop constraint if exists sms_automation_discount_period_len;
alter table public.sms_automation_rules
  add  constraint sms_automation_discount_period_len
  check (win_back_discount_period is null or char_length(win_back_discount_period) <= 30);

-- 5. Spec section 5 (rental-only) backfill. An owner whose listings are ALL sale listings
--    may already have flipped toggles on, and P8's UI gate cannot retroactively stop the
--    cron from firing for them. coalesce(is_for_sale,false): the column is nullable and
--    NULL means rental everywhere in this repo (see src/lib/sms/sender-access.ts:21).
--    NOTE (P0, 2026-07-25): sms_automation_rules is empty in prod, so this is a no-op today.
--    Kept because it is idempotent and guards an owner who toggles something on before P8 lands.
update public.sms_automation_rules r
   set check_in_reminder_enabled = false,
       review_request_enabled    = false,
       win_back_enabled          = false
 where (r.check_in_reminder_enabled or r.review_request_enabled or r.win_back_enabled)
   and not exists (
     select 1 from public.properties p
      where p.owner_id = r.user_id and coalesce(p.is_for_sale, false) = false);

-- 6. Scan support. The three per-kind scans filter on owner + a date; no index covers that.
create index if not exists idx_bookings_owner_check_in
  on public.bookings (owner_id, check_in);
create index if not exists idx_bookings_owner_check_out
  on public.bookings (owner_id, check_out);
create index if not exists idx_manual_bookings_owner_check_in
  on public.manual_bookings (owner_id, check_in);
create index if not exists idx_manual_bookings_owner_check_out
  on public.manual_bookings (owner_id, check_out);

notify pgrst, 'reload schema';

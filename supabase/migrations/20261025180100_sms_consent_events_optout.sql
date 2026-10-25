-- Guest SMS consent evidence and the win-back opt-out link (owner's technical task 2026-10-25; C18).
--
-- 1. manual_booking_sms_consent_events: append-only history of every consent row change: when, the new
--    and previous state, the source (host_request, consent_page, sms_stop_link, inherited, system,
--    backfill), the consent text version (consent_version), the host, the property and the channel.
--    No phone number: an event points at its consent row.
-- 2. sms_optout_tokens: one per win-back text (sms-automation-run). /sms-stop/<token> withdraws that
--    host's offers to the number through respond_manual_booking_sms_consent(.., 'revoke'), the one
--    guest-withdrawal rule (it also withdraws the host's other accepted rows for the number).
-- 3. respond_manual_booking_sms_consent_as_guest: the consent page's entry point, so its events say
--    consent_page. The consent RPCs themselves are unchanged.

create table if not exists public.manual_booking_sms_consent_events (
  id bigint generated always as identity primary key,
  consent_id uuid not null references public.manual_booking_sms_consents(id) on delete cascade,
  manual_booking_id uuid not null,
  owner_id uuid not null,
  property_id uuid,
  channel text not null default 'sms' check (channel = 'sms'),
  action text not null
    check (action in ('legacy_unverified', 'pending', 'accepted', 'declined', 'revoked')),
  previous_status text,
  source text not null
    check (source in ('host_request', 'consent_page', 'sms_stop_link', 'inherited', 'system', 'backfill')),
  text_version text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists manual_booking_sms_consent_events_consent_idx
  on public.manual_booking_sms_consent_events (consent_id, occurred_at);
create index if not exists manual_booking_sms_consent_events_owner_idx
  on public.manual_booking_sms_consent_events (owner_id, occurred_at);
alter table public.manual_booking_sms_consent_events enable row level security;
revoke all on table public.manual_booking_sms_consent_events from public, anon, authenticated;
grant select on table public.manual_booking_sms_consent_events to service_role;
comment on table public.manual_booking_sms_consent_events is
  'Append-only consent evidence (no phone). Written only by manual_booking_sms_consent_record_event.';

-- Source: an inherited row is created by the same-host rule; otherwise the entry point that set
-- app.sms_consent_source in this transaction; otherwise a pending row is the host's request and
-- anything else (superseded link, cancelled or re-phoned booking) is the system's.
create or replace function public.manual_booking_sms_consent_record_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_source text;
begin
  v_source := case
    when tg_op = 'INSERT' and new.consent_version like '%-inherited' then 'inherited'
    else coalesce(
      nullif(current_setting('app.sms_consent_source', true), ''),
      case when new.status = 'pending' then 'host_request' else 'system' end)
  end;
  insert into public.manual_booking_sms_consent_events (
    consent_id, manual_booking_id, owner_id, property_id, action, previous_status, source, text_version
  )
  select new.id, new.manual_booking_id, new.owner_id, mb.property_id, new.status,
    case when tg_op = 'UPDATE' then old.status end, v_source, new.consent_version
  from (select 1) one
  left join public.manual_bookings mb on mb.id = new.manual_booking_id;
  return null;
exception when others then
  -- Evidence must never block a guest's answer or a withdrawal.
  raise warning 'manual_booking_sms_consent_record_event failed for %: %', new.id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.manual_booking_sms_consent_record_event() from public, anon, authenticated;

drop trigger if exists manual_booking_sms_consent_record_insert on public.manual_booking_sms_consents;
create trigger manual_booking_sms_consent_record_insert
  after insert on public.manual_booking_sms_consents
  for each row execute function public.manual_booking_sms_consent_record_event();
drop trigger if exists manual_booking_sms_consent_record_status on public.manual_booking_sms_consents;
create trigger manual_booking_sms_consent_record_status
  after update of status on public.manual_booking_sms_consents
  for each row when (old.status is distinct from new.status)
  execute function public.manual_booking_sms_consent_record_event();

-- One snapshot per existing row, so every consent has a start.
insert into public.manual_booking_sms_consent_events (
  consent_id, manual_booking_id, owner_id, property_id, action, previous_status, source, text_version, occurred_at
)
select c.id, c.manual_booking_id, c.owner_id, mb.property_id, c.status, null, 'backfill', c.consent_version,
  coalesce(c.revoked_at, c.declined_at, c.accepted_at, c.created_at)
from public.manual_booking_sms_consents c
left join public.manual_bookings mb on mb.id = c.manual_booking_id
where not exists (
  select 1 from public.manual_booking_sms_consent_events e where e.consent_id = c.id
);

create or replace function public.respond_manual_booking_sms_consent_as_guest(p_token_hash text, p_action text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('app.sms_consent_source', 'consent_page', true);
  return public.respond_manual_booking_sms_consent(p_token_hash, p_action);
end;
$$;

create table if not exists public.sms_optout_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  manual_booking_id uuid not null references public.manual_bookings(id) on delete cascade,
  consent_id uuid not null references public.manual_booking_sms_consents(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 year',
  used_at timestamptz
);
create index if not exists sms_optout_tokens_booking_idx on public.sms_optout_tokens (manual_booking_id);
create index if not exists sms_optout_tokens_consent_idx on public.sms_optout_tokens (consent_id);
alter table public.sms_optout_tokens enable row level security;
revoke all on table public.sms_optout_tokens from public, anon, authenticated;
grant select on table public.sms_optout_tokens to service_role;
comment on table public.sms_optout_tokens is
  'Win-back opt-out links (sha256 of the token, no phone). Written only by sms_issue_optout_token / sms_optout_by_token.';

-- A win-back text is queued only with a token: no accepted consent for the booking = no token = no text.
create or replace function public.sms_issue_optout_token(p_owner_id uuid, p_manual_booking_id uuid, p_token_hash text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_consent uuid;
begin
  if p_owner_id is null or p_manual_booking_id is null
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid opt-out token' using errcode = '22023';
  end if;
  select c.id into v_consent
  from public.manual_booking_sms_consents c
  join public.manual_bookings mb on mb.id = c.manual_booking_id
  where c.manual_booking_id = p_manual_booking_id
    and c.owner_id = p_owner_id and mb.owner_id = p_owner_id
    and c.status = 'accepted'
  order by c.accepted_at desc nulls last, c.created_at desc
  limit 1;
  if v_consent is null then
    return false;
  end if;
  insert into public.sms_optout_tokens (token_hash, owner_id, manual_booking_id, consent_id)
  values (p_token_hash, p_owner_id, p_manual_booking_id, v_consent);
  return true;
end;
$$;

-- What the opt-out page shows: whether offers from this host to the number are still on, and the
-- listing. Null for an unknown or expired link.
create or replace function public.sms_optout_token_details(p_token_hash text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_t public.sms_optout_tokens%rowtype;
  v_phone text;
  v_title text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_t from public.sms_optout_tokens where token_hash = p_token_hash;
  if not found or v_t.expires_at <= now() then
    return null;
  end if;
  select c.phone_snapshot into v_phone
  from public.manual_booking_sms_consents c where c.id = v_t.consent_id;
  select p.title into v_title
  from public.manual_bookings mb join public.properties p on p.id = mb.property_id
  where mb.id = v_t.manual_booking_id;
  return jsonb_build_object(
    'status', case when exists (
        select 1 from public.manual_booking_sms_consents c
        where c.owner_id = v_t.owner_id and c.phone_snapshot = v_phone and c.status = 'accepted'
      ) then 'active' else 'withdrawn' end,
    'property_title', v_title
  );
end;
$$;

create or replace function public.sms_optout_by_token(p_token_hash text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_t public.sms_optout_tokens%rowtype;
  v_phone text;
  v_target text;
  v_done boolean := false;
  v_rounds integer := 0;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid opt-out token' using errcode = '22023';
  end if;
  select * into v_t from public.sms_optout_tokens
  where token_hash = p_token_hash
  for update;
  if not found or v_t.expires_at <= now() then
    raise exception 'invalid opt-out token' using errcode = 'P0002';
  end if;
  select c.phone_snapshot into v_phone
  from public.manual_booking_sms_consents c where c.id = v_t.consent_id;

  perform set_config('app.sms_consent_source', 'sms_stop_link', true);
  -- Answer as the guest on a live acceptance of this host + number; respond's revoke withdraws every
  -- accepted row of the pair, so this normally runs once. A cancelled or re-phoned booking has no
  -- accepted row (manual_booking_sms_consent_phone_invalidation), so respond never refuses one here.
  loop
    v_target := null;
    select c.token_hash into v_target
    from public.manual_booking_sms_consents c
    join public.manual_bookings mb on mb.id = c.manual_booking_id
    where c.owner_id = v_t.owner_id and c.phone_snapshot = v_phone and c.status = 'accepted'
      and mb.status <> 'cancelled'
      and public.sms_canonical_ge_phone(mb.guest_phone) = c.phone_snapshot
    order by c.accepted_at desc nulls last, c.created_at desc
    limit 1;
    exit when v_target is null or v_rounds >= 20;
    perform public.respond_manual_booking_sms_consent(v_target, 'revoke');
    v_done := true;
    v_rounds := v_rounds + 1;
  end loop;

  update public.sms_optout_tokens set used_at = coalesce(used_at, now())
  where token_hash = v_t.token_hash;
  return jsonb_build_object('status', case when v_done then 'withdrawn' else 'already' end);
end;
$$;

revoke all on function public.respond_manual_booking_sms_consent_as_guest(text, text) from public, anon, authenticated;
revoke all on function public.sms_issue_optout_token(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sms_optout_token_details(text) from public, anon, authenticated;
revoke all on function public.sms_optout_by_token(text) from public, anon, authenticated;
grant execute on function public.respond_manual_booking_sms_consent_as_guest(text, text) to service_role;
grant execute on function public.sms_issue_optout_token(uuid, uuid, text) to service_role;
grant execute on function public.sms_optout_token_details(text) to service_role;
grant execute on function public.sms_optout_by_token(text) to service_role;

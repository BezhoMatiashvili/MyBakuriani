-- Email (C33), everything through Resend:
--   * transactional: a copy of selected in-app notifications, sent by
--     /api/email/dispatch (pg_cron, every 5 min). Resend is also the Supabase
--     Auth SMTP.
--   * marketing: campaigns are Resend Broadcasts; this schema only keeps each
--     Resend contact's `unsubscribed` flag equal to
--     profiles.marketing_email_consent (C30), via the same dispatcher.
--
-- 1. email_outbound        queue, filled by an AFTER INSERT trigger on notifications
-- 2. email_suppressions    bounce/complaint list; suppressed addresses are never mailed
-- 3. email_marketing_sync  pending Resend contact (un)subscribe per user
-- 4. email_claim_batch / email_marketing_claim  lease-based claiming
-- 5. email_user_ids_for_address  webhook helper (auth.users is not exposed)
-- 6. user_consents.source += 'email_unsubscribe' (Resend unsubscribe webhook)
--
-- Nothing here sends mail. The dispatcher fails closed until
-- EMAIL_DELIVERY_ENABLED=true is set on the app, and honours
-- EMAIL_ALLOWED_RECIPIENTS (staging allow-list).

-- ---------------------------------------------------------------------------
-- 0. The transactional allow-list. Mirrored by src/lib/email/types.ts
--    EMAIL_NOTIFICATION_TYPES; scripts/check-contracts.mjs compares the two.
-- ---------------------------------------------------------------------------
create or replace function public.email_notification_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- money & membership
    'payment_success', 'payment_failed', 'payment_refund', 'payment_required',
    'membership_pending', 'membership_approved', 'membership_rejected',
    'vip_expiring', 'company_subscription',
    -- listing moderation
    'listing_moderation', 'content_change_approved', 'content_change_rejected',
    'company_moderation',
    -- work requests
    'cleaning_task_new', 'cleaning_task_status', 'cleaning_task_cancellation_requested',
    'cleaning_task_cancelled', 'smart_match_request', 'smart_match_offer',
    'job_application', 'org_membership_request', 'org_membership_response',
    -- admin queues
    'admin_listing_pending', 'admin_content_change_pending', 'admin_membership_pending',
    'admin_payment_review', 'admin_company_pending', 'admin_sms_pending'
  ]::text[]
$$;

-- ---------------------------------------------------------------------------
-- 1. Queue
-- ---------------------------------------------------------------------------
create table public.email_outbound (
  id                  uuid primary key default gen_random_uuid(),
  notification_id     uuid unique references public.notifications(id) on delete set null,
  user_id             uuid not null,
  to_email            text not null,
  notification_type   text not null,
  subject             text not null,
  body                text,
  action_url          text,
  status              text not null default 'queued'
                      check (status in ('queued', 'sending', 'sent', 'failed', 'suppressed', 'cancelled')),
  attempts            integer not null default 0,
  next_attempt_at     timestamptz not null default now(),
  claim_token         uuid,
  claimed_at          timestamptz,
  provider_message_id text,
  last_error          text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index email_outbound_due_idx on public.email_outbound (next_attempt_at)
  where status in ('queued', 'sending');

create table public.email_suppressions (
  email      text primary key check (email = lower(email)),
  reason     text not null check (reason in ('bounce', 'complaint', 'manual')),
  provider   text check (provider in ('resend')),
  detail     jsonb,
  created_at timestamptz not null default now()
);

create table public.email_marketing_sync (
  user_id      uuid primary key,
  subscribed   boolean not null,
  email        text,
  requested_at timestamptz not null default now(),
  synced_at    timestamptz,
  attempts     integer not null default 0,
  claim_token  uuid,
  claimed_at   timestamptz,
  last_error   text
);
create index email_marketing_sync_pending_idx on public.email_marketing_sync (requested_at)
  where synced_at is null;

-- Server-only tables: RLS on, no policies, no browser grants.
alter table public.email_outbound       enable row level security;
alter table public.email_suppressions   enable row level security;
alter table public.email_marketing_sync enable row level security;
revoke all on public.email_outbound, public.email_suppressions, public.email_marketing_sync
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. notifications -> email_outbound. Must NEVER fail the notification insert:
--    _notify runs inside payment / moderation transactions, so an error here
--    would roll those back. Everything is caught and downgraded to a WARNING.
-- ---------------------------------------------------------------------------
create or replace function public.email_enqueue_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  if not (new.type = any (public.email_notification_types())) then
    return null;
  end if;

  begin
    select lower(u.email) into v_email
      from auth.users u
     where u.id = new.user_id
       and u.email is not null
       and u.email_confirmed_at is not null;

    if v_email is null then
      return null;
    end if;

    insert into public.email_outbound
      (notification_id, user_id, to_email, notification_type, subject, body, action_url, status)
    values
      (new.id, new.user_id, v_email, new.type, left(new.title, 200), left(new.message, 4000),
       new.action_url,
       case when exists (select 1 from public.email_suppressions s where s.email = v_email)
            then 'suppressed' else 'queued' end)
    on conflict (notification_id) do nothing;
  exception when others then
    raise warning 'email_enqueue_notification skipped %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.email_enqueue_notification() from public, anon, authenticated;

create trigger notifications_enqueue_email
  after insert on public.notifications
  for each row execute function public.email_enqueue_notification();

-- ---------------------------------------------------------------------------
-- 3. profiles.marketing_email_consent -> email_marketing_sync
-- ---------------------------------------------------------------------------
create or replace function public.email_marketing_consent_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- Account deleted: unsubscribe the Resend contact too.
    insert into public.email_marketing_sync (user_id, subscribed, email)
    values (old.id, false, (select lower(email) from auth.users where id = old.id))
    on conflict (user_id) do update
      set subscribed = false,
          email = coalesce(excluded.email, email_marketing_sync.email),
          requested_at = now(), synced_at = null, attempts = 0, last_error = null,
          claim_token = null, claimed_at = null;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.marketing_email_consent is not distinct from old.marketing_email_consent then
    return new;
  end if;

  -- Clearing the claim makes an in-flight dispatcher run's completion write
  -- (which matches on claim_token) a no-op, so the NEW intent is synced next.
  insert into public.email_marketing_sync (user_id, subscribed)
  values (new.id, coalesce(new.marketing_email_consent, false))
  on conflict (user_id) do update
    set subscribed = excluded.subscribed,
        requested_at = now(), synced_at = null, attempts = 0, last_error = null,
          claim_token = null, claimed_at = null;
  return new;
exception when others then
  raise warning 'email_marketing_consent_changed skipped: % %', sqlstate, sqlerrm;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.email_marketing_consent_changed() from public, anon, authenticated;

create trigger profiles_email_marketing_sync
  after insert or update of marketing_email_consent or delete on public.profiles
  for each row execute function public.email_marketing_consent_changed();

-- Backfill everyone who already opted in.
insert into public.email_marketing_sync (user_id, subscribed)
select id, true from public.profiles where marketing_email_consent is true
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Claiming. A lease (claim_token + claimed_at) keeps overlapping cron runs
--    from handing one row to the provider twice; a lease older than 10 minutes
--    is considered abandoned and re-claimable. Resend's Idempotency-Key (the
--    row id) covers the "sent, but died before marking" window.
-- ---------------------------------------------------------------------------
create or replace function public.email_claim_batch(p_limit integer, p_claim_token uuid)
returns table (
  id uuid, to_email text, notification_type text, subject text, body text,
  action_url text, attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_claim_token is null then
    raise exception 'invalid_claim_args' using errcode = '22023';
  end if;

  -- A notification email older than 3 days is no longer worth sending.
  update public.email_outbound o
     set status = 'cancelled', last_error = 'expired', claim_token = null
   where o.status in ('queued', 'sending')
     and o.created_at < now() - interval '3 days';

  -- Suppressed since it was queued (bounce/complaint webhook).
  update public.email_outbound o
     set status = 'suppressed', claim_token = null
   where o.status = 'queued'
     and exists (select 1 from public.email_suppressions s where s.email = o.to_email);

  return query
  update public.email_outbound o
     set status = 'sending', claim_token = p_claim_token, claimed_at = now(),
         attempts = o.attempts + 1
   where o.id in (
     select c.id from public.email_outbound c
      where (c.status = 'queued' and c.next_attempt_at <= now())
         or (c.status = 'sending' and c.claimed_at < now() - interval '10 minutes')
      order by c.created_at
      limit p_limit
      for update skip locked)
  returning o.id, o.to_email, o.notification_type, o.subject, o.body, o.action_url, o.attempts;
end;
$$;

create or replace function public.email_marketing_claim(p_limit integer, p_claim_token uuid)
returns table (user_id uuid, subscribed boolean, email text, display_name text, attempts integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_claim_token is null then
    raise exception 'invalid_claim_args' using errcode = '22023';
  end if;

  return query
  with picked as (
    select s.user_id from public.email_marketing_sync s
     where s.synced_at is null
       and (s.claimed_at is null or s.claimed_at < now() - interval '10 minutes')
       and s.attempts < 10
     order by s.requested_at
     limit p_limit
     for update skip locked
  ), claimed as (
    update public.email_marketing_sync s
       set claim_token = p_claim_token, claimed_at = now(), attempts = s.attempts + 1,
           -- Remember the current confirmed address, so a later removal still
           -- knows which contact to take off the list.
           email = coalesce(
             (select lower(u.email) from auth.users u
               where u.id = s.user_id and u.email_confirmed_at is not null),
             s.email)
      from picked p
     where s.user_id = p.user_id
    returning s.user_id, s.subscribed, s.email, s.attempts
  )
  select c.user_id, c.subscribed, c.email, pr.display_name, c.attempts
    from claimed c
    left join public.profiles pr on pr.id = c.user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Webhook helper: the Resend unsubscribe webhook knows only an address.
-- ---------------------------------------------------------------------------
create or replace function public.email_user_ids_for_address(p_email text)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id from auth.users u
   where lower(u.email) = lower(trim(p_email))
     and exists (select 1 from public.profiles p where p.id = u.id)
$$;

revoke all on function public.email_claim_batch(integer, uuid) from public, anon, authenticated;
revoke all on function public.email_marketing_claim(integer, uuid) from public, anon, authenticated;
revoke all on function public.email_user_ids_for_address(text) from public, anon, authenticated;
revoke all on function public.email_notification_types() from public, anon, authenticated;
grant execute on function public.email_claim_batch(integer, uuid) to service_role;
grant execute on function public.email_marketing_claim(integer, uuid) to service_role;
grant execute on function public.email_user_ids_for_address(text) to service_role;
grant execute on function public.email_notification_types() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Consent source 'email_unsubscribe'. The route /api/consent only accepts
--    the two UI sources, so a user cannot stamp this one on their own writes.
-- ---------------------------------------------------------------------------
alter table public.user_consents drop constraint if exists user_consents_source_check;
alter table public.user_consents add constraint user_consents_source_check
  check (source in ('registration_gate', 'account_settings', 'email_unsubscribe'));

-- Body copied from 20260923120000 by script; the ONLY change is
-- 'email_unsubscribe' in the v_source check.
create or replace function public.self_service_record_consent(
  p_actor_id uuid,
  p_values   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile public.profiles%rowtype;
  v_key     text;
  v_source  text;
  v_version text;
  v_allowed text[] := array[
    'source', 'version',
    'terms', 'privacy', 'marketing_sms', 'marketing_email', 'marketing_whatsapp', 'push'
  ];
begin
  if p_actor_id is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'invalid_consent_payload' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  for v_key in select jsonb_object_keys(p_values) loop
    if not v_key = any(v_allowed) then
      raise exception 'consent_field_not_allowed: %', v_key using errcode = '42501';
    end if;
  end loop;

  v_source := coalesce(p_values ->> 'source', 'account_settings');
  if v_source not in ('registration_gate', 'account_settings', 'email_unsubscribe') then
    raise exception 'invalid_consent_source' using errcode = '22023';
  end if;
  v_version := nullif(p_values ->> 'version', '');

  foreach v_key in array array['terms','privacy','marketing_sms','marketing_email','marketing_whatsapp','push'] loop
    if p_values ? v_key and jsonb_typeof(p_values -> v_key) <> 'boolean' then
      raise exception 'invalid_consent_value: %', v_key using errcode = '22023';
    end if;
  end loop;

  /* Terms and privacy are acceptance records, not toggles: an account holder
     cannot "un-accept" them here. Refusing is handled in the UI by signing out,
     which leaves the timestamps NULL and re-shows the gate on next sign-in. */
  if (p_values ? 'terms' and (p_values ->> 'terms')::boolean is not true)
     or (p_values ? 'privacy' and (p_values ->> 'privacy')::boolean is not true) then
    raise exception 'consent_cannot_be_withdrawn' using errcode = '22023';
  end if;

  update public.profiles
     set terms_accepted_at = case
           when p_values ? 'terms' then coalesce(terms_accepted_at, now())
           else terms_accepted_at end,
         terms_version = case
           when p_values ? 'terms' then coalesce(terms_version, v_version)
           else terms_version end,
         privacy_accepted_at = case
           when p_values ? 'privacy' then coalesce(privacy_accepted_at, now())
           else privacy_accepted_at end,
         privacy_version = case
           when p_values ? 'privacy' then coalesce(privacy_version, v_version)
           else privacy_version end,
         marketing_sms_consent = case
           when p_values ? 'marketing_sms' then (p_values ->> 'marketing_sms')::boolean
           else marketing_sms_consent end,
         marketing_email_consent = case
           when p_values ? 'marketing_email' then (p_values ->> 'marketing_email')::boolean
           else marketing_email_consent end,
         marketing_whatsapp_consent = case
           when p_values ? 'marketing_whatsapp' then (p_values ->> 'marketing_whatsapp')::boolean
           else marketing_whatsapp_consent end,
         push_consent = case
           when p_values ? 'push' then (p_values ->> 'push')::boolean
           else push_consent end
   where id = p_actor_id
   returning * into v_profile;

  insert into public.user_consents (user_id, kind, granted, version, source)
  select p_actor_id, e.key, (e.value)::boolean, v_version, v_source
    from jsonb_each_text(p_values - 'source' - 'version') e;

  return to_jsonb(v_profile);
end;
$$;
revoke all on function public.self_service_record_consent(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.self_service_record_consent(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';

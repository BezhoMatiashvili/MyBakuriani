-- User consent capture: terms/privacy acceptance + per-channel marketing consent.
--
-- WHY THIS SHAPE. `profiles.marketing_opt_out` (added 20260726100000, NOT NULL
-- DEFAULT false) encodes "everyone is consented until they object". The product
-- and the published Direct Marketing Policy both require affirmative opt-in, so
-- "not yet answered" must read as NOT consented. `marketing_opt_out` cannot
-- express that third state.
--
-- Rather than repoint its four readers -- two of which are expensive:
--   * supabase/functions/sms-automation-run/index.ts (an EDGE FUNCTION; changing
--     it costs a full redeploy under contract C4)
--   * sms_cancel_ineligible_automation()             (20260801131000)
--   * the price-drop subscriber joins                (20260802120000)
--   * src/app/api/listings/property/[id]/price-drop-alert/route.ts
-- we add a nullable `marketing_sms_consent` as the AUTHORED truth and keep
-- `marketing_opt_out` as a trigger-DERIVED mirror:
--
--     marketing_opt_out := NOT COALESCE(marketing_sms_consent, false)
--
--   marketing_sms_consent | meaning          | marketing_opt_out | marketing SMS
--   ----------------------+------------------+-------------------+--------------
--   NULL                  | not yet answered | true              | blocked
--   false                 | declined         | true              | blocked
--   true                  | granted          | false             | sent
--
-- All four readers keep working untouched and no edge function is redeployed.

-- ---------------------------------------------------------------------------
-- 1. Consent columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists terms_accepted_at       timestamptz,
  add column if not exists terms_version           text,
  add column if not exists privacy_accepted_at     timestamptz,
  add column if not exists privacy_version         text,
  add column if not exists marketing_sms_consent   boolean,
  add column if not exists marketing_email_consent boolean,
  add column if not exists push_consent            boolean;

comment on column public.profiles.marketing_sms_consent is
  'Tri-state marketing-SMS consent. NULL = never answered (treated as NOT '
  'consented). Authored truth; profiles.marketing_opt_out is derived from this '
  'by profiles_derive_marketing_opt_out and must never be written directly.';
comment on column public.profiles.marketing_email_consent is
  'Tri-state. Persisted and gated, but no email sender exists in this project yet.';
comment on column public.profiles.push_consent is
  'Tri-state. Persisted and gated, but no web-push sender exists in this project yet.';

-- ---------------------------------------------------------------------------
-- 2. Derivation trigger
-- ---------------------------------------------------------------------------
-- NAME IS LOAD-BEARING. public.profiles already carries several BEFORE UPDATE
-- row triggers and Postgres fires them in ALPHABETICAL ORDER by trigger name:
--
--   prevent_unreviewed_public_content_update  (C14 editorial review gate)
--   profiles_derive_marketing_opt_out         <- this one
--   profiles_lock_role
--   profiles_lock_verification
--   set_profiles_updated_at
--
-- "profiles_derive_..." deliberately sorts AFTER the C14 review gate, so the
-- gate always evaluates the caller's own NEW row rather than one this trigger
-- has already rewritten. Renaming it can silently reorder that.
--
-- The derivation is idempotent for unrelated writes: an UPDATE that does not
-- mention marketing_sms_consent carries the existing row value in NEW, so
-- writing display_name (or the register wizard's 23505 role-only fallback)
-- re-derives the identical value.

create or replace function public.derive_marketing_opt_out()
returns trigger
language plpgsql
as $$
begin
  new.marketing_opt_out := not coalesce(new.marketing_sms_consent, false);
  return new;
end;
$$;

comment on function public.derive_marketing_opt_out() is
  'Keeps profiles.marketing_opt_out a pure mirror of marketing_sms_consent so '
  'the existing SMS opt-out readers need no change. See migration header.';

drop trigger if exists profiles_derive_marketing_opt_out on public.profiles;
create trigger profiles_derive_marketing_opt_out
  before insert or update on public.profiles
  for each row execute function public.derive_marketing_opt_out();

-- ---------------------------------------------------------------------------
-- 3. Widen the SMS eligibility advisory lock to the new authored column
-- ---------------------------------------------------------------------------
-- sms_lock_profile_opt_out_write is a STATEMENT-level BEFORE UPDATE OF
-- (phone, marketing_opt_out) trigger that takes the 'sms_dispatch_claim'
-- advisory lock, serializing eligibility changes against
-- sms_claim_dispatch_batch. `UPDATE OF <cols>` fires on the columns named in
-- the statement's SET clause -- NOT on what a BEFORE trigger later assigns.
-- After this migration, eligibility is changed by writing
-- marketing_sms_consent, so without adding it here the lock would silently
-- stop being taken and the serialization guarantee would be lost with no error.

drop trigger if exists sms_lock_profile_opt_out_write on public.profiles;
create trigger sms_lock_profile_opt_out_write
  before update of phone, marketing_opt_out, marketing_sms_consent
  on public.profiles
  for each statement execute function public.sms_lock_eligibility_change();

-- ---------------------------------------------------------------------------
-- 4. Backfill: nobody has affirmatively consented yet
-- ---------------------------------------------------------------------------
-- Scoped by WHERE so only rows that actually change are touched. public.profiles
-- carries trg_audit_row (AFTER INSERT/UPDATE/DELETE -> audit_row_change), but
-- for UPDATE that function records only the CHANGED keys, so this writes a small
-- two-column diff per row rather than a PII snapshot.

update public.profiles
   set marketing_sms_consent = null,
       marketing_opt_out     = true
 where marketing_opt_out is distinct from true;

-- ---------------------------------------------------------------------------
-- 5. Append-only consent audit trail
-- ---------------------------------------------------------------------------
-- The Direct Marketing Policy section 3 requires retaining consent status,
-- channel, time and source/mechanism. Deliberately NO ip/user_agent: the policy
-- says "as far as possible" and those add PII for little evidentiary gain.

create table if not exists public.user_consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in (
               'terms', 'privacy', 'marketing_sms', 'marketing_email', 'push')),
  granted    boolean not null,
  version    text,
  source     text not null check (source in ('registration_gate', 'account_settings')),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_consents_user_created
  on public.user_consents (user_id, created_at desc);

alter table public.user_consents enable row level security;

drop policy if exists "Users can view own consent history" on public.user_consents;
create policy "Users can view own consent history"
  on public.user_consents for select
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.user_consents from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The only consent writer
-- ---------------------------------------------------------------------------
-- service_role-only, mirroring self_service_update_profile /
-- self_service_set_cleaner_working_hours -- the established self-service
-- pattern for owner-authored fields that must bypass the C14 review gate.
-- Called from src/app/api/consent/route.ts behind requireUser() + rate limit.

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
    'terms', 'privacy', 'marketing_sms', 'marketing_email', 'push'
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
  if v_source not in ('registration_gate', 'account_settings') then
    raise exception 'invalid_consent_source' using errcode = '22023';
  end if;
  v_version := nullif(p_values ->> 'version', '');

  foreach v_key in array array['terms','privacy','marketing_sms','marketing_email','push'] loop
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

comment on function public.self_service_record_consent(uuid, jsonb) is
  'Records terms/privacy acceptance and per-channel marketing consent, and '
  'appends the matching user_consents audit rows, in one transaction. '
  'service_role only -- called from /api/consent behind requireUser().';

-- ---------------------------------------------------------------------------
-- 7. self_service_update_profile: swap the derived column for the authored one
-- ---------------------------------------------------------------------------
-- Body copied verbatim from the live 20260905122000 definition; the ONLY
-- changes are marketing_opt_out -> marketing_sms_consent in the two arrays and
-- in the validation block. Writing marketing_opt_out through this RPC would now
-- be silently overwritten by profiles_derive_marketing_opt_out, so it must stop
-- being an accepted key.

CREATE OR REPLACE FUNCTION public.self_service_update_profile(p_actor_id uuid, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile public.profiles%rowtype;
  v_cleaner public.cleaner_profiles%rowtype;
  v_key text;
  v_allowed text[] := array[
    'display_name','phone','avatar_url','profile_type','personal_id',
    'whatsapp_enabled','notification_prefs','marketing_sms_consent','cleaner_profile'
  ];
  v_profile_values jsonb;
  v_cleaner_values jsonb;
  v_set text;
BEGIN
  IF p_actor_id is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'invalid_self_service_profile_payload' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if not v_key = any(v_allowed) then
      raise exception 'self_service_profile_field_not_allowed: %', v_key using errcode = '42501';
    end if;
  end loop;
  if p_values ? 'display_name' and jsonb_typeof(p_values -> 'display_name') <> 'null' then
    if jsonb_typeof(p_values -> 'display_name') <> 'string'
      or length(trim(p_values ->> 'display_name')) = 0
      or length(p_values ->> 'display_name') > 100 then
      raise exception 'invalid_display_name' using errcode = '22023';
    end if;
  end if;
  if p_values ? 'phone' and jsonb_typeof(p_values -> 'phone') <> 'null' then
    if jsonb_typeof(p_values -> 'phone') <> 'string'
      or public.sms_canonical_ge_phone(p_values ->> 'phone') is null then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
  end if;
  if p_values ? 'profile_type'
    and (p_values ->> 'profile_type') not in ('personal', 'company') then
    raise exception 'invalid_profile_type' using errcode = '22023';
  end if;
  if p_values ? 'marketing_sms_consent'
    and jsonb_typeof(p_values -> 'marketing_sms_consent') not in ('boolean', 'null') then
    raise exception 'invalid_marketing_sms_consent' using errcode = '22023';
  end if;
  if p_values ? 'notification_prefs' then
    if jsonb_typeof(p_values -> 'notification_prefs') <> 'object'
       or exists (
         select 1 from jsonb_object_keys(p_values -> 'notification_prefs') k
         where k not in ('new_request', 'add_favorite', 'monthly_report')
       )
       or exists (
         select 1 from jsonb_each(p_values -> 'notification_prefs') e
         where jsonb_typeof(e.value) <> 'boolean'
       ) then
      raise exception 'invalid_notification_prefs' using errcode = '22023';
    end if;
  end if;
  if p_values ? 'cleaner_profile' and (
    jsonb_typeof(p_values -> 'cleaner_profile') <> 'object' or exists (
      select 1 from jsonb_object_keys(p_values -> 'cleaner_profile') k
      where k not in ('first_name','last_name','personal_number','address','phone','whatsapp')
    )
  ) then
    raise exception 'invalid_cleaner_profile' using errcode = '22023';
  end if;

  v_profile_values := p_values - 'cleaner_profile';
  if v_profile_values ? 'notification_prefs' then
    select notification_prefs into v_profile_values
      from public.profiles where id = p_actor_id for update;
    v_profile_values := (p_values - array['cleaner_profile','notification_prefs'])
      || jsonb_build_object('notification_prefs',
        coalesce(v_profile_values, '{}'::jsonb) || (p_values -> 'notification_prefs'));
  end if;
  select string_agg(format('%1$I = (jsonb_populate_record(NULL::public.profiles, $1)).%1$I', k), ', ')
    into v_set
  from jsonb_object_keys(v_profile_values) k
  where k = any(array[
    'display_name','phone','avatar_url','profile_type','personal_id',
    'whatsapp_enabled','notification_prefs','marketing_sms_consent'
  ]);
  if v_set is not null then
    execute format('update public.profiles set %s where id = $2 returning *', v_set)
      into v_profile using v_profile_values, p_actor_id;
  else
    select * into v_profile from public.profiles where id = p_actor_id;
  end if;

  if p_values ? 'cleaner_profile' then
    v_cleaner_values := p_values -> 'cleaner_profile';
    insert into public.cleaner_profiles(id) values (p_actor_id) on conflict (id) do nothing;
    select string_agg(format('%1$I = (jsonb_populate_record(NULL::public.cleaner_profiles, $1)).%1$I', k), ', ')
      into v_set
    from jsonb_object_keys(v_cleaner_values) k
    where k = any(array['first_name','last_name','personal_number','address','phone','whatsapp']);
    if v_set is not null then
      execute format('update public.cleaner_profiles set %s where id = $2 returning *', v_set)
        into v_cleaner using v_cleaner_values, p_actor_id;
    end if;
  end if;
  return jsonb_build_object('profile', to_jsonb(v_profile), 'cleaner_profile', to_jsonb(v_cleaner));
end;
$function$;

-- PostgREST caches the function and table catalogue.
notify pgrst, 'reload schema';

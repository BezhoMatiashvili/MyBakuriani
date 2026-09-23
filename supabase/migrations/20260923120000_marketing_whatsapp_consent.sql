-- Direct Marketing Policy v2 (published 2026-09-23) names WhatsApp as a
-- separately manageable marketing channel (sections 3.4 and 13.2). This adds it
-- alongside the three channels from 20260922130000, with the same tri-state
-- semantics: NULL = never answered = NOT consented (see contract C30).
--
-- NOT the same thing as profiles.whatsapp_enabled. That pre-existing column is a
-- contact-display flag (is this user reachable on WhatsApp at all) and is written
-- through self_service_update_profile. This column is marketing consent only.
--
-- No WhatsApp sender exists in this project; like email and push, the preference
-- is persisted and gated by marketingChannelAllowed() for whoever builds one.

alter table public.profiles
  add column if not exists marketing_whatsapp_consent boolean;

comment on column public.profiles.marketing_whatsapp_consent is
  'Tri-state marketing-WhatsApp consent. NULL = never answered (treated as NOT '
  'consented). Unrelated to whatsapp_enabled. No WhatsApp sender exists yet.';

-- The kind CHECK was declared inline, so its name is the generated default
-- (verified on staging: user_consents_kind_check).
alter table public.user_consents drop constraint if exists user_consents_kind_check;
alter table public.user_consents add constraint user_consents_kind_check
  check (kind in (
    'terms', 'privacy', 'marketing_sms', 'marketing_email', 'marketing_whatsapp', 'push'));

-- Body copied from 20260922130000 section 6; the ONLY changes are the
-- 'marketing_whatsapp' key in v_allowed, in the boolean-type check array, and
-- the matching SET arm.

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
  if v_source not in ('registration_gate', 'account_settings') then
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

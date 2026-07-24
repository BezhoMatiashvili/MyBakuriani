-- Fix: listing creation (and every other trigger-driven notification) returned
-- HTTP 403 after 20260723000000 added the notifications write-guard.
--
-- Root cause: prevent_notification_mutation() only whitelists service_role /
-- admins, but the "listing pending" notification is inserted by _notify(), a
-- SECURITY DEFINER helper fired from an AFTER INSERT trigger on properties /
-- services. SECURITY DEFINER swaps current_user (to the function owner), NOT
-- auth.role() -- which stays 'authenticated'. So the guard raised 42501 (->403)
-- and rolled back the whole listing insert. Broke rental, sale, food, service,
-- transport, employment, entertainment, plus job-application / smart-match
-- notifications.
--
-- Fix: exempt definer-context inserts by testing current_user. Direct client
-- REST writes keep current_user = authenticated/anon and stay blocked here AND
-- by RLS (20260723000000 dropped every client INSERT policy on notifications and
-- added none), so notification forging remains closed. Function-body-only
-- change; the notifications_server_managed trigger is unchanged.

CREATE OR REPLACE FUNCTION public.prevent_notification_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
BEGIN
  -- Trigger-driven notifications run inside SECURITY DEFINER helpers (_notify),
  -- where current_user is the function owner (postgres), not the JWT role
  -- 'authenticated'. Direct client REST writes keep current_user =
  -- authenticated/anon and stay blocked (also denied by RLS: no client INSERT
  -- policy exists).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' OR public.is_admin_user() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.is_read IS DISTINCT FROM OLD.is_read
     AND (to_jsonb(NEW) - 'is_read' - 'updated_at') =
         (to_jsonb(OLD) - 'is_read' - 'updated_at')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Notifications are server managed' USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_notification_mutation() FROM PUBLIC, anon, authenticated;

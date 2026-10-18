-- 20261016100000_user_groups.sql
--
-- Admin "Verified Users" groups (contract C52). An admin links ONE user (the
-- payer) to several others, e.g. to record that one person paid for the
-- verification of several accounts. Annotation only: nothing here changes
-- profiles.is_verified, and amounts live in the finance module (C42).
--
-- Service role only (C34): no policy, no client grant. Written by the admin
-- API (createServiceClient(adminId), so trg_audit_row records the admin) and
-- by admin_save_user_group, which replaces a group's member set atomically.
-- The payer is a member row with role 'payer' (at most one per group, enforced
-- by a partial unique index), so the audit trail (subject_user_id = user_id)
-- and "the groups of user X" use one key. The RPC writes exactly one payer;
-- deleting an account later can leave a group without a payer or without
-- members until an admin edits it (the UI shows both states).
--
-- Membership does not require profiles.is_verified: removing someone's
-- verification must not break a group, so the lists show the current state.
--
-- p_group_id and p_note come last with DEFAULT NULL on purpose: the generated
-- Args type then lets the API pass null (src/lib/types/database.ts widens
-- only arguments that have a default), and a create simply omits p_group_id.

SET LOCAL search_path = public;
SET LOCAL lock_timeout = '10s';

DO $g$
BEGIN
  IF to_regprocedure('public.audit_row_change()') IS NULL
     OR to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'user_groups: audit_row_change() or set_updated_at() is missing'
      USING ERRCODE = '55000';
  END IF;
END $g$;

CREATE TABLE public.user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_groups_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT user_groups_note_check
    CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE TABLE public.user_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_group_members_group_user_key UNIQUE (group_id, user_id),
  CONSTRAINT user_group_members_role_check CHECK (role IN ('payer', 'member'))
);

CREATE UNIQUE INDEX user_group_members_one_payer_idx
  ON public.user_group_members (group_id) WHERE role = 'payer';
CREATE INDEX user_group_members_user_idx
  ON public.user_group_members (user_id);

CREATE TRIGGER set_user_groups_updated_at
  BEFORE UPDATE ON public.user_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_group_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_group_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_group_members TO service_role;

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.user_groups
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.user_group_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Create (p_group_id NULL) or edit a group: name, note, the payer and the
-- members, in one transaction. Errors are tokens in the message (the route
-- maps them): ADMIN_USER_GROUP_FORBIDDEN 42501, ADMIN_USER_GROUP_INVALID
-- 22023 (the HINT is one of the src/lib/user-groups.ts error codes),
-- ADMIN_USER_GROUP_UNKNOWN_USER P0002, ADMIN_USER_GROUP_NOT_FOUND P0002.
CREATE OR REPLACE FUNCTION public.admin_save_user_group(
  p_admin_id uuid,
  p_name text,
  p_payer_id uuid,
  p_member_ids uuid[],
  p_group_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_id uuid := p_group_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_members uuid[];
  v_all uuid[];
  v_found integer;
BEGIN
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) = 0 THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_INVALID' USING ERRCODE = '22023', HINT = 'name_required';
  END IF;
  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_INVALID' USING ERRCODE = '22023', HINT = 'name_too_long';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_INVALID' USING ERRCODE = '22023', HINT = 'note_too_long';
  END IF;
  IF p_payer_id IS NULL THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_INVALID' USING ERRCODE = '22023', HINT = 'payer_required';
  END IF;

  SELECT coalesce(array_agg(DISTINCT m), '{}')
    INTO v_members
    FROM unnest(coalesce(p_member_ids, '{}')) AS m
   WHERE m IS NOT NULL;
  IF p_payer_id = ANY (v_members) THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_INVALID' USING ERRCODE = '22023', HINT = 'payer_in_members';
  END IF;
  IF cardinality(v_members) = 0 THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_INVALID' USING ERRCODE = '22023', HINT = 'members_required';
  END IF;
  IF cardinality(v_members) > 100 THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_INVALID' USING ERRCODE = '22023', HINT = 'too_many_members';
  END IF;
  v_all := v_members || p_payer_id;

  -- Every person must exist. KEY SHARE keeps a profile from being deleted
  -- between this check and the member rows (an ordinary profile UPDATE is
  -- not blocked by it); the ids are distinct, so the counts must match.
  PERFORM 1 FROM public.profiles WHERE id = ANY (v_all) FOR KEY SHARE;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found <> cardinality(v_all) THEN
    RAISE EXCEPTION 'ADMIN_USER_GROUP_UNKNOWN_USER' USING ERRCODE = 'P0002';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.user_groups (name, note, created_by)
    VALUES (v_name, v_note, p_admin_id)
    RETURNING id INTO v_id;
  ELSE
    -- The row lock taken here serialises concurrent edits of one group
    -- (last writer wins) and makes a concurrent DELETE match no row.
    UPDATE public.user_groups
       SET name = v_name, note = v_note, updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADMIN_USER_GROUP_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Removed members first (an old payer who left needs no demotion), then
  -- demote a payer who stays as a member BEFORE promoting the new one: the
  -- one-payer index is checked per row and is not deferrable.
  DELETE FROM public.user_group_members
   WHERE group_id = v_id AND user_id <> ALL (v_all);
  UPDATE public.user_group_members
     SET role = 'member'
   WHERE group_id = v_id AND role = 'payer' AND user_id <> p_payer_id;
  INSERT INTO public.user_group_members AS m (group_id, user_id, role)
  SELECT v_id, u, CASE WHEN u = p_payer_id THEN 'payer' ELSE 'member' END
    FROM unnest(v_all) AS u
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET role = EXCLUDED.role WHERE m.role IS DISTINCT FROM EXCLUDED.role;

  RETURN jsonb_build_object('id', v_id);
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_save_user_group(uuid, text, uuid, uuid[], uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_user_group(uuid, text, uuid, uuid[], uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- DOWN (manual): DROP FUNCTION public.admin_save_user_group(uuid, text, uuid, uuid[], uuid, text);
--   DROP TABLE public.user_group_members, public.user_groups;
--   DELETE FROM supabase_migrations.schema_migrations WHERE name = 'user_groups';

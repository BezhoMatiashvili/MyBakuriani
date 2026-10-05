-- 20261005090000_signup_links.sql
--
-- Admin-generated sign-up links (contract C41). An admin creates a link
-- (https://<site>/join/<code>) and picks where it leads: the Smart Match
-- request form, a listing-creation form, or any internal page. Someone who
-- registers through the link lands on that page when the registration wizard
-- finishes, instead of on the home page.
--
-- The browser never reads or writes this table: the admin API, the /join
-- route and the wizard's resolve route all use the service role (C34). The
-- code reaches the wizard through a cookie set by /join and through the
-- sign-up's user_metadata (for a confirmation link opened in another browser),
-- so the destination is looked up again on the server, never trusted from the
-- client.
--
-- `code` has no dot: the middleware matcher skips dotted paths, so
-- /join/<code> would never reach the app. `destination` is an internal path;
-- src/lib/signup-links.ts:validateSignupLinkDestination is the full check
-- (no /auth, /api or /join, no protocol-relative path).

SET LOCAL search_path = public;

CREATE TABLE public.signup_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  destination text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_links_code_key UNIQUE (code),
  CONSTRAINT signup_links_code_check
    CHECK (code ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  CONSTRAINT signup_links_label_check
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT signup_links_destination_check
    CHECK (
      char_length(destination) <= 300
      AND destination LIKE '/%'
      AND destination NOT LIKE '//%'
    )
);

ALTER TABLE public.signup_links ENABLE ROW LEVEL SECURITY;

-- Service role only: no policy, no client grant.
REVOKE ALL ON public.signup_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_links TO service_role;

-- Create / deactivate history with the acting admin (x-actor-id).
CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.signup_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

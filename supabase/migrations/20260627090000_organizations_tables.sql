-- Organizations (companies): real-estate agencies & developers, agent membership,
-- and monthly subscriptions. Additive / non-destructive.
--
-- RLS uses the hardened repo conventions: auth wrapped as (select auth.uid()) /
-- (select public.is_admin_user()) for InitPlan caching. All WRITES to these tables
-- go exclusively through SECURITY DEFINER RPCs (see *_org_rpcs.sql), so there are
-- deliberately NO client INSERT/UPDATE/DELETE policies (mirrors `notifications`).

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_type text NOT NULL CHECK (org_type IN ('shps','sps','im','ks','ss','coop','aip')),
  legal_name text NOT NULL,
  identification_code text NOT NULL
    CHECK (identification_code ~ '^[0-9]{9}$' OR identification_code ~ '^[0-9]{11}$'),
  brand_name text NOT NULL,
  company_type text NOT NULL CHECK (company_type IN ('agency','developer')),
  logo_url text,
  cover_url text,
  phone text,
  website text,
  city text,
  address text,
  location_lat double precision,
  location_lng double precision,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected')),
  verified_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organizations_owner_idx ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON public.organizations(status);

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs public read active or owner" ON public.organizations;
CREATE POLICY "orgs public read active or owner" ON public.organizations
  FOR SELECT USING (status = 'active' OR owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "orgs admin all" ON public.organizations;
CREATE POLICY "orgs admin all" ON public.organizations
  FOR ALL USING ((select public.is_admin_user()))
  WITH CHECK ((select public.is_admin_user()));

-- ---------------------------------------------------------------------------
-- organization_members (agents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','agent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS org_members_user_idx ON public.organization_members(user_id, status);
CREATE INDEX IF NOT EXISTS org_members_org_idx ON public.organization_members(organization_id, status);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members self or owner read" ON public.organization_members;
CREATE POLICY "org_members self or owner read" ON public.organization_members
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_members.organization_id
        AND o.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "org_members admin all" ON public.organization_members;
CREATE POLICY "org_members admin all" ON public.organization_members
  FOR ALL USING ((select public.is_admin_user()))
  WITH CHECK ((select public.is_admin_user()));

-- ---------------------------------------------------------------------------
-- organization_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('entry','pro','premium')),
  listing_limit int,                      -- NULL = unlimited (premium)
  amount_gel numeric NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_subs_org_idx
  ON public.organization_subscriptions(organization_id, status, expires_at);

ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_subs owner read" ON public.organization_subscriptions;
CREATE POLICY "org_subs owner read" ON public.organization_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_subscriptions.organization_id
        AND o.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "org_subs admin all" ON public.organization_subscriptions;
CREATE POLICY "org_subs admin all" ON public.organization_subscriptions
  FOR ALL USING ((select public.is_admin_user()))
  WITH CHECK ((select public.is_admin_user()));

-- ---------------------------------------------------------------------------
-- properties.organization_id — a listing optionally posted on behalf of a company
-- ---------------------------------------------------------------------------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS properties_org_idx ON public.properties(organization_id);

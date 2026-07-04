"use client";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ScopeCompany {
  id: string;
  name: string;
  role: string; // "owner" | "agent"
  status: string;
}

interface ActiveOrgScopeValue {
  mode: "personal" | "org";
  organizationId: string | null;
  companies: ScopeCompany[];
  setActiveOrgId: (id: string | null) => void;
}

const ActiveOrgScopeContext = createContext<ActiveOrgScopeValue | null>(null);

export function ActiveOrgScopeProvider({
  companies,
  children,
}: {
  companies: ScopeCompany[];
  children: ReactNode;
}) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const value = useMemo<ActiveOrgScopeValue>(() => {
    const valid =
      organizationId && companies.some((c) => c.id === organizationId);
    return {
      mode: valid ? "org" : "personal",
      organizationId: valid ? organizationId : null,
      companies,
      setActiveOrgId: setOrganizationId,
    };
  }, [organizationId, companies]);
  return (
    <ActiveOrgScopeContext.Provider value={value}>
      {children}
    </ActiveOrgScopeContext.Provider>
  );
}

export function useActiveOrgScope(): ActiveOrgScopeValue {
  const ctx = useContext(ActiveOrgScopeContext);
  if (!ctx) {
    return {
      mode: "personal",
      organizationId: null,
      companies: [],
      setActiveOrgId: () => {},
    };
  }
  return ctx;
}

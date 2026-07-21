"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const ACTIVE_ORG_STORAGE_KEY = "mb-active-org";

/**
 * Last org scope chosen in the dashboard. Callers must validate the id against
 * the current user's own company list before using it, so a stale or foreign
 * id degrades to the personal scope.
 */
export function readStoredActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

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

  // Restore the last-chosen scope after mount (not in the useState initializer:
  // SSR renders "personal", and an initializer read would hydration-mismatch
  // the sidebar select).
  useEffect(() => {
    const stored = readStoredActiveOrgId();
    if (stored && companies.some((c) => c.id === stored)) {
      setOrganizationId(stored);
    }
    // companies is server-provided per session; run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<ActiveOrgScopeValue>(() => {
    const valid =
      organizationId && companies.some((c) => c.id === organizationId);
    return {
      mode: valid ? "org" : "personal",
      organizationId: valid ? organizationId : null,
      companies,
      setActiveOrgId: (id) => {
        setOrganizationId(id);
        try {
          if (id) window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id);
          else window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
        } catch {
          // localStorage unavailable (private mode) — scope just won't persist.
        }
      },
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

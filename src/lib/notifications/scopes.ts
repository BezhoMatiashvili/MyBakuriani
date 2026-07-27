/** Canonical cabinet keys persisted on notifications. NULL remains global-only. */
export const DASHBOARD_SCOPES = [
  "guest",
  "renter",
  "seller",
  "food",
  "cleaner",
  "employment",
  "transport",
  "entertainment",
  "services",
  "admin",
] as const;

export type DashboardScope = (typeof DASHBOARD_SCOPES)[number];
export type DashboardUnreadCounts = Partial<Record<DashboardScope, number>>;

/** Resolves dashboard URL segments, including legacy aliases, to stored scopes. */
export function dashboardScopeFromRoute(
  segment: string | null | undefined,
): DashboardScope | null {
  switch (segment) {
    case "guest":
    case "renter":
    case "seller":
    case "food":
    case "cleaner":
    case "employment":
    case "transport":
    case "entertainment":
    case "services":
    case "admin":
      return segment;
    // The SMS centre belongs to the rental-owner cabinet.
    case "sms":
      return "renter";
    // Legacy combined service dashboard and role alias.
    case "service":
    case "handyman":
      return "services";
    default:
      return null;
  }
}

export function dashboardScopeForPath(pathname: string | null | undefined) {
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const index = segments.indexOf("dashboard");
  return dashboardScopeFromRoute(index >= 0 ? segments[index + 1] : null);
}

/** Category mapping used by writers that notify an owner of a service listing. */
export function serviceCategoryToDashboardScope(
  category: string | null | undefined,
): DashboardScope {
  switch (category) {
    case "food":
      return "food";
    case "cleaning":
      return "cleaner";
    case "employment":
    case "transport":
    case "entertainment":
      return category;
    default:
      return "services";
  }
}

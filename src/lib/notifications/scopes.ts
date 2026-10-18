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

/**
 * Georgian cabinet names, for surfaces that cannot use next-intl (the email
 * renderer, SMS text). The in-app bell uses the `Navbar.scopeLabels` catalog
 * keys instead; both lists are the same ten cabinets plus the global notice.
 */
export const DASHBOARD_SCOPE_LABEL_KA: Record<DashboardScope, string> = {
  guest: "სტუმარი",
  renter: "ბინები (გაქირავება)",
  seller: "ბინები (გაყიდვა)",
  food: "კვება",
  cleaner: "დამლაგებელი",
  employment: "დასაქმება",
  transport: "ტრანსპორტი",
  entertainment: "გართობა",
  services: "სერვისები",
  admin: "ადმინი",
};

/**
 * Where a notification belongs. A bare `/dashboard` action_url redirects to the
 * viewer's PRIMARY role, which is the wrong cabinet for a multi-role user whose
 * notification belongs to another one; this resolves it from the stored scope.
 * Anything more specific than `/dashboard` is returned untouched.
 */
export function resolveNotificationPath(
  actionUrl: string | null | undefined,
  scope: string | null | undefined,
): string | null {
  if (!actionUrl) return null;
  const bare = actionUrl.replace(/\/+$/, "");
  if (bare === "/dashboard" && scope) {
    return (DASHBOARD_SCOPES as readonly string[]).includes(scope)
      ? `/dashboard/${scope}`
      : actionUrl;
  }
  return actionUrl;
}

/**
 * Key under `Navbar.scopeLabels` naming a notification's cabinet in the bell and
 * the aggregate inbox. A global (NULL-scope) notice, and any scope this build
 * does not know, reads "general".
 */
export function notificationScopeLabelKey(
  scope: string | null | undefined,
): DashboardScope | "general" {
  return (DASHBOARD_SCOPES as readonly string[]).includes(scope ?? "")
    ? (scope as DashboardScope)
    : "general";
}

/**
 * The popover shows only a handful of rows, so unread ones go first (each group
 * keeps its incoming newest-first order); an old unread notice the badge counts
 * must not hide behind newer, already-read ones.
 */
export function unreadFirst<T extends { is_read: boolean | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => Number(!!a.is_read) - Number(!!b.is_read));
}

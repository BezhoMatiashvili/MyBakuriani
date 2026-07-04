/**
 * Cabinet (dashboard) visibility helpers.
 *
 * A user only sees a cabinet in the space-switcher when it applies to them:
 * Guest (always) + their registered home-role cabinet + every cabinet where
 * they own at least one listing. Membership is derived from owned listings
 * because `profiles.role` is a single, DB-locked value and creating a listing
 * does not grant a role.
 */

export const CABINET_KEYS = [
  "guest",
  "renter",
  "seller",
  "food",
  "employment",
  "transport",
  "entertainment",
  "services",
  "cleaner",
] as const;

export type CabinetKey = (typeof CABINET_KEYS)[number];

/** Map a profile role to its home cabinet key. */
export function roleToCabinetKey(role: string | null | undefined): CabinetKey {
  switch (role) {
    case "renter":
      return "renter";
    case "seller":
      return "seller";
    case "cleaner":
      return "cleaner";
    case "food":
      return "food";
    case "employment":
      return "employment";
    case "transport":
      return "transport";
    case "entertainment":
      return "entertainment";
    case "handyman":
      return "services";
    default:
      return "guest";
  }
}

/**
 * Map a service listing category to its cabinet key. Each service category now
 * has its own cabinet; cleaning and food keep their dedicated dashboards.
 */
export function serviceCategoryToCabinetKey(category: string): CabinetKey {
  switch (category) {
    case "cleaning":
      return "cleaner";
    case "food":
      return "food";
    case "employment":
      return "employment";
    case "transport":
      return "transport";
    case "entertainment":
      return "entertainment";
    default:
      return "services";
  }
}

interface DeriveArgs {
  role: string | null | undefined;
  /** `is_for_sale` of each property owned by the user. */
  isForSaleFlags: boolean[];
  /** `category` of each service owned by the user. */
  serviceCategories: string[];
  /** Whether the user has any assigned cleaning tasks. */
  hasCleaningTasks: boolean;
  /** The user's approved organization memberships (any role). */
  organizations?: { role: string; status: string }[];
}

/**
 * Derive which cabinets to show in the switcher, returned in canonical order.
 */
export function deriveAvailableCabinets({
  role,
  isForSaleFlags,
  serviceCategories,
  hasCleaningTasks,
  organizations = [],
}: DeriveArgs): CabinetKey[] {
  const keys = new Set<CabinetKey>(["guest"]);
  keys.add(roleToCabinetKey(role));

  for (const isForSale of isForSaleFlags) {
    keys.add(isForSale ? "seller" : "renter");
  }
  for (const category of serviceCategories) {
    keys.add(serviceCategoryToCabinetKey(category));
  }
  if (hasCleaningTasks) {
    keys.add("cleaner");
  }
  if (organizations.length > 0) {
    keys.add("seller");
  }

  return CABINET_KEYS.filter((k) => keys.has(k));
}

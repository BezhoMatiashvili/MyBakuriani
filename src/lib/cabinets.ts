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
  "service",
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
    case "entertainment":
    case "transport":
    case "employment":
    case "handyman":
      return "service";
    default:
      return "guest";
  }
}

/** Map a service listing category to its cabinet key (food has its own cabinet). */
export function serviceCategoryToCabinetKey(category: string): CabinetKey {
  return category === "food" ? "food" : "service";
}

interface DeriveArgs {
  role: string | null | undefined;
  /** `is_for_sale` of each property owned by the user. */
  isForSaleFlags: boolean[];
  /** `category` of each service owned by the user. */
  serviceCategories: string[];
  /** Whether the user has any assigned cleaning tasks. */
  hasCleaningTasks: boolean;
}

/**
 * Derive which cabinets to show in the switcher, returned in canonical order.
 */
export function deriveAvailableCabinets({
  role,
  isForSaleFlags,
  serviceCategories,
  hasCleaningTasks,
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

  return CABINET_KEYS.filter((k) => keys.has(k));
}

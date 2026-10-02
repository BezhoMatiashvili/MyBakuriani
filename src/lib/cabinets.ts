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

const ROLE_HOME_PATH: Record<string, string> = {
  guest: "/dashboard/guest",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/entertainment",
  transport: "/dashboard/transport",
  employment: "/dashboard/employment",
  handyman: "/dashboard/services",
  admin: "/dashboard/admin",
};

/**
 * Where /dashboard sends a user of this role. The site navbars link there
 * directly once the profile is loaded, skipping the redirect's extra server
 * round trip (a full dashboard layout render).
 */
export function roleHomePath(role: string): string {
  return ROLE_HOME_PATH[role] ?? "/dashboard/guest";
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

/**
 * Cabinet a broadcast/package audience role resolves to, or null when the role
 * has no owned-data cabinet. `guest` is excluded on purpose (every user derives
 * the guest cabinet, so a guest-targeted notice stays role-only); `admin` and
 * unknown roles fall to the same default and stay role-only.
 */
export function audienceCabinetForRole(role: string): CabinetKey | null {
  const cabinet = roleToCabinetKey(role);
  return cabinet === "guest" ? null : cabinet;
}

/** Minimal ownership rows an audience is derived from (the layout RPC's inputs). */
export interface AudienceRows {
  /** Profiles whose `role` may match a targeted role directly. */
  profiles: { id: string; role: string | null }[];
  properties: { owner_id: string; is_for_sale: boolean | null }[];
  services: { owner_id: string; category: string }[];
  /** `cleaning_tasks.cleaner_id` of every assigned task. */
  cleaningTaskCleanerIds: string[];
  /** `organization_members.user_id` of every approved membership. */
  approvedMemberUserIds: string[];
}

/**
 * User ids a notice aimed at `targetRoles` reaches: users whose profile role is
 * targeted, plus users who derive a targeted role's cabinet from owned data.
 * The derived part runs through `deriveAvailableCabinets` (with no home role),
 * so it cannot drift from what the dashboard switcher shows.
 */
export function resolveAudience(
  targetRoles: readonly string[],
  rows: AudienceRows,
): Set<string> {
  const roles = new Set(targetRoles);
  const targetCabinets = new Set<CabinetKey>();
  for (const role of roles) {
    const cabinet = audienceCabinetForRole(role);
    if (cabinet) targetCabinets.add(cabinet);
  }

  const audience = new Set<string>();
  for (const p of rows.profiles) {
    if (p.role && roles.has(p.role)) audience.add(p.id);
  }
  if (targetCabinets.size === 0) return audience;

  const owned = new Map<
    string,
    {
      isForSaleFlags: boolean[];
      serviceCategories: string[];
      hasCleaningTasks: boolean;
      organizations: { role: string; status: string }[];
    }
  >();
  const entry = (id: string) => {
    let e = owned.get(id);
    if (!e) {
      e = {
        isForSaleFlags: [],
        serviceCategories: [],
        hasCleaningTasks: false,
        organizations: [],
      };
      owned.set(id, e);
    }
    return e;
  };
  for (const p of rows.properties) {
    entry(p.owner_id).isForSaleFlags.push(p.is_for_sale === true);
  }
  for (const s of rows.services) {
    entry(s.owner_id).serviceCategories.push(s.category);
  }
  for (const id of rows.cleaningTaskCleanerIds) {
    entry(id).hasCleaningTasks = true;
  }
  for (const id of rows.approvedMemberUserIds) {
    entry(id).organizations.push({ role: "member", status: "approved" });
  }

  for (const [id, e] of owned) {
    const cabinets = deriveAvailableCabinets({ role: null, ...e });
    if (cabinets.some((c) => targetCabinets.has(c))) audience.add(id);
  }
  return audience;
}

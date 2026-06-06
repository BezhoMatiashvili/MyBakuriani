// Helpers that map a dashboard listing to its public ("guest view") detail URL
// and to its create-form edit URL. Used by the dashboard ListingActions buttons.
//
// Properties live in the `properties` table (rentals + sales); services live in
// the `services` table, distinguished by `category`.

type PropertyLike = {
  id: string;
  is_for_sale?: boolean | null;
  type?: string | null;
};

type ServiceLike = {
  id: string;
  category: string;
};

/** Public guest-view route for a property listing. */
export function propertyViewUrl(p: PropertyLike): string {
  if (p.is_for_sale) return `/sales/${p.id}`;
  if (p.type === "hotel") return `/hotels/${p.id}`;
  return `/apartments/${p.id}`;
}

/** Create-form edit route for a property listing. */
export function propertyEditUrl(p: PropertyLike): string {
  const base = p.is_for_sale ? "/create/sale" : "/create/rental";
  return `${base}?edit=${p.id}`;
}

const SERVICE_VIEW_ROUTE: Record<string, string> = {
  entertainment: "/entertainment",
  transport: "/transport",
  employment: "/employment",
  food: "/food",
  handyman: "/services",
  cleaning: "/services",
};

const SERVICE_CREATE_FORM: Record<string, string> = {
  entertainment: "/create/entertainment",
  transport: "/create/transport",
  employment: "/create/employment",
  food: "/create/food",
  handyman: "/create/service",
  cleaning: "/create/service",
};

/** Public guest-view route for a service listing, based on its category. */
export function serviceViewUrl(s: ServiceLike): string {
  const base = SERVICE_VIEW_ROUTE[s.category] ?? "/services";
  return `${base}/${s.id}`;
}

/** Create-form edit route for a service listing, based on its category. */
export function serviceEditUrl(s: ServiceLike): string {
  const base = SERVICE_CREATE_FORM[s.category] ?? "/create/service";
  return `${base}?edit=${s.id}`;
}

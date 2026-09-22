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

type ViewUrlOptions = {
  /**
   * Owner/admin preview link. Appends `?preview=1`, which the middleware uses
   * (together with an auth cookie) to rewrite to the force-dynamic
   * /preview/<kind>/[id] route so pending listings stay viewable now that the
   * public detail routes are ISR. The param doubles as a distinct CDN cache
   * key, so a preview request always reaches the origin (a bare cookie check
   * in middleware would be skipped on a Cloudflare edge HIT).
   */
  preview?: boolean;
};

const previewSuffix = (opts?: ViewUrlOptions) =>
  opts?.preview ? "?preview=1" : "";

/** Public guest-view route for a property listing. */
export function propertyViewUrl(
  p: PropertyLike,
  opts?: ViewUrlOptions,
): string {
  const base = p.is_for_sale
    ? `/sales/${p.id}`
    : p.type === "hotel"
      ? `/hotels/${p.id}`
      : `/apartments/${p.id}`;
  return `${base}${previewSuffix(opts)}`;
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
export function serviceViewUrl(s: ServiceLike, opts?: ViewUrlOptions): string {
  const base = SERVICE_VIEW_ROUTE[s.category] ?? "/services";
  return `${base}/${s.id}${previewSuffix(opts)}`;
}

/** Create-form edit route for a service listing, based on its category. */
export function serviceEditUrl(s: ServiceLike): string {
  const base = SERVICE_CREATE_FORM[s.category] ?? "/create/service";
  return `${base}?edit=${s.id}`;
}

// ---------------------------------------------------------------------------
// Shared with the SEO/share layer. Both helpers below are deliberately pure and
// free of `@/` imports so `scripts/unit/*.test.mjs` can import this module
// directly under `node --test` type-stripping (see C29).
// ---------------------------------------------------------------------------

/**
 * Prefixes a locale-less path with its locale segment under
 * `localePrefix: "as-needed"` — the default locale (ka) has NO prefix, every
 * other locale does. `routing.defaultLocale` is passed in rather than imported
 * so this module stays alias-free.
 *
 * This rule previously existed only inline inside `buildListingMetadata`; it is
 * extracted here because the client-side share sheet must build exactly the
 * same canonical URL the crawler is served, or a shared link would redirect.
 */
export function localizedPath(
  path: string,
  locale: string,
  defaultLocale: string,
): string {
  return locale === defaultLocale ? path : `/${locale}${path}`;
}

/** Which listing table a public detail path reads from. */
export type OgCardKind = "property" | "service";

const OG_CARD_KIND_BY_SEGMENT: Record<string, OgCardKind> = {
  apartments: "property",
  hotels: "property",
  sales: "property",
  food: "service",
  services: "service",
  entertainment: "service",
  transport: "service",
  employment: "service",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Inverse of `propertyViewUrl` / `serviceViewUrl`: maps a public detail path
 * (`/apartments/<uuid>`) to the OG-card route's `{ kind, id }`.
 *
 * Returning `{kind,id}` from the path is what lets `buildListingMetadata` point
 * at the composed card with ZERO call-site changes across all 16 public +
 * preview routes — the `/preview/*` twins pass the public path too, so they
 * resolve identically.
 *
 * Non-listing paths (`/blog/<id>`) and mock/demo ids (non-UUID) return `null`,
 * which makes the caller fall back to the raw photos.
 */
export function ogCardTargetForPath(
  path: string,
): { kind: OgCardKind; id: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const kind = OG_CARD_KIND_BY_SEGMENT[parts[0]];
  if (!kind) return null;
  const id = parts[1];
  if (!UUID_RE.test(id)) return null;
  return { kind, id };
}

/** Absolute URL of the composed Open Graph card for a public detail path. */
export function ogCardUrlForPath(
  path: string,
  format?: "story",
): string | null {
  const target = ogCardTargetForPath(path);
  if (!target) return null;
  const suffix = format === "story" ? "?format=story" : "";
  return `/api/og/listing/${target.kind}/${target.id}${suffix}`;
}

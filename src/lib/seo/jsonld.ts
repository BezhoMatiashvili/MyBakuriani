// Structured-data builders (C40). Pure and self-contained (no `@/`, no sibling
// imports) so scripts/unit can test them (C29).
//
// Thin and honest on purpose: every field is a fact the page also shows, and
// absent facts are left out rather than guessed. Not emitted, deliberately:
// FAQPage and SearchAction (Google retired both), JobPosting (Georgia is not in
// Google Jobs' country list), VacationRental (invitation-only program),
// AggregateRating (no ratings are displayed), and any telephone number of a
// listing (it sits behind the reveal button).

export type JsonLdObject = Record<string, unknown>;

const CONTEXT = "https://schema.org";

/** Drops undefined, null, empty strings and empty arrays so absent facts stay absent. */
function compact(value: JsonLdObject): JsonLdObject {
  const out: JsonLdObject = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[key] = v;
  }
  return out;
}

/**
 * JSON for an inline <script type="application/ld+json">. A `<` could close the
 * tag early, and U+2028/U+2029 break script parsing in older engines.
 */
export function serializeJsonLd(
  data: JsonLdObject | readonly JsonLdObject[],
): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export interface BreadcrumbItem {
  name: string;
  /** Absolute URL. */
  url: string;
}

/** Must list exactly the trail the page shows (components/seo/Breadcrumbs.tsx). */
export function breadcrumbListJsonLd(
  items: readonly BreadcrumbItem[],
): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Organization + WebSite for a home page: what Google reads for the site name
 * and logo in results. `url` of the WebSite is the home page of THIS locale.
 */
export function siteJsonLd(input: {
  siteUrl: string;
  homeUrl: string;
  name: string;
  alternateNames?: readonly string[];
  inLanguage: string;
  logoUrl: string;
  /** Only a number/address the site itself publishes (the contact page). */
  telephone?: string;
  email?: string;
}): JsonLdObject {
  const organizationId = `${input.siteUrl}/#organization`;
  const hasContact = Boolean(input.telephone || input.email);
  return {
    "@context": CONTEXT,
    "@graph": [
      compact({
        "@type": "Organization",
        "@id": organizationId,
        name: input.name,
        url: `${input.siteUrl}/`,
        logo: { "@type": "ImageObject", url: input.logoUrl },
        contactPoint: hasContact
          ? compact({
              "@type": "ContactPoint",
              contactType: "customer support",
              telephone: input.telephone,
              email: input.email,
            })
          : undefined,
      }),
      compact({
        "@type": "WebSite",
        "@id": `${input.homeUrl}#website`,
        name: input.name,
        alternateName: input.alternateNames
          ? [...input.alternateNames]
          : undefined,
        url: input.homeUrl,
        inLanguage: input.inLanguage,
        publisher: { "@id": organizationId },
      }),
    ],
  };
}

export function blogPostingJsonLd(input: {
  url: string;
  headline: string;
  description?: string | null;
  images?: readonly string[];
  datePublished?: string | null;
  authorName?: string | null;
  inLanguage: string;
  publisherName: string;
  publisherLogoUrl: string;
}): JsonLdObject {
  return compact({
    "@context": CONTEXT,
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    headline: input.headline,
    description: input.description?.trim() || undefined,
    image: input.images ? [...input.images] : undefined,
    datePublished: input.datePublished ?? undefined,
    author: input.authorName
      ? { "@type": "Person", name: input.authorName }
      : { "@type": "Organization", name: input.publisherName },
    publisher: {
      "@type": "Organization",
      name: input.publisherName,
      logo: { "@type": "ImageObject", url: input.publisherLogoUrl },
    },
    inLanguage: input.inLanguage,
  });
}

/**
 * The resort itself, for the guide hub. Name, description and region are the
 * text the page prints; there is no pin because the page draws none.
 */
export function touristDestinationJsonLd(input: {
  url: string;
  name: string;
  description: string;
  /** Localized region, e.g. "Samtskhe-Javakheti". */
  region?: string | null;
  inLanguage: string;
}): JsonLdObject {
  return compact({
    "@context": CONTEXT,
    "@type": "TouristDestination",
    "@id": `${input.url}#destination`,
    name: input.name,
    description: input.description.trim(),
    url: input.url,
    inLanguage: input.inLanguage,
    containedInPlace: input.region
      ? { "@type": "AdministrativeArea", name: input.region }
      : undefined,
  });
}

interface PlaceInput {
  url: string;
  name: string;
  description?: string | null;
  images?: readonly string[];
  /** Localized place name of the resort, e.g. "Bakuriani". */
  locality: string;
  /** Only when the page shows the pin. */
  geo?: { lat: number; lng: number } | null;
}

function placeFields(input: PlaceInput): JsonLdObject {
  return {
    name: input.name,
    url: input.url,
    description: input.description?.trim() || undefined,
    image: input.images ? [...input.images] : undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: input.locality,
      addressCountry: "GE",
    },
    geo: input.geo
      ? {
          "@type": "GeoCoordinates",
          latitude: input.geo.lat,
          longitude: input.geo.lng,
        }
      : undefined,
  };
}

export function restaurantJsonLd(
  input: PlaceInput & {
    /** Localized cuisine label exactly as the page prints it. */
    servesCuisine?: string | null;
    menuUrl?: string | null;
  },
): JsonLdObject {
  return compact({
    "@context": CONTEXT,
    "@type": "Restaurant",
    ...placeFields(input),
    servesCuisine: input.servesCuisine ?? undefined,
    hasMenu: input.menuUrl ?? undefined,
  });
}

export function hotelJsonLd(
  input: PlaceInput & { starRating?: number | null },
): JsonLdObject {
  return compact({
    "@context": CONTEXT,
    "@type": "Hotel",
    ...placeFields(input),
    starRating:
      input.starRating && input.starRating > 0
        ? {
            "@type": "Rating",
            ratingValue: String(input.starRating),
            bestRating: "5",
          }
        : undefined,
  });
}

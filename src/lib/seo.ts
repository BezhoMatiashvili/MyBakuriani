import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { buildAlternates, pathForLocale } from "@/lib/seo/alternates";
import { sanitizePhotos } from "@/lib/utils/photos";
import { ogCardUrlForPath } from "@/lib/utils/listingUrls";

const SITE_NAME = "MyBakuriani";
/** Branded 1200x630 fallback in /public — used when a listing has no photos. */
const FALLBACK_OG_IMAGE = "/og-default.png";

/** Facebook's large-card format. The composed card is rendered at this size. */
const OG_CARD_WIDTH = 1200;
const OG_CARD_HEIGHT = 630;

/**
 * Facebook truncates around 300 chars and WhatsApp far sooner; listing
 * descriptions are raw, untruncated owner text and can run to thousands of
 * characters, which bloats the head of every detail page for no benefit.
 */
const MAX_OG_DESCRIPTION = 200;

/**
 * Open Graph wants a language_TERRITORY tag, not a bare language code — a bare
 * `ka` is silently ignored by some consumers.
 */
const OG_LOCALE: Record<AppLocale, string> = {
  ka: "ka_GE",
  en: "en_US",
  ru: "ru_RU",
};

/** Google shows roughly this much of a meta description. */
export const META_DESCRIPTION_MAX = 155;

/** og:locale:alternate values: every locale except the page's own. */
function alternateOgLocales(locale: AppLocale): string[] {
  return routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]);
}

/** Clamps on a word boundary and appends an ellipsis only if it actually cut. */
export function clampDescription(
  value: string,
  max = MAX_OG_DESCRIPTION,
): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  // Georgian has no different word-break rules here, but a long unbroken token
  // (a URL, a phone number) would leave lastSpace at -1 — fall back to a hard cut.
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

interface BuildListingMetadataOptions {
  locale: AppLocale;
  /** Already-translated page title. */
  title: string;
  /** Already-resolved description. */
  description: string;
  /** Listing photos, first entry = cover. Nullable/empty entries are dropped. */
  images: (string | null | undefined)[];
  /** Locale-less path, e.g. `/sales/${id}`. */
  path: string;
  type?: "website" | "article";
}

/**
 * Builds the Open Graph + Twitter Card + canonical slice of a Next.js Metadata
 * object so a shared listing link "unfurls" into a rich card (cover photo +
 * title + description) on Facebook, WhatsApp, Telegram, X, etc. Relative URLs
 * are resolved to absolute via the root layout's `metadataBase`.
 */
export function buildListingMetadata(
  opts: BuildListingMetadataOptions,
): Pick<Metadata, "description" | "openGraph" | "twitter" | "alternates"> {
  // sanitizePhotos drops empty/base64/oversized entries so og:image never
  // embeds a multi-MB data URL (which would bloat the SSR response).
  const photos = sanitizePhotos(opts.images).slice(0, 4);

  // The composed 1200x630 card. Raw owner uploads are arbitrary aspect ratio
  // (measured in the wild: 1508x923 = 1.63, not the 1.91 Facebook wants) and up
  // to 5 MB, which crops badly and often yields no WhatsApp thumbnail at all.
  // The card fixes both, and carrying explicit width/height means Facebook can
  // pick the large-card layout immediately instead of rendering the FIRST share
  // imageless while it fetches the image to measure it.
  const cardUrl = ogCardUrlForPath(opts.path);

  const photoEntries = photos.length ? photos : [FALLBACK_OG_IMAGE];
  // Order matters: WhatsApp and Telegram use only the FIRST og:image, so the
  // composed card must lead. The raw photos are kept behind it because the
  // Facebook composer lets the sharer pick among the alternatives.
  const ogImages = cardUrl
    ? [
        {
          url: cardUrl,
          width: OG_CARD_WIDTH,
          height: OG_CARD_HEIGHT,
          alt: opts.title,
          type: "image/jpeg",
        },
        ...photoEntries,
      ]
    : photoEntries;

  const description = clampDescription(opts.description);

  // canonical + hreflang come from the one function the sitemap uses too, so
  // the HTML and the sitemap name byte-identical URLs (C40).
  const { canonical: url, languages } = buildAlternates({
    path: opts.path,
    locale: opts.locale,
    locales: routing.locales,
    defaultLocale: routing.defaultLocale,
  });

  return {
    // Shorter than the OG description: the raw owner text can run to thousands
    // of characters. Callers spread this after their own `description`.
    description: clampDescription(opts.description, META_DESCRIPTION_MAX),
    alternates: { canonical: url, languages },
    // Cast: the literal openGraph object is well-formed, but TS cannot narrow
    // the discriminated `type` union from a `"website" | "article"` value.
    openGraph: {
      type: opts.type ?? "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE[opts.locale] ?? opts.locale,
      alternateLocale: alternateOgLocales(opts.locale),
      title: opts.title,
      description,
      url,
      images: ogImages,
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description,
      images: ogImages,
    },
  };
}

/**
 * A listing has exactly one canonical URL: the route of its kind
 * (propertyViewUrl / serviceViewUrl). The detail routes resolve any id, so one
 * listing used to answer 200 under /apartments, /hotels and /sales (or under
 * five service routes), each copy self-canonical. A request on the wrong kind
 * now 308s to the right one (C40). Never returns when it redirects.
 */
export function redirectToCanonicalListing(
  requestPath: string,
  canonicalPath: string,
  locale: AppLocale,
): void {
  if (requestPath === canonicalPath) return;
  permanentRedirect(
    pathForLocale(canonicalPath, locale, routing.defaultLocale),
  );
}

interface BuildPageMetadataOptions {
  locale: AppLocale;
  /** Locale-less path, e.g. `/apartments`; `/` for the home page. */
  path: string;
  /** Already-translated, complete title (it carries its own "— MyBakuriani"). */
  title: string;
  description: string;
  type?: "website" | "article";
  /** Keeps the page out of the index but lets crawlers follow its links. */
  noindex?: boolean;
}

/**
 * Title, description, canonical, hreflang, Open Graph and Twitter for the
 * public index and static pages (C40); detail pages use buildListingMetadata,
 * which adds their photo card. A page's `openGraph` object REPLACES the root
 * layout's rather than merging with it, so the locale has to be set here.
 */
export function buildPageMetadata(opts: BuildPageMetadataOptions): Metadata {
  const { canonical, languages } = buildAlternates({
    path: opts.path,
    locale: opts.locale,
    locales: routing.locales,
    defaultLocale: routing.defaultLocale,
  });
  const description = clampDescription(opts.description, META_DESCRIPTION_MAX);
  const images = [
    {
      url: FALLBACK_OG_IMAGE,
      width: OG_CARD_WIDTH,
      height: OG_CARD_HEIGHT,
      alt: SITE_NAME,
    },
  ];

  return {
    title: opts.title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: opts.type ?? "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE[opts.locale],
      alternateLocale: alternateOgLocales(opts.locale),
      title: opts.title,
      description,
      url: canonical,
      images,
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description,
      images,
    },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

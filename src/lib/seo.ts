import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import { sanitizePhotos } from "@/lib/utils/photos";

const SITE_NAME = "MyBakuriani";
/** Branded 1200x630 fallback in /public — used when a listing has no photos. */
const FALLBACK_OG_IMAGE = "/og-default.png";

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
): Pick<Metadata, "openGraph" | "twitter" | "alternates"> {
  // sanitizePhotos drops empty/base64/oversized entries so og:image never
  // embeds a multi-MB data URL (which would bloat the SSR response).
  const images = sanitizePhotos(opts.images).slice(0, 4);
  // Multiple og:image entries: WhatsApp/Telegram use the first (cover); the
  // Facebook composer lets the sharer pick among the rest.
  const ogImages = images.length ? images : [FALLBACK_OG_IMAGE];

  // localePrefix is "as-needed": the default locale (ka) has no path prefix.
  const prefix = opts.locale === routing.defaultLocale ? "" : `/${opts.locale}`;
  const url = `${prefix}${opts.path}`;

  return {
    alternates: { canonical: url },
    // Cast: the literal openGraph object is well-formed, but TS cannot narrow
    // the discriminated `type` union from a `"website" | "article"` value.
    openGraph: {
      type: opts.type ?? "website",
      siteName: SITE_NAME,
      locale: opts.locale,
      title: opts.title,
      description: opts.description,
      url,
      images: ogImages,
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: ogImages,
    },
  };
}

import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { GUIDE_PATHS } from "@/lib/guide";
import { createPublicClient } from "@/lib/supabase/server";
import { buildAlternates } from "@/lib/seo/alternates";
import { IS_INDEXABLE, SITE_URL, isSiteLocked } from "@/lib/seo/site";
import { optimizedImageUrls } from "@/lib/seo/image-url";
import {
  buildSitemapEntries,
  isSeedListingId,
  type SitemapPage,
} from "@/lib/seo/sitemap";
import { propertyViewUrl, serviceViewUrl } from "@/lib/utils/listingUrls";
import { sanitizePhotos } from "@/lib/utils/photos";

// Root-level for the same reason as `robots.ts` next to it: without an
// explicit route here, /sitemap.xml falls through to the `[locale]`
// catch-all and crashes the same way (static-to-dynamic error from
// next-intl's requestLocale reading headers()).

// Rebuilt at most hourly. Reads use the cookie-free anon client, like the ISR
// detail pages (C28).
export const revalidate = 3600;

// Every indexable page that is not a database row. /search and /sales/all are
// left out on purpose (noindex); everything behind login is in robots.ts.
const STATIC_PATHS = [
  "/",
  "/apartments",
  "/hotels",
  "/sales",
  "/food",
  "/services",
  "/entertainment",
  "/transport",
  "/employment",
  "/blog",
  ...GUIDE_PATHS,
  "/faq",
  "/pricing",
  "/contact",
  "/terms",
  "/privacy",
  "/marketing-policy",
];

// PostgREST answers at most 1000 rows per request and cuts a longer range
// silently, so every table is read page by page.
const PAGE_SIZE = 1000;

async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

async function loadRowPages(): Promise<SitemapPage[]> {
  const supabase = createPublicClient();
  const [properties, services, posts] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("public_properties")
        .select("id, type, is_for_sale, photos")
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("public_services")
        .select("id, category, photos")
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("blog_posts")
        .select("slug, published_at, image_url")
        .eq("published", true)
        .order("slug")
        .range(from, to),
    ),
  ]);

  const pages: SitemapPage[] = [];
  for (const p of properties) {
    if (!p.id || isSeedListingId(p.id)) continue;
    pages.push({
      // The detail pages 308 to this same URL (propertyViewUrl), so the
      // sitemap only ever lists the canonical one.
      path: propertyViewUrl({
        id: p.id,
        type: p.type,
        is_for_sale: p.is_for_sale,
      }),
      images: optimizedImageUrls(SITE_URL, sanitizePhotos(p.photos)),
    });
  }
  for (const s of services) {
    if (!s.id || !s.category || isSeedListingId(s.id)) continue;
    pages.push({
      path: serviceViewUrl({ id: s.id, category: s.category }),
      images: optimizedImageUrls(SITE_URL, sanitizePhotos(s.photos)),
    });
  }
  for (const post of posts) {
    if (!post.slug) continue;
    pages.push({
      path: `/blog/${post.slug}`,
      lastModified: post.published_at ? new Date(post.published_at) : null,
      images: optimizedImageUrls(SITE_URL, sanitizePhotos([post.image_url])),
    });
  }
  return pages;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Staging, previews and local builds are noindex; a sitemap there would only
  // advertise URLs that tell Google to ignore them.
  if (!IS_INDEXABLE) return [];
  // A locked deployment (SITE_LOCKED, C27) sends every page to /site-locked, so
  // its sitemap would list URLs that redirect and publish every listing of a
  // site that has not launched. It fills in on the first rebuild after unlock.
  if (isSiteLocked(process.env.SITE_LOCKED)) return [];

  let rowPages: SitemapPage[] = [];
  try {
    rowPages = await loadRowPages();
  } catch (err) {
    // The static pages still go out; the next hourly rebuild retries.
    console.error("[sitemap] reading listings and posts failed", err);
  }

  return buildSitemapEntries({
    siteUrl: SITE_URL,
    locales: routing.locales,
    alternatesFor: (path, locale) =>
      buildAlternates({
        path,
        locale,
        locales: routing.locales,
        defaultLocale: routing.defaultLocale,
      }),
    pages: [...STATIC_PATHS.map((path) => ({ path })), ...rowPages],
  });
}

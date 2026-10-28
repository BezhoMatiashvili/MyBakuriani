import { NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { createPublicClient } from "@/lib/supabase/server";
import {
  localizedPath,
  parseShortLinkCode,
  propertyViewUrl,
  serviceViewUrl,
  shortLinkIdRange,
} from "@/lib/utils/listingUrls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same origin rule as /join/[code]: request.url is the container's internal
// address behind DigitalOcean's proxy.
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app";

/**
 * A short share link (C58). A code that names exactly one public listing
 * answers a 301 to that listing's page, so Facebook, WhatsApp and Viber unfurl
 * the page's own card (photo, name, price). An unknown, ambiguous or no longer
 * public code goes to the home page, uncached, so a pending listing's link
 * starts working the moment it is approved. A failed read is a 503, never a
 * redirect home that a crawler would keep as the link's preview.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; code: string }> },
) {
  const { locale: rawLocale, code: rawCode } = await params;
  const locale = hasLocale(routing.locales, rawLocale)
    ? rawLocale
    : routing.defaultLocale;
  const code = parseShortLinkCode(rawCode);

  let path: string | null = null;
  if (code) {
    try {
      path = await publicListingPath(code);
    } catch {
      return new NextResponse(null, {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      });
    }
  }

  if (!path) {
    const home = locale === routing.defaultLocale ? "/" : `/${locale}`;
    const response = NextResponse.redirect(siteUrl(home, request), 307);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const response = NextResponse.redirect(
    siteUrl(localizedPath(path, locale, routing.defaultLocale), request),
    301,
  );
  // A code keeps naming the same listing; if the listing changes kind, its
  // old page 308s to the new route (C40).
  response.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return response;
}

/**
 * `path` on this site with the short link's query, as the long URL would have
 * had it: Facebook appends fbclid to every outbound click and campaigns add
 * utm_*, which the landing page view reads (PageviewTracker). `preview` never
 * travels: middleware turns it into the owner's preview (C28), and a shared
 * link is never that.
 */
function siteUrl(path: string, request: Request): URL {
  const url = new URL(path, SITE_ORIGIN);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key !== "preview") url.searchParams.append(key, value);
  }
  return url;
}

/** The page of the one public listing whose id starts with `code`, or null. */
async function publicListingPath(code: string): Promise<string | null> {
  const { from, to } = shortLinkIdRange(code);
  const supabase = createPublicClient();
  // Public views only (C31): a pending or hidden listing does not resolve.
  const [properties, services] = await Promise.all([
    supabase
      .from("public_properties")
      .select("id, is_for_sale, type")
      .gte("id", from)
      .lte("id", to)
      .limit(2),
    supabase
      .from("public_services")
      .select("id, category")
      .gte("id", from)
      .lte("id", to)
      .limit(2),
  ]);
  if (properties.error) throw properties.error;
  if (services.error) throw services.error;

  const paths: string[] = [];
  for (const p of properties.data) {
    if (p.id) {
      paths.push(
        propertyViewUrl({ id: p.id, is_for_sale: p.is_for_sale, type: p.type }),
      );
    }
  }
  for (const s of services.data) {
    if (s.id && s.category) {
      paths.push(serviceViewUrl({ id: s.id, category: s.category }));
    }
  }
  return paths.length === 1 ? paths[0] : null;
}

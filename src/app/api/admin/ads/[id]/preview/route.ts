import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { adRowToCreative } from "@/lib/banner-creative";
import { getPlacementSpec } from "@/lib/banner-placements";
import { adPreviewHash, previewPathForSurface } from "@/lib/ad-preview";
import { propertyViewUrl } from "@/lib/utils/listingUrls";
import { pathForLocale } from "@/lib/seo/alternates";
import { routing } from "@/i18n/routing";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" };

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, headers });
}

/**
 * The admin's on-site preview of one ad (C47, 2026-10-11): the ad as the
 * public renderer draws it, whatever its status or dates (so a paused,
 * scheduled or just-saved ad can be checked in place), and the public page
 * that shows its placement. `?open=1` redirects straight to that page with
 * `#mb-ad-preview=<id>`, so the ad card's button is a plain new-tab link that
 * no popup blocker stops; src/lib/ad-preview-client.ts reads the JSON.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return noStore(guard.response);

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }

  const db = createServiceClient();
  const { data: row, error } = await db
    .from("ads")
    .select(
      "id, placement, position, title, url, banner_url, start_at, end_at, created_at, sov_percent, priority, frequency_cap_per_day",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.json(
      { error: "load_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
  const creative = row ? adRowToCreative(row) : null;
  if (!creative) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }

  // The page that mounts the placement. A detail or blog placement needs a
  // real row: the newest public rental, the newest published post.
  const surface = getPlacementSpec(creative.placement)?.surface;
  let path: string = previewPathForSurface(surface) ?? "/";
  if (surface === "detail") {
    const { data: listing } = await db
      .from("public_properties")
      .select("id, type, is_for_sale")
      .not("is_for_sale", "is", true)
      .neq("type", "hotel")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    path = listing ? propertyViewUrl(listing) : "/apartments";
  } else if (surface === "blog") {
    const { data: post } = await db
      .from("blog_posts")
      .select("slug")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    path = post?.slug ? `/blog/${encodeURIComponent(post.slug)}` : "/blog";
  }

  const url = new URL(req.url);
  if (url.searchParams.get("open") === "1") {
    const requested = url.searchParams.get("locale") ?? "";
    const locale = (routing.locales as readonly string[]).includes(requested)
      ? requested
      : routing.defaultLocale;
    return new Response(null, {
      status: 307,
      headers: {
        ...NO_STORE,
        Location:
          pathForLocale(path, locale, routing.defaultLocale) +
          adPreviewHash(creative.sourceId),
      },
    });
  }

  return Response.json({ creative, path }, { headers: NO_STORE });
}

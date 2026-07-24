import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBannerKind } from "@/lib/banners";
import { withRetry } from "@/lib/with-timeout";
import { safeHttpsUrl, safeInternalPath } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");

  const db = createServiceClient();
  let query = db
    .from("landing_banners")
    .select(
      "id, kind, title, body, cta_label, cta_href, image_url, video_url, video_poster_url, tone, sort_order, start_at, end_at",
    )
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (kindParam) {
    if (!isBannerKind(kindParam)) {
      return Response.json({ error: "invalid kind" }, { status: 400 });
    }
    query = query.eq("kind", kindParam);
  }

  const { data, error } = await withRetry(() => query);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const banners = (data ?? []).flatMap((b) => {
    const startOk = !b.start_at || new Date(b.start_at).getTime() <= now;
    const endOk = !b.end_at || new Date(b.end_at).getTime() >= now;
    if (!startOk || !endOk) return [];
    return [{
      ...b,
      cta_href: safeInternalPath(b.cta_href) ?? safeHttpsUrl(b.cta_href),
      image_url: safeHttpsUrl(b.image_url),
      video_url: safeHttpsUrl(b.video_url),
      video_poster_url: safeHttpsUrl(b.video_poster_url),
    }];
  });

  return Response.json(
    { banners },
    {
      // Public, non-user-specific config. Cache at the CDN so anon page loads
      // are served from the edge instead of invoking the function + DB every
      // time. The route reads ?kind, so it's dynamic; s-maxage caches per-URL.
      // Worst-case staleness for a scheduled banner ≈ 60s.
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

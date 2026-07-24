import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import type { BannerKind, LandingBanner } from "@/lib/banners";
import { safeHttpsUrl, safeInternalPath } from "@/lib/security";

export const fetchActiveBanners = cache(
  async (kind?: BannerKind): Promise<LandingBanner[]> => {
    const db = createServiceClient();
    let query = db
      .from("landing_banners")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (kind) query = query.eq("kind", kind);

    const { data, error } = await query;
    if (error || !data) return [];

    const now = Date.now();
    return (data as unknown as LandingBanner[]).flatMap((b) => {
      const startOk = !b.start_at || new Date(b.start_at).getTime() <= now;
      const endOk = !b.end_at || new Date(b.end_at).getTime() >= now;
      if (!startOk || !endOk) return [];
      // Stored rows predate URL validation. Never hand an unsafe legacy value
      // to a public renderer.
      return [
        {
          ...b,
          cta_href:
            safeInternalPath(b.cta_href) ?? safeHttpsUrl(b.cta_href),
          image_url: safeHttpsUrl(b.image_url),
          video_url: safeHttpsUrl(b.video_url),
          video_poster_url: safeHttpsUrl(b.video_poster_url),
        },
      ];
    });
  },
);

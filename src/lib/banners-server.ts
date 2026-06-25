import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import type { BannerKind, LandingBanner } from "@/lib/banners";

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
    return (data as unknown as LandingBanner[]).filter((b) => {
      const startOk = !b.start_at || new Date(b.start_at).getTime() <= now;
      const endOk = !b.end_at || new Date(b.end_at).getTime() >= now;
      return startOk && endOk;
    });
  },
);

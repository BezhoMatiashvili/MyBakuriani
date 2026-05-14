import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBannerKind } from "@/lib/banners";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");

  const db = createServiceClient();
  let query = db
    .from("landing_banners")
    .select(
      "id, kind, title, body, cta_label, cta_href, image_url, tone, sort_order, start_at, end_at",
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

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const banners = (data ?? []).filter((b) => {
    const startOk = !b.start_at || new Date(b.start_at).getTime() <= now;
    const endOk = !b.end_at || new Date(b.end_at).getTime() >= now;
    return startOk && endOk;
  });

  return Response.json({ banners });
}

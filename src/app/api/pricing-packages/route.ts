import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set([
  "sms",
  "vip",
  "verification",
  "ad",
  "subscription",
]);

// Public, non-user-specific pricing. Cache at the CDN so repeat anon loads are
// served from the edge instead of invoking the function + DB. The route reads
// ?categories, so it's dynamic; s-maxage caches per-URL. Worst-case staleness
// after a pricing edit ≈ 60s.
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const categoriesParam = url.searchParams.get("categories");

  const db = createServiceClient();
  let query = db
    .from("pricing_packages")
    .select(
      "id, category, code, name, label, description, amount_gel, meta, sort_order",
    )
    .eq("is_enabled", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  if (categoriesParam) {
    const requested = categoriesParam
      .split(",")
      .map((c) => c.trim())
      .filter((c) => VALID_CATEGORIES.has(c));
    if (requested.length === 0) {
      return Response.json({ packages: [] }, { headers: CACHE_HEADERS });
    }
    query = query.in("category", requested);
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/pricing-packages failed", error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
  return Response.json({ packages: data ?? [] }, { headers: CACHE_HEADERS });
}

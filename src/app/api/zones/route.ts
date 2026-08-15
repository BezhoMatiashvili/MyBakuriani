import { createPublicClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/with-timeout";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const db = createPublicClient();
    const { data, error } = await withRetry(() =>
      db
        .from("zones")
        .select(
          "id, slug, name_ka, description_ka, lat, lng, icon, sort_order, is_active",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    );
    if (error) {
      console.error("GET /api/zones failed", error);
      return Response.json({ error: "server_error" }, { status: 500 });
    }
    return Response.json(
      { zones: data ?? [] },
      {
        // Let browsers/CDN reuse the response instead of re-fetching on
        // every page mount. Worst-case staleness for a client that cached
        // just before an edit: max-age + swr ≈ 2 minutes.
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/zones failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

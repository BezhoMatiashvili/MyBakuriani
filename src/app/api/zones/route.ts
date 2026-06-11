import { createPublicClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const db = createPublicClient();
    const { data, error } = await db
      .from("zones")
      .select(
        "id, slug, name_ka, description_ka, lat, lng, icon, sort_order, is_active",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json(
      { zones: data ?? [] },
      {
        // Let browsers/CDN reuse the response instead of re-fetching on
        // every page mount; zone edits surface within ~2 minutes.
        headers: {
          "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/zones failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

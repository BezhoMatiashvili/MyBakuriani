import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isUuid(id) || (kind !== "property" && kind !== "service")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;

  // Must be the user-scoped client, not createServiceClient(): listing_analytics()
  // checks the caller against the listing's owner_id via auth.uid(), which only
  // resolves when the RPC runs under the caller's own JWT. A service-role call
  // would make auth.uid() NULL and reject every legitimate request.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("listing_analytics", {
    p_listing_type: kind,
    p_listing_id: id,
    p_days: days,
  });

  if (error) {
    if (error.code === "42501") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("listing_analytics failed", { kind, id, code: error.code });
    return Response.json({ error: "lookup_failed" }, { status: 500 });
  }
  return Response.json(data);
}

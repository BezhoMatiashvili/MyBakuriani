import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Toggles profiles.is_verified. There is no "block/ban" column — this is the
// only thing the client-detail page's verification toggle has ever done.
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    is_verified?: boolean;
  } | null;
  if (typeof body?.is_verified !== "boolean") {
    return Response.json(
      { error: "is_verified must be boolean" },
      { status: 400 },
    );
  }

  const db = createServiceClient(guard.admin.userId);
  const { error } = await db
    .from("profiles")
    .update({ is_verified: body.is_verified })
    .eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, is_verified: body.is_verified });
}

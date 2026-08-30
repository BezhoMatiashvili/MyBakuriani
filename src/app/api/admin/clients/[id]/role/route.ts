import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Enums } from "@/lib/types/database";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// "admin" is deliberately excluded — granting admin access must never be a
// one-field update reachable from this picker.
const ASSIGNABLE_ROLES: Enums<"user_role">[] = [
  "guest",
  "renter",
  "seller",
  "cleaner",
  "food",
  "entertainment",
  "transport",
  "employment",
  "handyman",
];

export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    role?: string;
  } | null;

  if (body?.role === "admin") {
    return Response.json(
      { error: "cannot_assign_admin_role" },
      { status: 400 },
    );
  }
  if (
    !body?.role ||
    !ASSIGNABLE_ROLES.includes(body.role as Enums<"user_role">)
  ) {
    return Response.json({ error: "invalid_role" }, { status: 400 });
  }

  const db = createServiceClient(guard.admin.userId);
  const { error } = await db
    .from("profiles")
    .update({ role: body.role as Enums<"user_role"> })
    .eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, role: body.role });
}

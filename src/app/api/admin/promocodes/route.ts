import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();
  const { data, error } = await db
    .from("promocodes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ codes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    discount_type?: "percent" | "fixed";
    discount_value?: number;
    max_uses?: number;
    expires_at?: string;
  } | null;
  if (
    !body?.code ||
    !body.discount_type ||
    typeof body.discount_value !== "number" ||
    body.discount_value <= 0
  ) {
    return Response.json(
      { error: "code, discount_type, discount_value (>0) required" },
      { status: 400 },
    );
  }
  const db = createServiceClient();
  const { data, error } = await db
    .from("promocodes")
    .insert({
      code: body.code.toUpperCase().trim(),
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      max_uses: body.max_uses ?? null,
      expires_at: body.expires_at ?? null,
      created_by: guard.admin.userId,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ code: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = createServiceClient();
  const { error } = await db
    .from("promocodes")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

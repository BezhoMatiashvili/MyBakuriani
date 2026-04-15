import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const db = createServiceClient();
    const { data, error } = await db
      .from("pricing_packages")
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ packages: data ?? [] });
  } catch (error) {
    console.error("GET /api/admin/pricing-packages failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const body = (await req.json().catch(() => null)) as {
      id?: string;
      amount_gel?: number;
      is_enabled?: boolean;
    } | null;
    if (!body?.id)
      return Response.json({ error: "id required" }, { status: 400 });

    const patch: {
      amount_gel?: number;
      is_enabled?: boolean;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (typeof body.amount_gel === "number" && body.amount_gel >= 0) {
      patch.amount_gel = body.amount_gel;
    }
    if (typeof body.is_enabled === "boolean") {
      patch.is_enabled = body.is_enabled;
    }
    if (patch.amount_gel === undefined && patch.is_enabled === undefined) {
      return Response.json(
        { error: "amount_gel or is_enabled required" },
        { status: 400 },
      );
    }

    const db = createServiceClient();
    const { error } = await db
      .from("pricing_packages")
      .update(patch)
      .eq("id", body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/admin/pricing-packages failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const body = (await req.json().catch(() => null)) as {
      category?: string;
      code?: string;
      name?: string;
      label?: string | null;
      amount_gel?: number;
    } | null;
    if (
      !body?.category ||
      !body.code ||
      !body.name ||
      typeof body.amount_gel !== "number"
    ) {
      return Response.json(
        { error: "category, code, name, amount_gel required" },
        { status: 400 },
      );
    }
    const db = createServiceClient();
    const { data, error } = await db
      .from("pricing_packages")
      .insert({
        category: body.category,
        code: body.code,
        name: body.name,
        label: body.label ?? null,
        amount_gel: body.amount_gel,
        is_enabled: true,
      })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ package: data });
  } catch (error) {
    console.error("POST /api/admin/pricing-packages failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

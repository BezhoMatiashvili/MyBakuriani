import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

type PricingPackageUpdate =
  Database["public"]["Tables"]["pricing_packages"]["Update"];
type PricingPackageInsert =
  Database["public"]["Tables"]["pricing_packages"]["Insert"];
type Meta = Database["public"]["Tables"]["pricing_packages"]["Row"]["meta"];

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set([
  "sms",
  "vip",
  "verification",
  "ad",
  "subscription",
]);

function slugifyCode(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : `pkg-${suffix}`;
}

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
      name?: string;
      label?: string | null;
      description?: string | null;
      meta?: Record<string, unknown>;
      sort_order?: number;
    } | null;
    if (!body?.id)
      return Response.json({ error: "id required" }, { status: 400 });

    const patch: PricingPackageUpdate = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.amount_gel === "number" && body.amount_gel >= 0) {
      patch.amount_gel = body.amount_gel;
    }
    if (typeof body.is_enabled === "boolean") {
      patch.is_enabled = body.is_enabled;
    }
    if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (body.label !== undefined) {
      patch.label =
        typeof body.label === "string" ? body.label.trim() || null : null;
    }
    if (body.description !== undefined) {
      patch.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }
    if (body.meta && typeof body.meta === "object") {
      patch.meta = body.meta as Meta;
    }
    if (typeof body.sort_order === "number") {
      patch.sort_order = Math.trunc(body.sort_order);
    }

    const hasMutableField = Object.keys(patch).some((k) => k !== "updated_at");
    if (!hasMutableField) {
      return Response.json(
        { error: "no updatable fields provided" },
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
      description?: string | null;
      amount_gel?: number;
      meta?: Record<string, unknown>;
      sort_order?: number;
    } | null;

    if (!body?.category || !VALID_CATEGORIES.has(body.category)) {
      return Response.json(
        {
          error:
            "category must be one of sms, vip, verification, ad, subscription",
        },
        { status: 400 },
      );
    }
    if (!body.name || !body.name.trim()) {
      return Response.json({ error: "name required" }, { status: 400 });
    }
    if (typeof body.amount_gel !== "number" || body.amount_gel < 0) {
      return Response.json(
        { error: "amount_gel must be a non-negative number" },
        { status: 400 },
      );
    }

    const code =
      body.code && body.code.trim()
        ? body.code.trim().toLowerCase()
        : slugifyCode(body.name);

    const insert: PricingPackageInsert = {
      category: body.category,
      code,
      name: body.name.trim(),
      label: body.label?.trim() || null,
      description: body.description?.trim() || null,
      amount_gel: body.amount_gel,
      meta:
        body.meta && typeof body.meta === "object"
          ? (body.meta as Meta)
          : ({} as Meta),
      sort_order:
        typeof body.sort_order === "number" ? Math.trunc(body.sort_order) : 100,
      is_enabled: true,
    };

    const db = createServiceClient();
    const { data, error } = await db
      .from("pricing_packages")
      .insert(insert)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        return Response.json(
          { error: "ეს კოდი უკვე გამოყენებულია ამ კატეგორიაში" },
          { status: 409 },
        );
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ package: data });
  } catch (error) {
    console.error("POST /api/admin/pricing-packages failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

export const runtime = "nodejs";

const PAGE_SIZE = 10;

type ServiceCategory = Database["public"]["Enums"]["service_category"];

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category") ?? "all";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const db = createServiceClient();

  if (category === "transport" || category === "services") {
    const serviceCategories: ServiceCategory[] =
      category === "transport" ? ["transport"] : ["cleaning", "handyman"];
    const { data, error, count } = await db
      .from("services")
      .select("*, owner:profiles!services_owner_id_fkey(display_name)", {
        count: "exact",
      })
      .in("category", serviceCategories)
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({
      rows: data ?? [],
      total: count ?? 0,
      kind: "service",
    });
  }

  const { data, error, count } = await db
    .from("properties")
    .select("*, owner:profiles!properties_owner_id_fkey(display_name)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    rows: data ?? [],
    total: count ?? 0,
    kind: "property",
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    kind?: "property" | "service";
    status?: "active" | "blocked" | "pending" | "draft";
    is_new?: boolean;
  } | null;
  if (!body?.id || !body.kind) {
    return Response.json({ error: "id and kind required" }, { status: 400 });
  }
  if (body.status === undefined && body.is_new === undefined) {
    return Response.json(
      { error: "status or is_new required" },
      { status: 400 },
    );
  }
  if (body.is_new !== undefined && body.kind !== "service") {
    return Response.json(
      { error: "is_new only applies to services" },
      { status: 400 },
    );
  }
  const db = createServiceClient();
  const table = body.kind === "property" ? "properties" : "services";
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.is_new !== undefined) patch.is_new = body.is_new;
  const { error } = await db.from(table).update(patch).eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

export const runtime = "nodejs";

const FETCH_LIMIT = 50;

type ServiceCategory = Database["public"]["Enums"]["service_category"];

// Per-filter service categories; "all" and "property" are handled separately.
const SERVICE_CATEGORY_MAP: Record<string, ServiceCategory[]> = {
  transport: ["transport"],
  services: ["cleaning", "handyman"],
  food: ["food"],
  entertainment: ["entertainment"],
  employment: ["employment"],
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category") ?? "all";
  const db = createServiceClient();

  const propertiesQuery = () =>
    db
      .from("properties")
      .select("*, owner:profiles!properties_owner_id_fkey(display_name)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT);

  const servicesQuery = (categories?: ServiceCategory[]) => {
    let q = db
      .from("services")
      .select("*, owner:profiles!services_owner_id_fkey(display_name)", {
        count: "exact",
      });
    if (categories) q = q.in("category", categories);
    return q.order("created_at", { ascending: false }).limit(FETCH_LIMIT);
  };

  if (category === "property") {
    const { data, error, count } = await propertiesQuery();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({
      rows: (data ?? []).map((row) => ({ ...row, kind: "property" })),
      total: count ?? 0,
    });
  }

  if (category in SERVICE_CATEGORY_MAP) {
    const { data, error, count } = await servicesQuery(
      SERVICE_CATEGORY_MAP[category],
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({
      rows: (data ?? []).map((row) => ({ ...row, kind: "service" })),
      total: count ?? 0,
    });
  }

  // "all": newest properties AND services across the whole platform, merged.
  const [propsRes, servicesRes] = await Promise.all([
    propertiesQuery(),
    servicesQuery(),
  ]);
  if (propsRes.error || servicesRes.error) {
    const message =
      propsRes.error?.message ?? servicesRes.error?.message ?? "error";
    return Response.json({ error: message }, { status: 500 });
  }

  const rows = [
    ...(propsRes.data ?? []).map((row) => ({ ...row, kind: "property" })),
    ...(servicesRes.data ?? []).map((row) => ({ ...row, kind: "service" })),
  ].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return Response.json({
    rows,
    total: (propsRes.count ?? 0) + (servicesRes.count ?? 0),
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

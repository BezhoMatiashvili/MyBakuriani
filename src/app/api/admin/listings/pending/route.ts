import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/types/database";

export const runtime = "nodejs";

type OwnerSlim = Pick<Tables<"profiles">, "id" | "display_name" | "phone">;

export type PendingListing = {
  kind: "property" | "service";
  category:
    | "rental"
    | "sale"
    | "food"
    | "transport"
    | "entertainment"
    | "employment"
    | "service";
  id: string;
  title: string;
  owner: OwnerSlim | null;
  created_at: string | null;
  preview_url: string;
};

function servicePreviewUrl(
  category: Tables<"services">["category"],
  id: string,
): { url: string; bucket: PendingListing["category"] } {
  switch (category) {
    case "food":
      return { url: `/food/${id}?preview=1`, bucket: "food" };
    case "transport":
      return { url: `/transport/${id}?preview=1`, bucket: "transport" };
    case "entertainment":
      return {
        url: `/entertainment/${id}?preview=1`,
        bucket: "entertainment",
      };
    case "employment":
      return { url: `/employment/${id}?preview=1`, bucket: "employment" };
    default:
      // handyman, cleaning — fall back to /services/[id]
      return { url: `/services/${id}?preview=1`, bucket: "service" };
  }
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();

  const [propertiesRes, servicesRes] = await Promise.all([
    db
      .from("properties")
      .select(
        "id, title, owner_id, is_for_sale, created_at, profiles:profiles!properties_owner_id_fkey(id, display_name, phone)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    db
      .from("services")
      .select(
        "id, title, category, owner_id, created_at, profiles:profiles!services_owner_id_fkey(id, display_name, phone)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  if (propertiesRes.error) {
    return Response.json(
      { error: propertiesRes.error.message },
      { status: 500 },
    );
  }
  if (servicesRes.error) {
    return Response.json({ error: servicesRes.error.message }, { status: 500 });
  }

  const properties: PendingListing[] = (propertiesRes.data ?? []).map((row) => {
    const isSale = Boolean(row.is_for_sale);
    return {
      kind: "property" as const,
      category: isSale ? ("sale" as const) : ("rental" as const),
      id: row.id,
      title: row.title ?? "—",
      owner: (row.profiles as OwnerSlim | null) ?? null,
      created_at: row.created_at,
      preview_url: isSale
        ? `/sales/${row.id}?preview=1`
        : `/apartments/${row.id}?preview=1`,
    };
  });

  const services: PendingListing[] = (servicesRes.data ?? []).map((row) => {
    const { url, bucket } = servicePreviewUrl(row.category, row.id);
    return {
      kind: "service" as const,
      category: bucket,
      id: row.id,
      title: row.title ?? "—",
      owner: (row.profiles as OwnerSlim | null) ?? null,
      created_at: row.created_at,
      preview_url: url,
    };
  });

  const items = [...properties, ...services].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return Response.json({ items });
}

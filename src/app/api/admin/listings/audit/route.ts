import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/types/database";

export const runtime = "nodejs";

export type AuditOwner = {
  id: string;
  display_name: string | null;
  phone: string | null;
  personal_id: string | null;
  is_verified: boolean | null;
  email: string | null;
};

export type AuditPropertyListing = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  type: Tables<"properties">["type"] | null;
  rooms: number | null;
  bathrooms: number | null;
  area_sqm: number | null;
  capacity: number | null;
  photos: string[];
  cadastral_code: string | null;
  price_per_night: number | null;
  sale_price: number | null;
  currency: string | null;
  status: Tables<"properties">["status"] | null;
  created_at: string | null;
};

export type AuditServiceListing = {
  id: string;
  title: string;
  category: Tables<"services">["category"];
  description: string | null;
  location: string | null;
  phone: string | null;
  photos: string[];
  price: number | null;
  price_unit: string | null;
  currency: string | null;
  status: Tables<"services">["status"] | null;
  created_at: string | null;
  cuisine_type: string | null;
  route: string | null;
  salary_range: string | null;
  position: string | null;
};

export type AuditPayload =
  | {
      kind: "property";
      category: "rental" | "sale";
      owner: AuditOwner;
      listing: AuditPropertyListing;
    }
  | {
      kind: "service";
      owner: AuditOwner;
      listing: AuditServiceListing;
    };

async function fetchEmail(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");

  if (!id || (kind !== "property" && kind !== "service")) {
    return Response.json(
      { error: "kind (property|service) + id required" },
      { status: 400 },
    );
  }

  const db = createServiceClient();

  if (kind === "property") {
    const { data: row, error } = await db
      .from("properties")
      .select(
        "id, title, description, location, type, rooms, bathrooms, area_sqm, capacity, photos, cadastral_code, price_per_night, sale_price, currency, status, created_at, is_for_sale, owner_id, profiles:profiles!properties_owner_id_fkey(id, display_name, phone, personal_id, is_verified)",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!row) return Response.json({ error: "not found" }, { status: 404 });

    const profile = row.profiles as {
      id: string;
      display_name: string | null;
      phone: string | null;
      personal_id: string | null;
      is_verified: boolean | null;
    } | null;

    const email = await fetchEmail(db, row.owner_id);

    const payload: AuditPayload = {
      kind: "property",
      category: row.is_for_sale ? "sale" : "rental",
      owner: {
        id: row.owner_id,
        display_name: profile?.display_name ?? null,
        phone: profile?.phone ?? null,
        personal_id: profile?.personal_id ?? null,
        is_verified: profile?.is_verified ?? null,
        email,
      },
      listing: {
        id: row.id,
        title: row.title,
        description: row.description,
        location: row.location,
        type: row.type,
        rooms: row.rooms,
        bathrooms: row.bathrooms,
        area_sqm: row.area_sqm,
        capacity: row.capacity,
        photos: row.photos ?? [],
        cadastral_code: row.cadastral_code,
        price_per_night: row.price_per_night,
        sale_price: row.sale_price,
        currency: row.currency,
        status: row.status,
        created_at: row.created_at,
      },
    };
    return Response.json(payload);
  }

  // kind === "service"
  const { data: row, error } = await db
    .from("services")
    .select(
      "id, title, category, description, location, phone, photos, price, price_unit, currency, status, created_at, cuisine_type, route, salary_range, position, owner_id, profiles:profiles!services_owner_id_fkey(id, display_name, phone, personal_id, is_verified)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const profile = row.profiles as {
    id: string;
    display_name: string | null;
    phone: string | null;
    personal_id: string | null;
    is_verified: boolean | null;
  } | null;

  const email = await fetchEmail(db, row.owner_id);

  const payload: AuditPayload = {
    kind: "service",
    owner: {
      id: row.owner_id,
      display_name: profile?.display_name ?? null,
      phone: profile?.phone ?? null,
      personal_id: profile?.personal_id ?? null,
      is_verified: profile?.is_verified ?? null,
      email,
    },
    listing: {
      id: row.id,
      title: row.title,
      category: row.category,
      description: row.description,
      location: row.location,
      phone: row.phone,
      photos: row.photos ?? [],
      price: row.price,
      price_unit: row.price_unit,
      currency: row.currency,
      status: row.status,
      created_at: row.created_at,
      cuisine_type: row.cuisine_type,
      route: row.route,
      salary_range: row.salary_range,
      position: row.position,
    },
  };
  return Response.json(payload);
}

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

export type AuditPropertyListing = Tables<"properties">;
export type AuditServiceListing = Tables<"services">;

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

type ProfileSlice = {
  id: string;
  display_name: string | null;
  phone: string | null;
  personal_id: string | null;
  is_verified: boolean | null;
};

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
        "*, profiles:profiles!properties_owner_id_fkey(id, display_name, phone, personal_id, is_verified)",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!row) return Response.json({ error: "not found" }, { status: 404 });

    const { profiles, ...listingRow } = row as Tables<"properties"> & {
      profiles: ProfileSlice | null;
    };

    const email = await fetchEmail(db, listingRow.owner_id);

    const payload: AuditPayload = {
      kind: "property",
      category: listingRow.is_for_sale ? "sale" : "rental",
      owner: {
        id: listingRow.owner_id,
        display_name: profiles?.display_name ?? null,
        phone: profiles?.phone ?? null,
        personal_id: profiles?.personal_id ?? null,
        is_verified: profiles?.is_verified ?? null,
        email,
      },
      listing: listingRow,
    };
    return Response.json(payload);
  }

  // kind === "service"
  const { data: row, error } = await db
    .from("services")
    .select(
      "*, profiles:profiles!services_owner_id_fkey(id, display_name, phone, personal_id, is_verified)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const { profiles, ...listingRow } = row as Tables<"services"> & {
    profiles: ProfileSlice | null;
  };

  const email = await fetchEmail(db, listingRow.owner_id);

  const payload: AuditPayload = {
    kind: "service",
    owner: {
      id: listingRow.owner_id,
      display_name: profiles?.display_name ?? null,
      phone: profiles?.phone ?? null,
      personal_id: profiles?.personal_id ?? null,
      is_verified: profiles?.is_verified ?? null,
      email,
    },
    listing: listingRow,
  };
  return Response.json(payload);
}

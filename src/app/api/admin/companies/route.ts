import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/types/database";

export const runtime = "nodejs";

type OwnerSlim = Pick<Tables<"profiles">, "id" | "display_name" | "phone">;

export type AdminCompany = {
  id: string;
  brand_name: string;
  legal_name: string;
  identification_code: string;
  org_type: string;
  company_type: string;
  logo_url: string | null;
  created_at: string | null;
  status: "pending" | "active" | "rejected";
  owner: OwnerSlim | null;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();
  const { data, error } = await db
    .from("organizations")
    .select(
      "id, brand_name, legal_name, identification_code, org_type, company_type, logo_url, created_at, status, profiles:profiles!organizations_owner_id_fkey(id, display_name, phone)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const items: AdminCompany[] = (data ?? []).map((row) => ({
    id: row.id,
    brand_name: row.brand_name,
    legal_name: row.legal_name,
    identification_code: row.identification_code,
    org_type: row.org_type,
    company_type: row.company_type,
    logo_url: row.logo_url,
    created_at: row.created_at,
    status: row.status as AdminCompany["status"],
    owner: (row.profiles as OwnerSlim | null) ?? null,
  }));

  return Response.json({ items });
}

import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/utils/uuid";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";

export const runtime = "nodejs";

export type AdminSearchResult = {
  kind: "client" | "property" | "service" | "company";
  id: string;
  label: string;
  sublabel: string | null;
  phone?: string | null; // client
  type?: string | null; // property
  is_for_sale?: boolean | null; // property
  category?: string; // service
};

// Global admin search across clients / properties / services / companies.
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = sanitizeQuery(url.searchParams.get("q") ?? "");
  if (q.length < 2) return Response.json({ results: [] });

  const digits = q.replace(/\D/g, "");
  const uuid = UUID_RE.test(q) ? q : null;

  const db = createServiceClient();

  const profileFilters = [`display_name.ilike.*${q}*`, `phone.ilike.*${q}*`];
  if (digits.length >= 3) profileFilters.push(`phone.ilike.*${digits}*`);
  if (uuid) profileFilters.push(`id.eq.${uuid}`);

  const propertyFilters = [`title.ilike.*${q}*`];
  if (uuid) propertyFilters.push(`id.eq.${uuid}`);

  const serviceFilters = [`title.ilike.*${q}*`];
  if (uuid) serviceFilters.push(`id.eq.${uuid}`);

  const orgFilters = [
    `brand_name.ilike.*${q}*`,
    `legal_name.ilike.*${q}*`,
    `identification_code.ilike.*${q}*`,
  ];
  if (digits.length >= 3) orgFilters.push(`phone.ilike.*${digits}*`);
  if (uuid) orgFilters.push(`id.eq.${uuid}`);

  const [profiles, properties, services, organizations] = await Promise.all([
    db
      .from("profiles")
      .select("id, display_name, phone")
      .or(profileFilters.join(","))
      .limit(5),
    db
      .from("properties")
      .select("id, title, type, is_for_sale")
      .or(propertyFilters.join(","))
      .limit(5),
    db
      .from("services")
      .select("id, title, category")
      .or(serviceFilters.join(","))
      .limit(5),
    db
      .from("organizations")
      .select("id, brand_name, legal_name, identification_code, phone")
      .or(orgFilters.join(","))
      .limit(5),
  ]);
  const firstError =
    profiles.error ?? properties.error ?? services.error ?? organizations.error;
  if (firstError) {
    return Response.json({ error: firstError.message }, { status: 500 });
  }

  const results: AdminSearchResult[] = [
    ...(profiles.data ?? []).map((p) => ({
      kind: "client" as const,
      id: p.id,
      label: p.display_name ?? p.phone ?? p.id,
      sublabel: p.phone,
      phone: p.phone,
    })),
    ...(properties.data ?? []).map((p) => ({
      kind: "property" as const,
      id: p.id,
      label: p.title,
      sublabel: null,
      type: p.type,
      is_for_sale: p.is_for_sale,
    })),
    ...(services.data ?? []).map((s) => ({
      kind: "service" as const,
      id: s.id,
      label: s.title,
      sublabel: null,
      category: s.category,
    })),
    ...(organizations.data ?? []).map((o) => ({
      kind: "company" as const,
      id: o.id,
      label: o.brand_name || (o.legal_name ?? o.id),
      sublabel: o.identification_code ?? o.phone,
    })),
  ];
  return Response.json({ results });
}

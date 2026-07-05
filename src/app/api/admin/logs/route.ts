import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/utils/uuid";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type AuditEventRow = {
  id: string;
  occurred_at: string;
  table_name: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "LOGIN";
  record_id: string | null;
  actor_id: string | null;
  actor_source: "user" | "admin" | "system";
  subject_user_id: string | null;
  property_id: string | null;
  service_id: string | null;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

export type AuditEvent = AuditEventRow & {
  actor_name: string | null;
  subject_name: string | null;
  property_title: string | null;
  service_title: string | null;
};

export type AuditSearchResult = {
  kind: "user" | "property" | "service";
  id: string;
  label: string;
  sublabel: string | null;
};

// Admin audit log. Two modes:
//   ?q=...                       -> entity search (users / properties / services)
//   ?user|property|service|...   -> event timeline with keyset pagination
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const db = createServiceClient();

  const q = sanitizeQuery(url.searchParams.get("q") ?? "");
  if (q.length >= 2) {
    const [profiles, properties, services] = await Promise.all([
      db
        .from("profiles")
        .select("id, display_name, phone")
        .or(`display_name.ilike.*${q}*,phone.ilike.*${q}*`)
        .limit(8),
      db
        .from("properties")
        .select("id, title")
        .ilike("title", `%${q}%`)
        .limit(8),
      db.from("services").select("id, title").ilike("title", `%${q}%`).limit(8),
    ]);
    const firstError = profiles.error ?? properties.error ?? services.error;
    if (firstError) {
      return Response.json({ error: firstError.message }, { status: 500 });
    }
    const results: AuditSearchResult[] = [
      ...(profiles.data ?? []).map((p) => ({
        kind: "user" as const,
        id: p.id,
        label: p.display_name ?? p.phone ?? p.id,
        sublabel: p.phone,
      })),
      ...(properties.data ?? []).map((p) => ({
        kind: "property" as const,
        id: p.id,
        label: p.title,
        sublabel: null,
      })),
      ...(services.data ?? []).map((s) => ({
        kind: "service" as const,
        id: s.id,
        label: s.title,
        sublabel: null,
      })),
    ];
    return Response.json({ results });
  }

  // --- timeline mode ---
  const user = url.searchParams.get("user");
  const property = url.searchParams.get("property");
  const service = url.searchParams.get("service");
  const table = url.searchParams.get("table");
  const op = url.searchParams.get("op");
  for (const [name, value] of [
    ["user", user],
    ["property", property],
    ["service", service],
  ] as const) {
    if (value && !UUID_RE.test(value)) {
      return Response.json(
        { error: `${name} must be a uuid` },
        { status: 400 },
      );
    }
  }

  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  let query = db
    .from("audit_logs")
    .select(
      "id, occurred_at, table_name, operation, record_id, actor_id, actor_source, subject_user_id, property_id, service_id, changed_fields, old_values, new_values",
    )
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (user) query = query.eq("subject_user_id", user);
  if (property) query = query.eq("property_id", property);
  if (service) query = query.eq("service_id", service);
  if (table) query = query.eq("table_name", table);
  if (op) query = query.eq("operation", op);

  // Keyset cursor "occurred_at|id": rows written in one transaction share now(),
  // so pagination must tiebreak on id or it would skip/duplicate rows.
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    const [ts, id] = cursor.split("|");
    if (!ts || !id || !UUID_RE.test(id) || Number.isNaN(Date.parse(ts))) {
      return Response.json({ error: "invalid cursor" }, { status: 400 });
    }
    query = query.or(
      `occurred_at.lt."${ts}",and(occurred_at.eq."${ts}",id.lt."${id}")`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as AuditEventRow[];

  // Enrich ids -> display names/titles in three batched lookups.
  const userIds = new Set<string>();
  const propertyIds = new Set<string>();
  const serviceIds = new Set<string>();
  for (const row of rows) {
    if (row.actor_id) userIds.add(row.actor_id);
    if (row.subject_user_id) userIds.add(row.subject_user_id);
    if (row.property_id) propertyIds.add(row.property_id);
    if (row.service_id) serviceIds.add(row.service_id);
  }
  const [profileRows, propertyRows, serviceRows] = await Promise.all([
    userIds.size
      ? db
          .from("profiles")
          .select("id, display_name")
          .in("id", [...userIds])
      : Promise.resolve({
          data: [] as { id: string; display_name: string | null }[],
        }),
    propertyIds.size
      ? db
          .from("properties")
          .select("id, title")
          .in("id", [...propertyIds])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    serviceIds.size
      ? db
          .from("services")
          .select("id, title")
          .in("id", [...serviceIds])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const names = new Map(
    (profileRows.data ?? []).map((p) => [p.id, p.display_name]),
  );
  const propertyTitles = new Map(
    (propertyRows.data ?? []).map((p) => [p.id, p.title]),
  );
  const serviceTitles = new Map(
    (serviceRows.data ?? []).map((s) => [s.id, s.title]),
  );

  const events: AuditEvent[] = rows.map((row) => ({
    ...row,
    actor_name: (row.actor_id && names.get(row.actor_id)) || null,
    subject_name:
      (row.subject_user_id && names.get(row.subject_user_id)) || null,
    property_title:
      (row.property_id && propertyTitles.get(row.property_id)) || null,
    service_title:
      (row.service_id && serviceTitles.get(row.service_id)) || null,
  }));

  const last = rows.length === limit ? rows[rows.length - 1] : null;
  const nextCursor = last ? `${last.occurred_at}|${last.id}` : null;

  return Response.json({ events, nextCursor });
}

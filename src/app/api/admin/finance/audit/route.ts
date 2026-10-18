import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  financeErrorResponse,
  isUuidValue,
  jsonError,
} from "@/lib/finance/server/http";

export const runtime = "nodejs";

// GET /api/admin/finance/audit?table=<finance table>&id=<uuid> — one finance
// record's audit log (spec §14): every insert and update trg_audit_row wrote,
// with the admin who made it (C42). Settings have a boolean key, which the
// audit trigger records as no id, so their history is the table's.

const TABLES = [
  "finance_entries",
  "finance_expenses",
  "finance_documents",
  "invoices",
  "invoice_templates",
  "finance_settings",
] as const;

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const table = params.get("table");
  const id = params.get("id") ?? "";
  if (!TABLES.includes(table as (typeof TABLES)[number])) {
    return jsonError("invalid_request", 400);
  }
  if (table !== "finance_settings" && !isUuidValue(id)) {
    return jsonError("invalid_request", 400);
  }
  const db = createServiceClient();
  try {
    let query = db
      .from("audit_logs")
      .select(
        "id, occurred_at, operation, actor_id, actor_source, changed_fields, old_values, new_values",
      )
      .eq("table_name", table as string)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (table !== "finance_settings") query = query.eq("record_id", id);
    const { data, error } = await query;
    if (error) throw error;
    const actorIds = [
      ...new Set((data ?? []).map((e) => e.actor_id).filter(Boolean)),
    ] as string[];
    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: people, error: peopleError } = await db
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      if (peopleError) throw peopleError;
      for (const p of people ?? []) names.set(p.id, p.display_name ?? p.id);
    }
    return Response.json({
      events: (data ?? []).map((e) => ({
        ...e,
        actor_name: e.actor_id ? (names.get(e.actor_id) ?? null) : null,
      })),
    });
  } catch (error) {
    return financeErrorResponse(error, "audit");
  }
}

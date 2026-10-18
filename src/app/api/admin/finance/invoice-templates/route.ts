import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  financeErrorResponse,
  jsonError,
  readJsonObject,
  requireText,
} from "@/lib/finance/server/http";
import { readTemplatePayload } from "@/lib/finance/server/invoices";

export const runtime = "nodejs";

// Invoice templates (spec "Finances → Invoices → Templates", C42): presets
// of invoice fields. They are not financial records and may be deleted.

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { data, error } = await createServiceClient()
    .from("invoice_templates")
    .select("id, name, payload, created_at, updated_at")
    .order("name");
  if (error) return financeErrorResponse(error, "templates list");
  return Response.json({ rows: data ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);
  try {
    const { data, error } = await createServiceClient(guard.admin.userId)
      .from("invoice_templates")
      .insert({
        name: requireText(body.name, "name", 120),
        payload: readTemplatePayload(body.payload),
        created_by: guard.admin.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "template create");
  }
}
